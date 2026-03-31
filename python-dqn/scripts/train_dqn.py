"""
DQN Training Entry Point

Purpose:
    CLI script to train DQN agent on retail pricing data.

Usage:
    python scripts/train_dqn.py \\
        --data ../retail_store_inventory.csv \\
        --product "Product_0" \\
        --config config/dqn_config.yaml \\
        --episodes 1000

Reference:
    Main training loop in src/training/trainer.py
"""

import argparse
import os
import sys
import pandas as pd
import yaml
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.environment.pricing_env import PricingEnvironment
from src.training.trainer import DQNTrainer


def load_data(data_path: str, product_id: str) -> list:
    """
    Load and filter retail data for specified product.

    Args:
        data_path: Path to CSV file
        product_id: Product ID to filter

    Returns:
        List of row dictionaries
    """
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)

    # Filter by product
    if product_id:
        df = df[df['product_id'] == product_id]
        print(f"Filtered to product: {product_id} ({len(df)} rows)")
    else:
        print(f"Using all products ({len(df)} rows)")

    if len(df) == 0:
        raise ValueError(f"No data found for product: {product_id}")

    # Convert to list of dictionaries
    rows = df.to_dict('records')

    # Ensure required columns
    required_cols = ['qty', 'unit_price', 'freight_price', 'month']
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    # Fill missing optional columns
    for col in ['comp_1', 'lag_price', 'inventory_level', 'demand_forecast']:
        if col not in df.columns:
            for row in rows:
                row[col] = 0

    print(f"Loaded {len(rows)} rows")
    return rows


def load_config(config_path: str) -> dict:
    """Load YAML configuration file."""
    print(f"Loading config from {config_path}...")
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    return config


def main():
    parser = argparse.ArgumentParser(description='Train DQN for dynamic pricing')
    parser.add_argument('--data', type=str, required=True,
                       help='Path to retail data CSV')
    parser.add_argument('--product', type=str, default=None,
                       help='Product ID to train on (default: all products)')
    parser.add_argument('--config', type=str,
                       default='config/dqn_config.yaml',
                       help='Path to config YAML')
    parser.add_argument('--episodes', type=int, default=None,
                       help='Number of episodes (overrides config)')
    parser.add_argument('--output', type=str, default='training_metrics.json',
                       help='Output file for metrics')

    args = parser.parse_args()

    # Load config
    config = load_config(args.config)

    # Override episodes if specified
    if args.episodes is not None:
        config['training']['episodes'] = args.episodes
        print(f"Override: Training for {args.episodes} episodes")

    # Load data
    rows = load_data(args.data, args.product)

    # Create environment
    print("\nInitializing environment...")
    weights = config['environment']['reward_weights']
    action_multipliers = config['actions']['multipliers']

    env = PricingEnvironment(
        rows=rows,
        weights=weights,
        action_multipliers=action_multipliers,
        price_change_penalty=config['environment']['price_change_penalty']
    )

    print(f"State dimension: {env.get_state_dim()}")
    print(f"Action dimension: {env.get_action_dim()}")
    print(f"Base price: ${env.base_price:.2f}")
    print(f"Base cost: ${env.base_cost:.2f}")
    print(f"Base quantity: {env.base_qty:.2f}")

    # Create trainer
    print("\nInitializing trainer...")
    trainer = DQNTrainer(env, config)

    print(f"Network architecture: {config['network']['hidden_dims']}")
    print(f"Learning rate: {config['training']['learning_rate']}")
    print(f"Replay buffer size: {config['replay']['buffer_size']}")
    print(f"Batch size: {config['training']['batch_size']}")
    print(f"Epsilon decay: {config['training']['epsilon_decay']}")

    # Train
    print("\n" + "="*60)
    print("Starting training...")
    print("="*60 + "\n")

    metrics = trainer.train()

    # Save metrics
    print(f"\nSaving metrics to {args.output}...")
    with open(args.output, 'w') as f:
        json.dump(metrics, f, indent=2)

    # Print final statistics
    print("\n" + "="*60)
    print("Training Statistics")
    print("="*60)
    print(f"Total episodes: {len(metrics)}")
    print(f"Final reward: {metrics[-1]['reward']:.4f}")
    print(f"Best avg reward: {trainer.best_avg_reward:.4f}")
    print(f"Final epsilon: {trainer.epsilon:.4f}")
    print(f"Total steps: {trainer.total_steps}")

    # Compute convergence metrics
    rewards = [m['reward'] for m in metrics]
    print(f"Mean reward: {sum(rewards) / len(rewards):.4f}")
    print(f"Max reward: {max(rewards):.4f}")
    print(f"Min reward: {min(rewards):.4f}")

    print("\nCheckpoints saved to:", trainer.checkpoint_dir)
    print("  - best_model.pt (highest avg reward)")
    print("  - final_model.pt (last episode)")

    print("\nTraining complete!")


if __name__ == '__main__':
    main()
