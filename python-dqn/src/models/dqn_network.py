"""
DQN Neural Network Architecture

Purpose:
    Deep Q-Network for continuous state approximation of Q-values.
    Learns mapping from 9-dimensional state to 12 Q-values (one per action).

Architecture:
    Input (9) → FC(128) → BatchNorm → ReLU
              → FC(128) → BatchNorm → ReLU
              → FC(64) → BatchNorm → ReLU
              → FC(12) → Q-values

    Total parameters: ~20K (balances capacity vs overfitting)

Usage:
    network = DQNNetwork(state_dim=9, action_dim=12, hidden_dims=[128, 128, 64])
    q_values = network(state_batch)  # shape: (batch_size, 12)

Reference:
    - DQN: Mnih et al. (2015) "Human-level control through deep RL"
    - Double DQN: van Hasselt et al. (2015) "Deep RL with Double Q-learning"
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List


class DQNNetwork(nn.Module):
    """
    Deep Q-Network with batch normalization for stable training.

    Attributes:
        state_dim: Dimensionality of input state
        action_dim: Number of discrete actions (output Q-values)
        hidden_dims: List of hidden layer sizes
        use_batch_norm: Whether to use batch normalization
    """

    def __init__(
        self,
        state_dim: int,
        action_dim: int,
        hidden_dims: List[int] = [128, 128, 64],
        use_batch_norm: bool = True,
        dropout_rate: float = 0.0
    ):
        """
        Args:
            state_dim: Input state dimensionality
            action_dim: Number of actions (output dimensionality)
            hidden_dims: List of hidden layer sizes (default [128, 128, 64])
            use_batch_norm: Enable batch normalization (default True)
            dropout_rate: Dropout probability after each hidden layer (default 0.0)
        """
        super(DQNNetwork, self).__init__()

        self.state_dim = state_dim
        self.action_dim = action_dim
        self.use_batch_norm = use_batch_norm
        self.dropout_rate = dropout_rate

        # Build layers
        layers = []
        input_dim = state_dim

        for hidden_dim in hidden_dims:
            # Fully connected layer
            fc = nn.Linear(input_dim, hidden_dim)
            layers.append(fc)

            # Batch normalization
            if use_batch_norm:
                bn = nn.BatchNorm1d(hidden_dim)
                layers.append(bn)

            # Activation
            layers.append(nn.ReLU())

            # Optional dropout
            if dropout_rate > 0:
                layers.append(nn.Dropout(dropout_rate))

            input_dim = hidden_dim

        # Output layer (no activation, Q-values can be any real number)
        layers.append(nn.Linear(input_dim, action_dim))

        self.network = nn.Sequential(*layers)

        # Initialize weights using Xavier/Glorot initialization
        self._initialize_weights()

    def _initialize_weights(self):
        """
        Initialize network weights using Xavier uniform initialization.

        Algorithm:
            - Linear layers: Xavier uniform (good for tanh/relu)
            - Batch norm: weight=1, bias=0

        Rationale:
            Xavier initialization helps prevent vanishing/exploding gradients
            by keeping variance consistent across layers.
        """
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.constant_(module.bias, 0)
            elif isinstance(module, nn.BatchNorm1d):
                nn.init.constant_(module.weight, 1)
                nn.init.constant_(module.bias, 0)

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        """
        Forward pass through the network.

        Args:
            state: State tensor of shape (batch_size, state_dim) or (state_dim,)

        Returns:
            Q-values tensor of shape (batch_size, action_dim) or (action_dim,)

        Algorithm:
            1. Pass state through hidden layers with batch norm and ReLU
            2. Output layer produces raw Q-values (no activation)
        """
        # Handle single state (add batch dimension)
        if state.dim() == 1:
            state = state.unsqueeze(0)
            squeeze_output = True
        else:
            squeeze_output = False

        # Set network to eval mode for single samples (batch norm requires batch_size > 1 in training mode)
        if squeeze_output and self.training:
            self.eval()
            q_values = self.network(state)
            self.train()
        else:
            q_values = self.network(state)

        # Remove batch dimension if input was single state
        if squeeze_output:
            q_values = q_values.squeeze(0)

        return q_values

    def get_action(self, state: torch.Tensor, epsilon: float = 0.0) -> int:
        """
        Select action using epsilon-greedy policy.

        Args:
            state: State tensor of shape (state_dim,)
            epsilon: Exploration rate in [0, 1]

        Returns:
            Action index in [0, action_dim - 1]

        Algorithm:
            With probability epsilon: select random action (exploration)
            With probability 1-epsilon: select argmax_a Q(s, a) (exploitation)
        """
        if torch.rand(1).item() < epsilon:
            return torch.randint(0, self.action_dim, (1,)).item()

        with torch.no_grad():
            q_values = self.forward(state)
            return q_values.argmax().item()

    def get_max_q_value(self, state: torch.Tensor) -> float:
        """
        Get maximum Q-value for a given state.

        Args:
            state: State tensor of shape (state_dim,)

        Returns:
            Maximum Q-value across all actions
        """
        with torch.no_grad():
            q_values = self.forward(state)
            return q_values.max().item()
