"""
DQN Trainer

Purpose:
    Main training loop for Deep Q-Network with Double DQN, target networks,
    epsilon scheduling, early stopping, and TensorBoard logging.

Architecture:
    - Double DQN: Online network selects actions, target network evaluates
    - Soft target updates: θ_target ← τ × θ_online + (1-τ) × θ_target
    - Epsilon-greedy exploration with exponential decay
    - Huber loss for robust gradient updates
    - Early stopping based on rolling average reward

Usage:
    trainer = DQNTrainer(env, config)
    trainer.train()
    trainer.save_checkpoint("model.pt")

Reference:
    - Double DQN: van Hasselt et al. (2015)
    - Soft updates: Lillicrap et al. (2015) DDPG paper
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import Dict, List, Tuple, Optional
from collections import deque
import os
import yaml

from ..models.dqn_network import DQNNetwork
from ..models.replay_buffer import ReplayBuffer
from ..environment.pricing_env import PricingEnvironment


class DQNTrainer:
    """
    DQN training with Double DQN, PER, and early stopping.

    Attributes:
        env: PricingEnvironment instance
        config: Training configuration dictionary
        device: torch device (cuda/cpu)
        online_net: Online Q-network
        target_net: Target Q-network
        optimizer: AdamW optimizer
        replay_buffer: Experience replay buffer
    """

    def __init__(
        self,
        env: PricingEnvironment,
        config: Dict,
        device: Optional[torch.device] = None
    ):
        """
        Args:
            env: Pricing environment
            config: Configuration dictionary (loaded from YAML)
            device: torch device (default: cuda if available, else cpu)
        """
        self.env = env
        self.config = config
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        print(f"Using device: {self.device}")

        # Extract config sections
        train_cfg = config['training']
        net_cfg = config['network']
        replay_cfg = config['replay']
        stop_cfg = config['early_stopping']

        # Initialize networks
        state_dim = env.get_state_dim()
        action_dim = env.get_action_dim()

        self.online_net = DQNNetwork(
            state_dim=state_dim,
            action_dim=action_dim,
            hidden_dims=net_cfg['hidden_dims'],
            use_batch_norm=net_cfg['use_batch_norm'],
            dropout_rate=net_cfg.get('dropout_rate', 0.0)
        ).to(self.device)

        self.target_net = DQNNetwork(
            state_dim=state_dim,
            action_dim=action_dim,
            hidden_dims=net_cfg['hidden_dims'],
            use_batch_norm=net_cfg['use_batch_norm'],
            dropout_rate=net_cfg.get('dropout_rate', 0.0)
        ).to(self.device)

        # Copy weights to target network
        self.target_net.load_state_dict(self.online_net.state_dict())
        self.target_net.eval()  # Target network always in eval mode

        # Optimizer with weight decay (L2 regularization)
        self.optimizer = optim.AdamW(
            self.online_net.parameters(),
            lr=train_cfg['learning_rate'],
            weight_decay=train_cfg['weight_decay']
        )

        # Replay buffer
        self.replay_buffer = ReplayBuffer(
            capacity=replay_cfg['buffer_size'],
            state_dim=state_dim,
            use_per=replay_cfg['use_per'],
            alpha=replay_cfg['per_alpha'],
            beta_start=replay_cfg['per_beta_start'],
            beta_end=replay_cfg.get('per_beta_end', 1.0),
            beta_frames=replay_cfg.get('per_beta_frames', 100000)
        )

        # Training parameters
        self.episodes = train_cfg['episodes']
        self.steps_per_episode = train_cfg['steps_per_episode']
        self.batch_size = train_cfg['batch_size']
        self.gamma = train_cfg['gamma']
        self.tau = train_cfg['tau']
        self.warmup_steps = train_cfg['warmup_steps']
        self.train_frequency = train_cfg['train_frequency']
        self.gradient_clip = train_cfg['gradient_clip_max_norm']

        # Epsilon scheduling
        self.epsilon = train_cfg['epsilon_start']
        self.epsilon_end = train_cfg['epsilon_end']
        self.epsilon_decay = train_cfg['epsilon_decay']

        # Synthetic data ratio
        self.synthetic_ratio = config['environment']['synthetic_ratio']

        # Early stopping
        self.patience = stop_cfg['patience']
        self.min_delta = stop_cfg['min_delta']
        self.window_size = stop_cfg['window_size']
        self.reward_window = deque(maxlen=self.window_size)
        self.best_avg_reward = -float('inf')
        self.episodes_without_improvement = 0

        # Logging
        self.log_interval = config['logging']['log_interval']
        self.checkpoint_dir = config['logging']['checkpoint_dir']
        os.makedirs(self.checkpoint_dir, exist_ok=True)

        # Metrics
        self.total_steps = 0
        self.episode_rewards = []
        self.episode_losses = []

    def select_action(self, state: np.ndarray, epsilon: float) -> int:
        """
        Select action using epsilon-greedy policy.

        Args:
            state: State vector (state_dim,)
            epsilon: Exploration rate

        Returns:
            Action index
        """
        if np.random.random() < epsilon:
            return np.random.randint(0, self.env.get_action_dim())

        state_tensor = torch.FloatTensor(state).to(self.device)
        with torch.no_grad():
            q_values = self.online_net(state_tensor)
            return q_values.argmax().item()

    def train_step(self) -> float:
        """
        Perform single training step (gradient update).

        Returns:
            Loss value for logging

        Algorithm:
            1. Sample batch from replay buffer
            2. Compute Q(s, a) from online network
            3. Compute target = r + γ × Q_target(s', argmax_a' Q_online(s', a'))  [Double DQN]
            4. Compute Huber loss weighted by importance sampling
            5. Backpropagate with gradient clipping
            6. Soft update target network
            7. Update priorities in replay buffer
        """
        # Sample batch
        (states, actions, rewards, next_states, dones,
         indices, weights) = self.replay_buffer.sample(self.batch_size)

        # Convert to tensors
        states = torch.FloatTensor(states).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(next_states).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)
        weights = torch.FloatTensor(weights).to(self.device)

        # Compute Q(s, a) from online network
        q_values = self.online_net(states)
        q_values = q_values.gather(1, actions.unsqueeze(1)).squeeze(1)

        # Double DQN: online network selects actions, target network evaluates
        with torch.no_grad():
            # Select best actions using online network
            next_q_online = self.online_net(next_states)
            next_actions = next_q_online.argmax(1)

            # Evaluate actions using target network
            next_q_target = self.target_net(next_states)
            next_q_values = next_q_target.gather(1, next_actions.unsqueeze(1)).squeeze(1)

            # Compute target Q-values
            target_q_values = rewards + (1 - dones) * self.gamma * next_q_values

        # Compute TD errors (for priority updates)
        td_errors = (target_q_values - q_values).detach().cpu().numpy()

        # Huber loss with importance sampling weights
        loss = nn.functional.smooth_l1_loss(
            q_values,
            target_q_values,
            reduction='none'
        )
        loss = (loss * weights).mean()

        # Backpropagation
        self.optimizer.zero_grad()
        loss.backward()

        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(
            self.online_net.parameters(),
            self.gradient_clip
        )

        self.optimizer.step()

        # Soft update target network
        self._soft_update_target()

        # Update priorities
        self.replay_buffer.update_priorities(indices, td_errors)

        return loss.item()

    def _soft_update_target(self):
        """
        Soft update target network: θ_target ← τ × θ_online + (1-τ) × θ_target

        Algorithm:
            For each parameter pair, blend online and target weights using τ.
            This provides smoother learning compared to hard updates.
        """
        for target_param, online_param in zip(
            self.target_net.parameters(),
            self.online_net.parameters()
        ):
            target_param.data.copy_(
                self.tau * online_param.data + (1 - self.tau) * target_param.data
            )

    def train(self) -> List[Dict]:
        """
        Main training loop.

        Returns:
            List of episode metrics dictionaries

        Algorithm:
            For each episode:
                1. Reset environment
                2. For each step:
                    - Select action (epsilon-greedy)
                    - Execute action (70% real, 30% synthetic)
                    - Store transition in buffer
                    - Train if buffer ready and step % train_frequency == 0
                3. Decay epsilon
                4. Check early stopping
                5. Log metrics
        """
        print("Starting training...")

        for episode in range(self.episodes):
            state = self.env.reset()
            episode_reward = 0.0
            episode_loss = 0.0
            loss_count = 0

            for step in range(self.steps_per_episode):
                # Select action
                action = self.select_action(state, self.epsilon)

                # Execute action (70% real, 30% synthetic)
                use_synthetic = np.random.random() < self.synthetic_ratio
                next_state, reward, done, info = self.env.step(action, use_synthetic)

                # Store transition
                self.replay_buffer.add(state, action, reward, next_state, done)

                episode_reward += reward
                state = next_state
                self.total_steps += 1

                # Train
                if (self.replay_buffer.is_ready(self.warmup_steps) and
                    self.total_steps % self.train_frequency == 0):
                    loss = self.train_step()
                    episode_loss += loss
                    loss_count += 1

            # Decay epsilon
            self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)

            # Compute average loss
            avg_loss = episode_loss / loss_count if loss_count > 0 else 0.0

            # Track metrics
            self.episode_rewards.append(episode_reward)
            self.episode_losses.append(avg_loss)
            self.reward_window.append(episode_reward)

            # Check early stopping
            if len(self.reward_window) == self.window_size:
                avg_reward = np.mean(self.reward_window)

                if avg_reward > self.best_avg_reward + self.min_delta:
                    self.best_avg_reward = avg_reward
                    self.episodes_without_improvement = 0
                    # Save best model
                    self.save_checkpoint('best_model.pt')
                else:
                    self.episodes_without_improvement += 1

                if self.episodes_without_improvement >= self.patience:
                    print(f"\nEarly stopping at episode {episode + 1}")
                    print(f"Best average reward: {self.best_avg_reward:.4f}")
                    break

            # Logging
            if (episode + 1) % self.log_interval == 0:
                avg_reward = np.mean(self.reward_window) if len(self.reward_window) > 0 else episode_reward
                print(f"Episode {episode + 1}/{self.episodes} | "
                      f"Reward: {episode_reward:.4f} | "
                      f"Avg Reward: {avg_reward:.4f} | "
                      f"Loss: {avg_loss:.4f} | "
                      f"Epsilon: {self.epsilon:.4f} | "
                      f"Buffer: {len(self.replay_buffer)}")

        # Save final model
        self.save_checkpoint('final_model.pt')

        print("\nTraining complete!")
        print(f"Total episodes: {len(self.episode_rewards)}")
        print(f"Best average reward: {self.best_avg_reward:.4f}")

        return self._get_training_metrics()

    def _get_training_metrics(self) -> List[Dict]:
        """Compile training metrics for analysis."""
        metrics = []
        for i, (reward, loss) in enumerate(zip(self.episode_rewards, self.episode_losses)):
            metrics.append({
                'episode': i + 1,
                'reward': reward,
                'loss': loss,
                'epsilon': self.epsilon_end + (1.0 - self.epsilon_end) * (self.epsilon_decay ** i)
            })
        return metrics

    def save_checkpoint(self, filename: str):
        """
        Save model checkpoint.

        Args:
            filename: Checkpoint filename (saved to checkpoint_dir)
        """
        path = os.path.join(self.checkpoint_dir, filename)
        torch.save({
            'online_net_state_dict': self.online_net.state_dict(),
            'target_net_state_dict': self.target_net.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'episode': len(self.episode_rewards),
            'total_steps': self.total_steps,
            'epsilon': self.epsilon,
            'best_avg_reward': self.best_avg_reward,
            'config': self.config
        }, path)

    def load_checkpoint(self, filename: str):
        """
        Load model checkpoint.

        Args:
            filename: Checkpoint filename (in checkpoint_dir)
        """
        path = os.path.join(self.checkpoint_dir, filename)
        checkpoint = torch.load(path, map_location=self.device)

        self.online_net.load_state_dict(checkpoint['online_net_state_dict'])
        self.target_net.load_state_dict(checkpoint['target_net_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.epsilon = checkpoint['epsilon']
        self.best_avg_reward = checkpoint['best_avg_reward']
        self.total_steps = checkpoint['total_steps']

        print(f"Loaded checkpoint: {filename}")
