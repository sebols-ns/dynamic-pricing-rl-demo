"""
Export DQN Policy as Lookup Table

Purpose:
    Converts trained DQN policy to discrete lookup table for TypeScript integration.
    Queries DQN for best action at each of 972 discrete states.

Usage:
    python scripts/export_policy.py \\
        --checkpoint checkpoints/best_model.pt \\
        --output dqn_policy.json

Output:
    JSON file mapping state indices to action indices:
    {
        "0": 3,
        "1": 5,
        ...
        "971": 7
    }
"""

import argparse
import os
import sys
import json
import torch
import numpy as np
from pathlib import Path
from typing import Dict

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.dqn_network import DQNNetwork
from src.environment.state_encoder import StateEncoder


def load_checkpoint(checkpoint_path: str, device: torch.device) -> tuple:
    """Load trained DQN model from checkpoint."""
    print(f"Loading checkpoint from {checkpoint_path}...")
    checkpoint = torch.load(checkpoint_path, map_location=device)

    config = checkpoint['config']
    state_dim = 9
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

    return network, config


def generate_discrete_states(
    demand_bins: int,
    competitor_bins: int,
    season_bins: int,
    lag_bins: int,
    inventory_bins: int,
    forecast_bins: int,
    has_extended_state: bool
) -> list:
    """
    Generate all discrete states.

    Returns:
        List of discrete state dictionaries
    """
    states = []

    inv_range = range(inventory_bins) if has_extended_state else [0]
    fcst_range = range(forecast_bins) if has_extended_state else [0]

    for demand_bin in range(demand_bins):
        for comp_bin in range(competitor_bins):
            for season_bin in range(season_bins):
                for lag_bin in range(lag_bins):
                    for inv_bin in inv_range:
                        for fcst_bin in fcst_range:
                            states.append({
                                'demandBin': demand_bin,
                                'competitorPriceBin': comp_bin,
                                'seasonBin': season_bin,
                                'lagPriceBin': lag_bin,
                                'inventoryBin': inv_bin,
                                'forecastBin': fcst_bin
                            })

    return states


def export_policy(
    network: DQNNetwork,
    config: Dict,
    device: torch.device
) -> Dict[int, int]:
    """
    Query DQN for best action at each discrete state.

    Args:
        network: Trained DQN network
        config: Configuration dictionary
        device: torch device

    Returns:
        Dictionary mapping state index to action index
    """
    # Create dummy encoder for state conversion
    # (we don't have real data here, so use default bins)
    disc_cfg = config['discretization']
    demand_bins = disc_cfg['demand_bins']
    competitor_bins = disc_cfg['competitor_bins']
    lag_bins = disc_cfg['lag_price_bins']
    inventory_bins = disc_cfg['inventory_bins']
    forecast_bins = disc_cfg['forecast_bins']

    # Assume extended state if inventory/forecast bins > 1
    has_extended_state = inventory_bins > 1 and forecast_bins > 1

    # Generate all discrete states
    print("\nGenerating discrete states...")
    discrete_states = generate_discrete_states(
        demand_bins, competitor_bins, 4, lag_bins,
        inventory_bins, forecast_bins, has_extended_state
    )
    print(f"Total states: {len(discrete_states)}")

    # Create encoder with dummy data (just for conversion)
    dummy_rows = [{'qty': 10, 'unit_price': 100, 'freight_price': 10, 'month': 1}]
    encoder = StateEncoder(
        dummy_rows,
        demand_bins=demand_bins,
        competitor_bins=competitor_bins,
        lag_bins=lag_bins,
        inventory_bins=inventory_bins,
        forecast_bins=forecast_bins
    )
    encoder.has_extended_state = has_extended_state

    # Query DQN for each state
    print("Querying DQN for best actions...")
    policy = {}

    for idx, discrete_state in enumerate(discrete_states):
        # Convert discrete state to continuous
        continuous_state = encoder.discrete_to_continuous(discrete_state)

        # Query network
        state_tensor = torch.FloatTensor(continuous_state).to(device)
        with torch.no_grad():
            q_values = network(state_tensor)
            action = q_values.argmax().item()

        policy[idx] = action

        if (idx + 1) % 100 == 0:
            print(f"  Processed {idx + 1}/{len(discrete_states)} states")

    return policy


def main():
    parser = argparse.ArgumentParser(description='Export DQN policy as lookup table')
    parser.add_argument('--checkpoint', type=str, required=True,
                       help='Path to model checkpoint')
    parser.add_argument('--output', type=str, default='dqn_policy.json',
                       help='Output JSON file')

    args = parser.parse_args()

    # Setup device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # Load checkpoint
    network, config = load_checkpoint(args.checkpoint, device)

    # Export policy
    policy = export_policy(network, config, device)

    # Convert keys to strings for JSON
    policy_json = {str(k): v for k, v in policy.items()}

    # Save to file
    print(f"\nSaving policy to {args.output}...")
    with open(args.output, 'w') as f:
        json.dump(policy_json, f, indent=2)

    print(f"Exported {len(policy)} state-action pairs")

    # Print sample actions
    print("\nSample policy (first 10 states):")
    action_multipliers = config['actions']['multipliers']
    for i in range(min(10, len(policy))):
        action = policy[i]
        multiplier = action_multipliers[action]
        print(f"  State {i} → Action {action} (×{multiplier:.2f})")

    # Action distribution
    action_counts = {}
    for action in policy.values():
        action_counts[action] = action_counts.get(action, 0) + 1

    print("\nAction distribution:")
    for action in sorted(action_counts.keys()):
        count = action_counts[action]
        pct = count / len(policy) * 100
        multiplier = action_multipliers[action]
        print(f"  Action {action} (×{multiplier:.2f}): {count} ({pct:.1f}%)")

    print("\nPolicy export complete!")


if __name__ == '__main__':
    main()
