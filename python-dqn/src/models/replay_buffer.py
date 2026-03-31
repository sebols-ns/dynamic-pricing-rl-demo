"""
Prioritized Experience Replay Buffer

Purpose:
    Stores transitions and samples mini-batches for DQN training.
    Implements Prioritized Experience Replay (PER) to focus learning on
    high-error transitions (surprising outcomes).

Architecture:
    - Circular buffer with fixed capacity (100K transitions)
    - Priority queue based on |TD error|^α (α=0.6)
    - Importance sampling weights: (1 / (N × P(i)))^β (β: 0.4 → 1.0)
    - Pre-allocated NumPy arrays for efficiency

Usage:
    buffer = ReplayBuffer(capacity=100000, use_per=True)
    buffer.add(state, action, reward, next_state, done)
    batch = buffer.sample(batch_size=64)
    buffer.update_priorities(indices, td_errors)

Reference:
    Schaul et al. (2015) "Prioritized Experience Replay"
"""

import numpy as np
from typing import Tuple, Optional


class ReplayBuffer:
    """
    Replay buffer with optional prioritized sampling.

    Attributes:
        capacity: Maximum number of transitions to store
        use_per: Whether to use prioritized experience replay
        alpha: Priority exponent (importance of TD error)
        beta: Importance sampling exponent (annealed during training)
    """

    def __init__(
        self,
        capacity: int,
        state_dim: int,
        use_per: bool = True,
        alpha: float = 0.6,
        beta_start: float = 0.4,
        beta_end: float = 1.0,
        beta_frames: int = 100000
    ):
        """
        Args:
            capacity: Maximum buffer size
            state_dim: Dimensionality of state vectors
            use_per: Enable prioritized experience replay
            alpha: Priority exponent (0 = uniform, 1 = full prioritization)
            beta_start: Initial importance sampling weight
            beta_end: Final importance sampling weight
            beta_frames: Number of frames to anneal beta from start to end
        """
        self.capacity = capacity
        self.state_dim = state_dim
        self.use_per = use_per
        self.alpha = alpha
        self.beta = beta_start
        self.beta_start = beta_start
        self.beta_end = beta_end
        self.beta_frames = beta_frames

        # Pre-allocate arrays for efficiency
        self.states = np.zeros((capacity, state_dim), dtype=np.float32)
        self.actions = np.zeros(capacity, dtype=np.int32)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.next_states = np.zeros((capacity, state_dim), dtype=np.float32)
        self.dones = np.zeros(capacity, dtype=np.float32)

        # Priority tracking (for PER)
        self.priorities = np.ones(capacity, dtype=np.float32)
        self.max_priority = 1.0

        self.position = 0
        self.size = 0
        self.frame_count = 0  # For beta annealing

    def add(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool
    ):
        """
        Add a transition to the buffer.

        Args:
            state: Current state vector (state_dim,)
            action: Action index
            reward: Reward received
            next_state: Next state vector (state_dim,)
            done: Whether episode terminated

        Algorithm:
            - Store transition at current position (circular buffer)
            - Assign max priority to new transition (ensures it's sampled soon)
            - Increment position and size
        """
        self.states[self.position] = state
        self.actions[self.position] = action
        self.rewards[self.position] = reward
        self.next_states[self.position] = next_state
        self.dones[self.position] = float(done)

        # Assign max priority to new transitions
        if self.use_per:
            self.priorities[self.position] = self.max_priority

        self.position = (self.position + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def sample(self, batch_size: int) -> Tuple:
        """
        Sample a batch of transitions.

        Args:
            batch_size: Number of transitions to sample

        Returns:
            Tuple of (states, actions, rewards, next_states, dones, indices, weights)
            - states: (batch_size, state_dim)
            - actions: (batch_size,)
            - rewards: (batch_size,)
            - next_states: (batch_size, state_dim)
            - dones: (batch_size,)
            - indices: (batch_size,) - buffer indices (for priority updates)
            - weights: (batch_size,) - importance sampling weights

        Algorithm (PER):
            1. Compute sampling probabilities: P(i) = priority[i]^α / Σ priority^α
            2. Sample indices according to P(i)
            3. Compute importance sampling weights: w_i = (1 / (N × P(i)))^β
            4. Normalize weights: w_i = w_i / max(w)
        """
        if self.size < batch_size:
            raise ValueError(f"Buffer size ({self.size}) < batch size ({batch_size})")

        if self.use_per:
            # Prioritized sampling
            priorities = self.priorities[:self.size] ** self.alpha
            probabilities = priorities / priorities.sum()

            indices = np.random.choice(
                self.size,
                size=batch_size,
                replace=False,
                p=probabilities
            )

            # Importance sampling weights
            weights = (self.size * probabilities[indices]) ** (-self.beta)
            weights = weights / weights.max()  # Normalize
        else:
            # Uniform sampling
            indices = np.random.choice(self.size, size=batch_size, replace=False)
            weights = np.ones(batch_size, dtype=np.float32)

        # Anneal beta
        self.frame_count += 1
        progress = min(1.0, self.frame_count / self.beta_frames)
        self.beta = self.beta_start + (self.beta_end - self.beta_start) * progress

        return (
            self.states[indices],
            self.actions[indices],
            self.rewards[indices],
            self.next_states[indices],
            self.dones[indices],
            indices,
            weights
        )

    def update_priorities(self, indices: np.ndarray, td_errors: np.ndarray):
        """
        Update priorities based on TD errors.

        Args:
            indices: Buffer indices to update (from sample())
            td_errors: TD errors |Q_target - Q_pred| for each index

        Algorithm:
            priority[i] = (|TD_error[i]| + ε)^α
            where ε=1e-6 prevents zero priorities
        """
        if not self.use_per:
            return

        priorities = (np.abs(td_errors) + 1e-6) ** self.alpha
        self.priorities[indices] = priorities
        self.max_priority = max(self.max_priority, priorities.max())

    def __len__(self) -> int:
        """Return current buffer size."""
        return self.size

    def is_ready(self, min_size: int) -> bool:
        """Check if buffer has enough samples for training."""
        return self.size >= min_size
