"""
Pricing Environment for DQN

Purpose:
    Simulates dynamic pricing environment for retail products. Exact port of TypeScript
    PricingEnvironment to ensure reward parity for fair DQN vs Q-learning comparison.

Architecture:
    - Hybrid training: 70% real data, 30% synthetic steps for state coverage
    - State-dependent elasticity: market conditions modulate demand response
    - Optional GBRT demand model or fallback exponential elasticity
    - Price change penalty for action stability

Usage:
    env = PricingEnvironment(rows, weights, action_multipliers)
    state = env.reset()
    step_result = env.step(action=3)  # action in [0, 11]

Reference:
    /Users/tarunbandi/Desktop/dynamic-pricing-rl-demo/src/engine/environment.ts
"""

import numpy as np
from typing import Dict, List, Tuple, Optional
from .state_encoder import StateEncoder
from ..utils.reward import compute_reward, compute_price_change_penalty


class PricingEnvironment:
    """
    Dynamic pricing environment with state-dependent elasticity.

    Supports both real data steps and synthetic steps for exploration.
    Compatible with optional GBRT demand model.
    """

    def __init__(
        self,
        rows: List[Dict],
        weights: Dict[str, float],
        action_multipliers: List[float],
        price_change_penalty: float = 0.15,
        demand_model: Optional[object] = None
    ):
        """
        Args:
            rows: List of retail data dictionaries
            weights: Reward weights {'revenue': w1, 'margin': w2, 'volume': w3}
            action_multipliers: List of price multipliers (e.g., [0.8, 0.9, ..., 1.6])
            price_change_penalty: Weight for price stability penalty (default 0.15)
            demand_model: Optional GBRT model for demand prediction
        """
        self.rows = rows
        self.weights = weights
        self.action_multipliers = np.array(action_multipliers)
        self.num_actions = len(action_multipliers)
        self.price_change_penalty = price_change_penalty
        self.demand_model = demand_model

        # Initialize state encoder
        self.encoder = StateEncoder(rows)

        # Base statistics
        self.base_price = self.encoder.base_price
        self.base_cost = self.encoder.base_cost
        self.base_qty = self.encoder.base_qty

        # Elasticity parameter (for non-GBRT mode)
        self.elasticity = 0.7

        # Normalization ranges for rewards (from TypeScript environment.ts lines 82-90)
        self.revenue_range = (
            self.base_price * 0.95 * self.base_qty * 0.6,
            self.base_price * 1.30 * self.base_qty * 1.1
        )
        self.margin_range = (
            (self.base_price * 0.95 - self.base_cost) * self.base_qty * 0.6,
            (self.base_price * 1.30 - self.base_cost) * self.base_qty * 1.1
        )
        self.volume_range = (
            self.base_qty * 0.3,
            self.base_qty * 1.2
        )

        # Episode state
        self.current_idx = 0
        self.last_action = -1  # Track for price change penalty

    def reset(self) -> np.ndarray:
        """
        Reset environment to random initial state.

        Returns:
            Continuous state vector (9-dimensional)
        """
        self.current_idx = np.random.randint(0, len(self.rows))
        self.last_action = -1
        return self.encoder.encode_continuous(self.rows[self.current_idx])

    def _get_effective_elasticity(self, discrete_state: Dict[str, int]) -> float:
        """
        Compute state-dependent elasticity from market conditions.

        Args:
            discrete_state: Discrete state bins

        Returns:
            Effective elasticity value in [0.05, 4.0]

        Algorithm:
            Base elasticity is modulated by:
            - Demand level: Low demand → more elastic (customers price-sensitive)
            - Competitor price: High competitor price → less elastic (relative value)
            - Season: Summer → less elastic, Winter → more elastic
            - Inventory: Low inventory → less elastic (scarcity premium)
            - Forecast: High forecast → less elastic (confident demand)

        Reference:
            TypeScript environment.ts lines 156-172
        """
        e = self.elasticity

        # Demand factor: higher demand bin → less elastic
        demand_bins = self.encoder.demand_bins
        demand_factor = 1.8 - (discrete_state['demandBin'] / (demand_bins - 1)) * 1.2

        # Competitor factor: higher comp bin → less elastic
        comp_bins = self.encoder.competitor_bins
        comp_factor = 1.6 - (discrete_state['competitorPriceBin'] / (comp_bins - 1)) * 0.8

        # Season factor: summer (2) → less elastic, winter (0) → more elastic
        season_factor = 0.7 if discrete_state['seasonBin'] == 2 else (
            1.3 if discrete_state['seasonBin'] == 0 else 1.0
        )

        e *= demand_factor * comp_factor * season_factor

        # Extended state factors
        if self.encoder.has_extended_state:
            # Low inventory → scarcity, less elastic
            inv_bins = self.encoder.inventory_bins
            inventory_factor = 0.7 + (discrete_state['inventoryBin'] / (inv_bins - 1)) * 0.6

            # High forecast → confident demand, less elastic
            forecast_bins = self.encoder.forecast_bins
            forecast_factor = 1.2 - (discrete_state['forecastBin'] / (forecast_bins - 1)) * 0.4

            e *= inventory_factor * forecast_factor

        # Clamp to reasonable range
        return np.clip(e, 0.05, 4.0)

    def _predict_demand(
        self,
        row: Dict,
        price: float,
        discrete_state: Dict[str, int]
    ) -> float:
        """
        Predict demand quantity for given price.

        Args:
            row: Current data row
            price: Proposed price
            discrete_state: Discrete state (for elasticity calculation)

        Returns:
            Predicted quantity sold

        Algorithm:
            If GBRT model available: Use model prediction
            Else: Exponential elasticity model
                qty = base_qty × exp(-elasticity × (price - base_price) / base_price)

        Reference:
            TypeScript environment.ts lines 178-244
        """
        if self.demand_model is not None:
            # Use GBRT model (future enhancement)
            # For now, fall back to elasticity model
            pass

        # Exponential elasticity model
        effective_elasticity = self._get_effective_elasticity(discrete_state)
        price_change_ratio = (price - self.base_price) / (self.base_price or 1.0)

        # Use demand_forecast as base if available and extended state enabled
        if self.encoder.has_extended_state and row.get('demand_forecast', 0) > 0:
            base_q = row['demand_forecast']
        else:
            base_q = row['qty']

        predicted_qty = base_q * np.exp(-effective_elasticity * price_change_ratio)
        return max(1.0, predicted_qty)

    def step(self, action: int, use_synthetic: bool = False) -> Tuple[np.ndarray, float, bool, Dict]:
        """
        Execute action and transition to next state.

        Args:
            action: Action index in [0, num_actions - 1]
            use_synthetic: If True, use synthetic step generation

        Returns:
            Tuple of (next_state, reward, done, info) where:
            - next_state: Continuous state vector (9-dim)
            - reward: Scalar reward value
            - done: Always False (episodic, but controlled externally)
            - info: Dict with 'revenue', 'margin', 'volume', 'price'

        Algorithm:
            1. Get current state and apply action
            2. Predict demand using elasticity or GBRT
            3. Compute revenue, margin, volume
            4. Compute reward with normalization
            5. Apply price change penalty if action differs from last
            6. Transition to next state

        Reference:
            TypeScript environment.ts lines 230-271
        """
        if use_synthetic:
            return self._synthetic_step(action)

        # Real data step
        row = self.rows[self.current_idx]
        discrete_state = self.encoder.encode_discrete(row)

        # Apply action to get price
        multiplier = self.action_multipliers[action]
        price = self.base_price * multiplier

        # Predict demand
        predicted_qty = self._predict_demand(row, price, discrete_state)

        # Compute metrics
        revenue = price * predicted_qty
        margin = (price - self.base_cost) * predicted_qty
        volume_sold = predicted_qty

        # Compute base reward
        reward = compute_reward(
            revenue=revenue,
            margin=margin,
            volume=volume_sold,
            weights=self.weights,
            revenue_range=self.revenue_range,
            margin_range=self.margin_range,
            volume_range=self.volume_range
        )

        # Apply price change penalty
        if self.last_action >= 0:
            prev_multiplier = self.action_multipliers[self.last_action]
            penalty = compute_price_change_penalty(
                prev_multiplier, multiplier, self.price_change_penalty
            )
            reward -= penalty

        self.last_action = action

        # Transition to next state
        self.current_idx = (self.current_idx + 1) % len(self.rows)
        next_state = self.encoder.encode_continuous(self.rows[self.current_idx])

        info = {
            'revenue': revenue,
            'margin': margin,
            'volume': volume_sold,
            'price': price
        }

        return next_state, reward, False, info

    def _synthetic_step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict]:
        """
        Generate synthetic step for exploration.

        Args:
            action: Action index

        Returns:
            Same tuple as step()

        Algorithm:
            1. Sample random discrete state
            2. Convert to continuous features (approximate)
            3. Apply elasticity model with noise
            4. Compute reward as in real step

        Reference:
            TypeScript environment.ts lines 304-341
        """
        # Sample random discrete state
        discrete_state = {
            'demandBin': np.random.randint(0, self.encoder.demand_bins),
            'competitorPriceBin': np.random.randint(0, self.encoder.competitor_bins),
            'seasonBin': np.random.randint(0, 4),
            'lagPriceBin': np.random.randint(0, self.encoder.lag_bins),
            'inventoryBin': np.random.randint(0, self.encoder.inventory_bins) if self.encoder.has_extended_state else 0,
            'forecastBin': np.random.randint(0, self.encoder.forecast_bins) if self.encoder.has_extended_state else 0,
        }

        # Convert to continuous state
        next_state = self.encoder.discrete_to_continuous(discrete_state)

        # Apply action
        multiplier = self.action_multipliers[action]
        price = self.base_price * multiplier

        # Predict demand with noise
        effective_elasticity = self._get_effective_elasticity(discrete_state)
        price_change_ratio = (price - self.base_price) / (self.base_price or 1.0)

        # Scale base quantity by demand bin
        demand_scale = 0.6 + (discrete_state['demandBin'] / (self.encoder.demand_bins - 1)) * 0.5
        base_q = self.base_qty * demand_scale

        noise = 0.9 + np.random.random() * 0.2  # [0.9, 1.1]
        predicted_qty = max(1.0, base_q * np.exp(-effective_elasticity * price_change_ratio) * noise)

        # Compute metrics
        revenue = price * predicted_qty
        margin = (price - self.base_cost) * predicted_qty
        volume_sold = predicted_qty

        # Compute reward
        reward = compute_reward(
            revenue=revenue,
            margin=margin,
            volume=volume_sold,
            weights=self.weights,
            revenue_range=self.revenue_range,
            margin_range=self.margin_range,
            volume_range=self.volume_range
        )

        # Apply price change penalty (if applicable)
        if self.last_action >= 0:
            prev_multiplier = self.action_multipliers[self.last_action]
            penalty = compute_price_change_penalty(
                prev_multiplier, multiplier, self.price_change_penalty
            )
            reward -= penalty

        # Note: last_action is NOT updated for synthetic steps to avoid
        # penalizing transitions between real and synthetic steps

        info = {
            'revenue': revenue,
            'margin': margin,
            'volume': volume_sold,
            'price': price
        }

        return next_state, reward, False, info

    def get_state_dim(self) -> int:
        """Return dimensionality of continuous state space."""
        return self.encoder.get_state_dim()

    def get_action_dim(self) -> int:
        """Return number of discrete actions."""
        return self.num_actions
