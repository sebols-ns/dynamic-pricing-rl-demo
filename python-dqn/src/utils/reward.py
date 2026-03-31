"""
Reward Function for Dynamic Pricing

Purpose:
    Computes reward as weighted combination of normalized revenue, margin, and volume.
    Exact port of TypeScript reward.ts to ensure environment parity.

Architecture:
    - Min-max normalization for revenue, margin
    - Threshold-based volume component: full credit above 35% of range, linear penalty below
    - Weighted combination: 40% revenue + 40% margin + 20% volume

Usage:
    reward = compute_reward(
        revenue=100, margin=50, volume=10,
        weights={'revenue': 0.4, 'margin': 0.4, 'volume': 0.2},
        revenue_range=(50, 150), margin_range=(20, 80), volume_range=(5, 15)
    )

Reference:
    /Users/tarunbandi/Desktop/dynamic-pricing-rl-demo/src/engine/reward.ts
"""

from typing import Dict, Tuple


def normalize(value: float, min_val: float, max_val: float) -> float:
    """
    Min-max normalization to [0, 1].

    Args:
        value: Value to normalize
        min_val: Minimum value in range
        max_val: Maximum value in range

    Returns:
        Normalized value in [0, 1], or 0 if range is zero
    """
    if max_val == min_val:
        return 0.0
    return (value - min_val) / (max_val - min_val)


def compute_reward(
    revenue: float,
    margin: float,
    volume: float,
    weights: Dict[str, float],
    revenue_range: Tuple[float, float],
    margin_range: Tuple[float, float],
    volume_range: Tuple[float, float]
) -> float:
    """
    Compute reward as weighted combination of normalized metrics.

    Args:
        revenue: Total revenue (price × quantity)
        margin: Total margin ((price - cost) × quantity)
        volume: Quantity sold
        weights: Dictionary with keys 'revenue', 'margin', 'volume' (should sum to 1.0)
        revenue_range: (min, max) tuple for revenue normalization
        margin_range: (min, max) tuple for margin normalization
        volume_range: (min, max) tuple for volume normalization

    Returns:
        Reward value in [0, 1] range (approximately)

    Algorithm:
        1. Normalize revenue and margin to [0, 1] using min-max scaling
        2. Apply threshold-based volume component:
           - If normalized_volume >= 0.35: full credit (1.0)
           - If normalized_volume < 0.35: linear penalty (norm_vol / 0.35)
        3. Combine using weights: w_r × norm_rev + w_m × norm_margin + w_v × norm_vol

    Rationale:
        The volume threshold prevents the volume component from penalizing
        moderate price increases. Only extreme volume loss (< 35% of range)
        is penalized. This allows the agent to balance revenue/margin gains
        against acceptable volume reductions.

    Reference:
        TypeScript implementation: src/engine/reward.ts lines 15-36
    """
    # Normalize revenue and margin
    norm_revenue = normalize(revenue, revenue_range[0], revenue_range[1])
    norm_margin = normalize(margin, margin_range[0], margin_range[1])

    # Threshold-based volume: full credit if volume stays above 35% of range
    raw_volume = normalize(volume, volume_range[0], volume_range[1])
    volume_threshold = 0.35
    norm_volume = 1.0 if raw_volume >= volume_threshold else raw_volume / volume_threshold

    # Weighted combination
    reward = (
        weights['revenue'] * norm_revenue +
        weights['margin'] * norm_margin +
        weights['volume'] * norm_volume
    )

    return reward


def compute_price_change_penalty(
    prev_multiplier: float,
    current_multiplier: float,
    penalty_weight: float = 0.15
) -> float:
    """
    Compute penalty for price changes to encourage stability.

    Args:
        prev_multiplier: Previous action's price multiplier
        current_multiplier: Current action's price multiplier
        penalty_weight: Weight of the penalty (default 0.15)

    Returns:
        Penalty value to subtract from reward

    Algorithm:
        penalty = penalty_weight × |current - prev| / prev
        Larger price changes incur larger penalties.

    Reference:
        TypeScript implementation: src/engine/environment.ts lines 259-264
    """
    if prev_multiplier <= 0:
        return 0.0

    change_magnitude = abs(current_multiplier - prev_multiplier) / prev_multiplier
    return penalty_weight * change_magnitude
