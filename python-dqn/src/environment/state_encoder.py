"""
State Encoder for DQN Dynamic Pricing

Purpose:
    Converts raw retail data and discrete state bins into continuous normalized features
    for the DQN neural network. Handles cyclical encoding of seasonal features.

Architecture:
    - Min-max normalization for continuous features (demand, prices)
    - Cyclical encoding for season: (sin(2π×month/12), cos(2π×month/12))
    - Conversion between discrete bins (Q-learning) and continuous values (DQN)

Usage:
    encoder = StateEncoder(rows)
    continuous_state = encoder.encode_continuous(row)
    discrete_state = encoder.encode_discrete(row)
"""

import numpy as np
from typing import Dict, List, Tuple, Optional
import math


class StateEncoder:
    """
    Encodes retail data into state representations for RL agents.

    Supports both discrete binning (for Q-learning) and continuous features (for DQN).
    """

    def __init__(self, rows: List[Dict],
                 demand_bins: int = 3,
                 competitor_bins: int = 3,
                 lag_bins: int = 3,
                 inventory_bins: int = 3,
                 forecast_bins: int = 3):
        """
        Args:
            rows: List of retail data dictionaries with keys:
                  qty, unit_price, comp_1, month, lag_price,
                  inventory_level, demand_forecast, freight_price
            demand_bins: Number of bins for demand quantization
            competitor_bins: Number of bins for competitor price quantization
            lag_bins: Number of bins for lag price quantization
            inventory_bins: Number of bins for inventory quantization
            forecast_bins: Number of bins for demand forecast quantization
        """
        self.rows = rows
        self.demand_bins = demand_bins
        self.competitor_bins = competitor_bins
        self.lag_bins = lag_bins
        self.inventory_bins = inventory_bins
        self.forecast_bins = forecast_bins

        # Extract feature columns
        self.qtys = np.array([r['qty'] for r in rows])
        self.prices = np.array([r['unit_price'] for r in rows])
        self.comps = np.array([r.get('comp_1', 0) for r in rows])
        self.lags = np.array([r.get('lag_price', 0) for r in rows])
        self.inventories = np.array([r.get('inventory_level', 0) for r in rows])
        self.forecasts = np.array([r.get('demand_forecast', 0) for r in rows])
        self.costs = np.array([r.get('freight_price', 0) for r in rows])

        # Compute quantile thresholds for binning
        self.demand_thresholds = self._quantile_bins(self.qtys, demand_bins)

        # Filter out zeros for competitor/lag prices (missing data)
        comp_valid = self.comps[self.comps > 0]
        lag_valid = self.lags[self.lags > 0]

        self.comp_thresholds = self._quantile_bins(
            comp_valid if len(comp_valid) > 0 else np.array([0, 1]),
            competitor_bins
        )
        self.lag_thresholds = self._quantile_bins(
            lag_valid if len(lag_valid) > 0 else np.array([0, 1]),
            lag_bins
        )

        # Detect extended state (inventory/forecast available)
        inv_valid = self.inventories[self.inventories > 0]
        forecast_valid = self.forecasts[self.forecasts > 0]
        self.has_extended_state = (len(inv_valid) > len(rows) * 0.1 and
                                   len(forecast_valid) > len(rows) * 0.1)

        if self.has_extended_state:
            self.inventory_thresholds = self._quantile_bins(inv_valid, inventory_bins)
            self.forecast_thresholds = self._quantile_bins(forecast_valid, forecast_bins)
        else:
            self.inventory_thresholds = np.array([0.0])
            self.forecast_thresholds = np.array([0.0])

        # Compute normalization ranges for continuous encoding
        self.qty_min, self.qty_max = self.qtys.min(), self.qtys.max()
        self.price_min, self.price_max = self.prices.min(), self.prices.max()

        if len(comp_valid) > 0:
            self.comp_min, self.comp_max = comp_valid.min(), comp_valid.max()
        else:
            self.comp_min, self.comp_max = 0.0, 1.0

        if len(lag_valid) > 0:
            self.lag_min, self.lag_max = lag_valid.min(), lag_valid.max()
        else:
            self.lag_min, self.lag_max = 0.0, 1.0

        if self.has_extended_state:
            self.inv_min, self.inv_max = inv_valid.min(), inv_valid.max()
            self.forecast_min, self.forecast_max = forecast_valid.min(), forecast_valid.max()
        else:
            self.inv_min, self.inv_max = 0.0, 1.0
            self.forecast_min, self.forecast_max = 0.0, 1.0

        # Compute base statistics
        self.base_price = float(np.mean(self.prices))
        self.base_cost = float(np.mean(self.costs))
        self.base_qty = float(np.mean(self.qtys))

    def _quantile_bins(self, values: np.ndarray, num_bins: int) -> np.ndarray:
        """
        Compute quantile thresholds for binning.

        Args:
            values: Array of continuous values
            num_bins: Number of bins to create

        Returns:
            Array of (num_bins - 1) threshold values

        Algorithm:
            For num_bins=3, returns [33rd percentile, 66th percentile]
            Value x is in bin i if thresholds[i-1] <= x < thresholds[i]
        """
        sorted_vals = np.sort(values)
        thresholds = []
        for i in range(1, num_bins):
            idx = int((i / num_bins) * len(sorted_vals))
            thresholds.append(sorted_vals[idx])
        return np.array(thresholds)

    def _digitize(self, value: float, thresholds: np.ndarray) -> int:
        """
        Convert continuous value to bin index.

        Args:
            value: Continuous value to bin
            thresholds: Array of threshold values

        Returns:
            Bin index (0 to len(thresholds))
        """
        for i, thresh in enumerate(thresholds):
            if value < thresh:
                return i
        return len(thresholds)

    def _normalize(self, value: float, min_val: float, max_val: float) -> float:
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

    def encode_discrete(self, row: Dict) -> Dict[str, int]:
        """
        Encode row into discrete state bins (for Q-learning).

        Args:
            row: Retail data dictionary

        Returns:
            Dictionary with keys: demandBin, competitorPriceBin, seasonBin,
            lagPriceBin, inventoryBin, forecastBin
        """
        # Season binning: winter (Dec-Feb)=0, spring (Mar-May)=1,
        # summer (Jun-Aug)=2, fall (Sep-Nov)=3
        month = row.get('month', 1)
        if month <= 2 or month == 12:
            season_bin = 0
        elif month <= 5:
            season_bin = 1
        elif month <= 8:
            season_bin = 2
        else:
            season_bin = 3

        return {
            'demandBin': self._digitize(row['qty'], self.demand_thresholds),
            'competitorPriceBin': self._digitize(row.get('comp_1', 0), self.comp_thresholds),
            'seasonBin': season_bin,
            'lagPriceBin': self._digitize(row.get('lag_price', 0), self.lag_thresholds),
            'inventoryBin': self._digitize(row.get('inventory_level', 0), self.inventory_thresholds) if self.has_extended_state else 0,
            'forecastBin': self._digitize(row.get('demand_forecast', 0), self.forecast_thresholds) if self.has_extended_state else 0,
        }

    def encode_continuous(self, row: Dict) -> np.ndarray:
        """
        Encode row into continuous normalized features (for DQN).

        Args:
            row: Retail data dictionary

        Returns:
            9-dimensional numpy array:
            [demand_level, competitor_price, season_sin, season_cos,
             lag_price, inventory_level, demand_forecast, margin_potential, price_ratio]

        Algorithm:
            - Normalize demand, prices to [0, 1] using min-max scaling
            - Encode season as (sin(2π×month/12), cos(2π×month/12)) for cyclical continuity
            - Include margin potential and price ratio as derived features
        """
        month = row.get('month', 1)

        # Cyclical season encoding: maps Dec-Jan boundary smoothly
        season_sin = math.sin(2 * math.pi * month / 12)
        season_cos = math.cos(2 * math.pi * month / 12)

        # Normalize continuous features
        demand_norm = self._normalize(row['qty'], self.qty_min, self.qty_max)
        comp_norm = self._normalize(row.get('comp_1', self.base_price),
                                    self.comp_min, self.comp_max)
        lag_norm = self._normalize(row.get('lag_price', self.base_price),
                                   self.lag_min, self.lag_max)

        if self.has_extended_state:
            inv_norm = self._normalize(row.get('inventory_level', 0),
                                      self.inv_min, self.inv_max)
            forecast_norm = self._normalize(row.get('demand_forecast', self.base_qty),
                                           self.forecast_min, self.forecast_max)
        else:
            inv_norm = 0.5  # Neutral value when not available
            forecast_norm = 0.5

        # Derived features
        price = row.get('unit_price', self.base_price)
        cost = row.get('freight_price', self.base_cost)
        margin_potential = self._normalize(price - cost, 0, self.base_price)  # Normalized margin
        price_ratio = self._normalize(price, self.price_min, self.price_max)

        return np.array([
            demand_norm,
            comp_norm,
            season_sin,
            season_cos,
            lag_norm,
            inv_norm,
            forecast_norm,
            margin_potential,
            price_ratio
        ], dtype=np.float32)

    def discrete_to_continuous(self, discrete_state: Dict[str, int]) -> np.ndarray:
        """
        Convert discrete state bins to approximate continuous features.

        Args:
            discrete_state: Dictionary with bin indices

        Returns:
            9-dimensional continuous state vector

        Algorithm:
            Map each bin to the midpoint of its range for continuous approximation.
            Used for exporting DQN policy to discrete lookup table.
        """
        # Map demand bin to approximate normalized value
        demand_norm = (discrete_state['demandBin'] + 0.5) / self.demand_bins

        # Map competitor bin to approximate normalized value
        comp_norm = (discrete_state['competitorPriceBin'] + 0.5) / self.competitor_bins

        # Map season bin to month, then cyclical encoding
        season_to_month = [1, 4, 7, 10]  # Representative months
        month = season_to_month[discrete_state['seasonBin']]
        season_sin = math.sin(2 * math.pi * month / 12)
        season_cos = math.cos(2 * math.pi * month / 12)

        # Map lag bin to approximate normalized value
        lag_norm = (discrete_state['lagPriceBin'] + 0.5) / self.lag_bins

        # Map inventory/forecast bins
        if self.has_extended_state:
            inv_norm = (discrete_state['inventoryBin'] + 0.5) / self.inventory_bins
            forecast_norm = (discrete_state['forecastBin'] + 0.5) / self.forecast_bins
        else:
            inv_norm = 0.5
            forecast_norm = 0.5

        # Use midpoint values for derived features
        margin_potential = 0.5
        price_ratio = 0.5

        return np.array([
            demand_norm,
            comp_norm,
            season_sin,
            season_cos,
            lag_norm,
            inv_norm,
            forecast_norm,
            margin_potential,
            price_ratio
        ], dtype=np.float32)

    def get_state_dim(self) -> int:
        """Return dimensionality of continuous state vector."""
        return 9

    def get_total_discrete_states(self) -> int:
        """Return total number of discrete states (for Q-learning comparison)."""
        if self.has_extended_state:
            return (self.demand_bins * self.competitor_bins * 4 *
                   self.lag_bins * self.inventory_bins * self.forecast_bins)
        return self.demand_bins * self.competitor_bins * 4 * self.lag_bins
