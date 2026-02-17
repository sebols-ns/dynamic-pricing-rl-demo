"""
Integration Test for DQN Implementation

Purpose:
    Quick validation that all components work together.
    Runs 10 training episodes as a smoke test.

Usage:
    python scripts/test_integration.py
"""

import sys
from pathlib import Path
import numpy as np

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.environment.pricing_env import PricingEnvironment
from src.environment.state_encoder import StateEncoder
from src.models.dqn_network import DQNNetwork
from src.models.replay_buffer import ReplayBuffer
from src.utils.reward import compute_reward
import torch


def test_state_encoder():
    """Test state encoder functionality."""
    print("Testing StateEncoder...")

    # Create dummy data
    rows = [
        {'qty': 10, 'unit_price': 100, 'freight_price': 10, 'month': i % 12 + 1,
         'comp_1': 95 + i, 'lag_price': 98 + i, 'inventory_level': 50 + i,
         'demand_forecast': 12 + i}
        for i in range(100)
    ]

    encoder = StateEncoder(rows)

    # Test discrete encoding
    discrete = encoder.encode_discrete(rows[0])
    assert 'demandBin' in discrete
    assert 'seasonBin' in discrete
    print(f"  Discrete state: {discrete}")

    # Test continuous encoding
    continuous = encoder.encode_continuous(rows[0])
    assert continuous.shape == (9,)
    assert np.all(continuous >= -1) and np.all(continuous <= 1)
    print(f"  Continuous state shape: {continuous.shape}")

    # Test discrete to continuous conversion
    continuous_from_discrete = encoder.discrete_to_continuous(discrete)
    assert continuous_from_discrete.shape == (9,)
    print(f"  Discrete→Continuous works")

    print("✓ StateEncoder passed\n")


def test_reward():
    """Test reward computation."""
    print("Testing reward function...")

    reward = compute_reward(
        revenue=100,
        margin=50,
        volume=10,
        weights={'revenue': 0.4, 'margin': 0.4, 'volume': 0.2},
        revenue_range=(50, 150),
        margin_range=(20, 80),
        volume_range=(5, 15)
    )

    assert 0 <= reward <= 1.2  # Reward should be roughly in [0, 1]
    print(f"  Reward: {reward:.4f}")
    print("✓ Reward function passed\n")


def test_pricing_env():
    """Test pricing environment."""
    print("Testing PricingEnvironment...")

    # Create dummy data
    rows = [
        {'qty': 10, 'unit_price': 100, 'freight_price': 10, 'month': i % 12 + 1,
         'comp_1': 95, 'lag_price': 98, 'inventory_level': 50,
         'demand_forecast': 12}
        for i in range(100)
    ]

    env = PricingEnvironment(
        rows=rows,
        weights={'revenue': 0.4, 'margin': 0.4, 'volume': 0.2},
        action_multipliers=[0.8, 0.9, 1.0, 1.1, 1.2]
    )

    # Test reset
    state = env.reset()
    assert state.shape == (9,)
    print(f"  Initial state shape: {state.shape}")

    # Test step
    next_state, reward, done, info = env.step(action=2)
    assert next_state.shape == (9,)
    assert isinstance(reward, float)
    assert 'revenue' in info
    print(f"  Step result - reward: {reward:.4f}, revenue: {info['revenue']:.2f}")

    # Test synthetic step
    next_state, reward, done, info = env.step(action=3, use_synthetic=True)
    assert next_state.shape == (9,)
    print(f"  Synthetic step - reward: {reward:.4f}")

    print("✓ PricingEnvironment passed\n")


def test_dqn_network():
    """Test DQN network."""
    print("Testing DQNNetwork...")

    network = DQNNetwork(
        state_dim=9,
        action_dim=12,
        hidden_dims=[64, 64],
        use_batch_norm=True
    )

    # Test forward pass
    state = torch.randn(9)
    q_values = network(state)
    assert q_values.shape == (12,)
    print(f"  Q-values shape: {q_values.shape}")

    # Test batch forward pass
    batch_states = torch.randn(32, 9)
    batch_q_values = network(batch_states)
    assert batch_q_values.shape == (32, 12)
    print(f"  Batch Q-values shape: {batch_q_values.shape}")

    # Test action selection
    action = network.get_action(state, epsilon=0.0)
    assert 0 <= action < 12
    print(f"  Selected action: {action}")

    print("✓ DQNNetwork passed\n")


def test_replay_buffer():
    """Test replay buffer."""
    print("Testing ReplayBuffer...")

    buffer = ReplayBuffer(
        capacity=1000,
        state_dim=9,
        use_per=True,
        alpha=0.6
    )

    # Add transitions
    for i in range(100):
        state = np.random.randn(9).astype(np.float32)
        action = np.random.randint(0, 12)
        reward = np.random.random()
        next_state = np.random.randn(9).astype(np.float32)
        done = False

        buffer.add(state, action, reward, next_state, done)

    assert len(buffer) == 100
    print(f"  Buffer size: {len(buffer)}")

    # Test sampling
    batch = buffer.sample(32)
    states, actions, rewards, next_states, dones, indices, weights = batch

    assert states.shape == (32, 9)
    assert actions.shape == (32,)
    assert rewards.shape == (32,)
    assert weights.shape == (32,)
    print(f"  Sampled batch - states: {states.shape}, weights: {weights.shape}")

    # Test priority update
    td_errors = np.random.randn(32)
    buffer.update_priorities(indices, td_errors)
    print(f"  Priorities updated")

    print("✓ ReplayBuffer passed\n")


def test_integration():
    """Test full training integration."""
    print("Testing full integration (10 episodes)...")

    # Create environment
    rows = [
        {'qty': 10 + i, 'unit_price': 100, 'freight_price': 10, 'month': (i % 12) + 1,
         'comp_1': 95, 'lag_price': 98, 'inventory_level': 50,
         'demand_forecast': 12}
        for i in range(100)
    ]

    env = PricingEnvironment(
        rows=rows,
        weights={'revenue': 0.4, 'margin': 0.4, 'volume': 0.2},
        action_multipliers=[0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6]
    )

    # Create network
    network = DQNNetwork(
        state_dim=9,
        action_dim=12,
        hidden_dims=[64, 64]
    )

    # Create buffer
    buffer = ReplayBuffer(
        capacity=1000,
        state_dim=9,
        use_per=False  # Simpler for test
    )

    # Create optimizer
    optimizer = torch.optim.Adam(network.parameters(), lr=1e-3)

    # Run 10 episodes
    epsilon = 1.0
    total_steps = 0

    for episode in range(10):
        state = env.reset()
        episode_reward = 0.0

        for step in range(20):
            # Select action
            if np.random.random() < epsilon:
                action = np.random.randint(0, 12)
            else:
                state_tensor = torch.FloatTensor(state)
                with torch.no_grad():
                    q_values = network(state_tensor)
                    action = q_values.argmax().item()

            # Execute
            next_state, reward, done, info = env.step(action)
            buffer.add(state, action, reward, next_state, done)

            episode_reward += reward
            state = next_state
            total_steps += 1

            # Train if buffer ready
            if len(buffer) >= 32 and total_steps % 4 == 0:
                batch = buffer.sample(32)
                states_b, actions_b, rewards_b, next_states_b, dones_b, _, _ = batch

                states_t = torch.FloatTensor(states_b)
                actions_t = torch.LongTensor(actions_b)
                rewards_t = torch.FloatTensor(rewards_b)
                next_states_t = torch.FloatTensor(next_states_b)

                # Simple Q-learning update (not double DQN for test)
                q_values = network(states_t).gather(1, actions_t.unsqueeze(1)).squeeze(1)

                with torch.no_grad():
                    next_q_values = network(next_states_t).max(1)[0]
                    targets = rewards_t + 0.0 * next_q_values  # gamma=0

                loss = torch.nn.functional.mse_loss(q_values, targets)

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        epsilon = max(0.1, epsilon * 0.9)
        print(f"  Episode {episode + 1}/10 - Reward: {episode_reward:.4f}, Epsilon: {epsilon:.3f}")

    print("✓ Integration test passed\n")


def main():
    print("="*60)
    print("DQN Integration Test")
    print("="*60 + "\n")

    try:
        test_state_encoder()
        test_reward()
        test_pricing_env()
        test_dqn_network()
        test_replay_buffer()
        test_integration()

        print("="*60)
        print("ALL TESTS PASSED ✓")
        print("="*60)

    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
