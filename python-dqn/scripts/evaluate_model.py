"""
Model Evaluation and Comparison

Purpose:
    Evaluate DQN agent performance and compare against Q-learning baseline.
    Provides statistical significance testing and visualization.

Usage:
    python scripts/evaluate_model.py \\
        --data ../retail_store_inventory.csv \\
        --product "Product_0" \\
        --checkpoint checkpoints/best_model.pt \\
        --episodes 100

Output:
    - Average reward, revenue, margin, volume
    - Statistical comparison (if Q-learning results available)
    - Action distribution analysis
"""

import argparse
import os
import sys
import pandas as pd
import numpy as np
import json
import torch
from pathlib import Path
from typing import List, Dict
from scipy import stats

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.environment.pricing_env import PricingEnvironment
from src.models.dqn_network import DQNNetwork


def load_checkpoint(checkpoint_path: str, device: torch.device) -> tuple:
    """
    Load trained DQN model from checkpoint.

    Returns:
        (network, config) tuple
    """
    print(f"Loading checkpoint from {checkpoint_path}...")
    checkpoint = torch.load(checkpoint_path, map_location=device)

    config = checkpoint['config']
    state_dim = 9  # Fixed for pricing environment
    action_dim = len(config['actions']['multipliers'])

    network = DQNNetwork(
        state_dim=state_dim,
        action_dim=action_dim,
        hidden_dims=config['network']['hidden_dims'],
        use_batch_norm=config['network']['use_batch_norm']
    ).to(device)

    network.load_state_dict(checkpoint['online_net_state_dict'])
    network.eval()

    print(f"Loaded model from episode {checkpoint['episode']}")
    print(f"Best avg reward during training: {checkpoint['best_avg_reward']:.4f}")

    return network, config


def evaluate_policy(
    env: PricingEnvironment,
    network: DQNNetwork,
    device: torch.device,
    num_episodes: int,
    greedy: bool = True
) -> Dict:
    """
    Evaluate policy over multiple episodes.

    Args:
        env: Pricing environment
        network: Trained DQN network
        device: torch device
        num_episodes: Number of evaluation episodes
        greedy: If True, use greedy policy (no exploration)

    Returns:
        Dictionary with evaluation metrics
    """
    print(f"\nEvaluating policy for {num_episodes} episodes...")

    episode_rewards = []
    episode_revenues = []
    episode_margins = []
    episode_volumes = []
    action_counts = np.zeros(env.get_action_dim())

    for episode in range(num_episodes):
        state = env.reset()
        episode_reward = 0.0
        episode_revenue = 0.0
        episode_margin = 0.0
        episode_volume = 0.0
        steps = 0

        for step in range(200):  # Max steps per episode
            # Select action
            state_tensor = torch.FloatTensor(state).to(device)
            with torch.no_grad():
                q_values = network(state_tensor)
                action = q_values.argmax().item() if greedy else network.get_action(state_tensor, epsilon=0.1)

            # Execute action (use real data only for evaluation)
            next_state, reward, done, info = env.step(action, use_synthetic=False)

            episode_reward += reward
            episode_revenue += info['revenue']
            episode_margin += info['margin']
            episode_volume += info['volume']
            action_counts[action] += 1
            steps += 1

            state = next_state

        episode_rewards.append(episode_reward)
        episode_revenues.append(episode_revenue / steps)
        episode_margins.append(episode_margin / steps)
        episode_volumes.append(episode_volume / steps)

        if (episode + 1) % 10 == 0:
            print(f"  Episode {episode + 1}/{num_episodes} | "
                  f"Reward: {episode_reward:.4f} | "
                  f"Avg Revenue: {episode_revenue / steps:.2f}")

    # Compute statistics
    results = {
        'num_episodes': num_episodes,
        'mean_reward': float(np.mean(episode_rewards)),
        'std_reward': float(np.std(episode_rewards)),
        'mean_revenue': float(np.mean(episode_revenues)),
        'std_revenue': float(np.std(episode_revenues)),
        'mean_margin': float(np.mean(episode_margins)),
        'std_margin': float(np.std(episode_margins)),
        'mean_volume': float(np.mean(episode_volumes)),
        'std_volume': float(np.std(episode_volumes)),
        'action_distribution': (action_counts / action_counts.sum()).tolist()
    }

    return results


def compare_with_qlearning(dqn_results: Dict, qlearning_path: str = None):
    """
    Compare DQN results with Q-learning baseline.

    Args:
        dqn_results: DQN evaluation results
        qlearning_path: Path to Q-learning results JSON (optional)
    """
    if qlearning_path is None or not os.path.exists(qlearning_path):
        print("\nNo Q-learning results available for comparison.")
        return

    print(f"\nLoading Q-learning results from {qlearning_path}...")
    with open(qlearning_path, 'r') as f:
        ql_results = json.load(f)

    print("\n" + "="*60)
    print("DQN vs Q-Learning Comparison")
    print("="*60)

    # Compare metrics
    metrics = ['mean_reward', 'mean_revenue', 'mean_margin', 'mean_volume']
    for metric in metrics:
        dqn_val = dqn_results[metric]
        ql_val = ql_results.get(metric, 0)
        diff = dqn_val - ql_val
        pct_change = (diff / ql_val * 100) if ql_val != 0 else 0

        print(f"\n{metric}:")
        print(f"  DQN:        {dqn_val:.4f}")
        print(f"  Q-Learning: {ql_val:.4f}")
        print(f"  Difference: {diff:+.4f} ({pct_change:+.2f}%)")

    # Statistical significance test (if both have std)
    if 'std_reward' in dqn_results and 'std_reward' in ql_results:
        print("\nStatistical Significance (t-test):")
        # Approximate t-test using summary statistics
        n_dqn = dqn_results['num_episodes']
        n_ql = ql_results.get('num_episodes', n_dqn)

        mean_diff = dqn_results['mean_reward'] - ql_results['mean_reward']
        std_err = np.sqrt(
            (dqn_results['std_reward']**2 / n_dqn) +
            (ql_results['std_reward']**2 / n_ql)
        )
        t_stat = mean_diff / std_err if std_err > 0 else 0
        df = n_dqn + n_ql - 2
        p_value = 2 * (1 - stats.t.cdf(abs(t_stat), df))

        print(f"  t-statistic: {t_stat:.3f}")
        print(f"  p-value: {p_value:.4f}")
        print(f"  Significant: {'Yes (p < 0.05)' if p_value < 0.05 else 'No (p >= 0.05)'}")


def main():
    parser = argparse.ArgumentParser(description='Evaluate DQN model')
    parser.add_argument('--data', type=str, required=True,
                       help='Path to retail data CSV')
    parser.add_argument('--product', type=str, default=None,
                       help='Product ID to evaluate')
    parser.add_argument('--checkpoint', type=str, required=True,
                       help='Path to model checkpoint')
    parser.add_argument('--episodes', type=int, default=100,
                       help='Number of evaluation episodes')
    parser.add_argument('--qlearning', type=str, default=None,
                       help='Path to Q-learning results JSON for comparison')
    parser.add_argument('--output', type=str, default='evaluation_results.json',
                       help='Output file for results')

    args = parser.parse_args()

    # Setup device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # Load checkpoint
    network, config = load_checkpoint(args.checkpoint, device)

    # Load data
    print(f"\nLoading data from {args.data}...")
    df = pd.read_csv(args.data)
    if args.product:
        df = df[df['product_id'] == args.product]
        print(f"Filtered to product: {args.product} ({len(df)} rows)")

    rows = df.to_dict('records')

    # Fill missing columns
    for col in ['comp_1', 'lag_price', 'inventory_level', 'demand_forecast']:
        if col not in df.columns:
            for row in rows:
                row[col] = 0

    # Create environment
    print("\nInitializing environment...")
    env = PricingEnvironment(
        rows=rows,
        weights=config['environment']['reward_weights'],
        action_multipliers=config['actions']['multipliers'],
        price_change_penalty=config['environment']['price_change_penalty']
    )

    # Evaluate
    results = evaluate_policy(env, network, device, args.episodes)

    # Print results
    print("\n" + "="*60)
    print("Evaluation Results")
    print("="*60)
    print(f"Episodes: {results['num_episodes']}")
    print(f"Mean Reward: {results['mean_reward']:.4f} ± {results['std_reward']:.4f}")
    print(f"Mean Revenue: ${results['mean_revenue']:.2f} ± ${results['std_revenue']:.2f}")
    print(f"Mean Margin: ${results['mean_margin']:.2f} ± ${results['std_margin']:.2f}")
    print(f"Mean Volume: {results['mean_volume']:.2f} ± {results['std_volume']:.2f}")

    print("\nAction Distribution:")
    for i, prob in enumerate(results['action_distribution']):
        multiplier = config['actions']['multipliers'][i]
        print(f"  Action {i} (×{multiplier:.2f}): {prob:.3f}")

    # Save results
    with open(args.output, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {args.output}")

    # Compare with Q-learning
    compare_with_qlearning(results, args.qlearning)

    print("\nEvaluation complete!")


if __name__ == '__main__':
    main()
