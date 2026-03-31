# DQN for Dynamic Pricing

Deep Q-Network (DQN) implementation for retail dynamic pricing with continuous state representation and neural network function approximation.

## Overview

This implementation provides a **PyTorch DQN agent** that learns optimal pricing strategies from retail data. Key features:

- **Continuous state representation**: No discretization loss, uses raw features
- **Double DQN**: Reduces Q-value overestimation for stable learning
- **Prioritized Experience Replay (PER)**: Focuses on high-error transitions
- **Soft target updates**: Smooth learning with Polyak averaging
- **Early stopping**: Prevents overfitting with patience-based termination
- **Production-ready**: Comprehensive logging, checkpointing, and evaluation

### Why DQN?

The existing Q-learning implementation uses **972 discrete states** (3×3×4×3×3×3 bins). DQN provides:

1. **No discretization loss**: Continuous features preserve information
2. **Better generalization**: Neural network interpolates between similar states
3. **Scalability**: Easily add new features without exponential state growth

## Quick Start

### Installation

```bash
cd python-dqn
pip install -r requirements.txt
```

### Training

```bash
python scripts/train_dqn.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --config config/dqn_config.yaml \
    --episodes 1000
```

**Expected output:**
- Training progress logged every 10 episodes
- Checkpoints saved to `checkpoints/`
- Metrics saved to `training_metrics.json`

### Evaluation

```bash
python scripts/evaluate_model.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --checkpoint checkpoints/best_model.pt \
    --episodes 100
```

**Output:**
- Mean reward, revenue, margin, volume
- Action distribution analysis
- Statistical comparison (if Q-learning results provided)

### Policy Export

```bash
python scripts/export_policy.py \
    --checkpoint checkpoints/best_model.pt \
    --output dqn_policy.json
```

**Output:** JSON mapping of 972 state indices to action indices for TypeScript integration.

## Architecture

### State Representation (9 dimensions)

| Feature | Description | Encoding |
|---------|-------------|----------|
| `demand_level` | Normalized quantity | Min-max [0, 1] |
| `competitor_price` | Normalized comp price | Min-max [0, 1] |
| `season_sin` | Seasonal cycle (sin) | sin(2π×month/12) |
| `season_cos` | Seasonal cycle (cos) | cos(2π×month/12) |
| `lag_price` | Previous price | Min-max [0, 1] |
| `inventory_level` | Stock level | Min-max [0, 1] |
| `demand_forecast` | Predicted demand | Min-max [0, 1] |
| `margin_potential` | Price - cost margin | Derived |
| `price_ratio` | Current price ratio | Derived |

**Cyclical encoding rationale:** Season wraps around (Dec → Jan), so sin/cos encoding captures continuity better than discrete bins.

### Network Architecture

```
Input (9) → FC(128) → BatchNorm → ReLU
          → FC(128) → BatchNorm → ReLU
          → FC(64)  → BatchNorm → ReLU
          → FC(12)  → Q-values
```

- **Parameters:** ~20K (balances capacity vs overfitting)
- **Initialization:** Xavier uniform for fast convergence
- **Batch normalization:** Stabilizes training with varying reward scales

### Action Space (12 actions)

Price multipliers: `[0.80, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.30, 1.40, 1.50, 1.60]`

### Reward Function

```
reward = 0.4 × norm_revenue + 0.4 × norm_margin + 0.2 × norm_volume
       - 0.15 × |price_change|
```

- **Revenue/Margin:** Min-max normalized to [0, 1]
- **Volume:** Threshold-based (full credit if ≥ 35% of range, linear penalty below)
- **Price change penalty:** Encourages stability

## Training Algorithm

### Double DQN Update

```
1. Sample batch from replay buffer (with priorities)
2. Compute Q(s, a) from online network
3. Select best actions: a' = argmax_a Q_online(s', a)
4. Evaluate actions: Q_target(s', a')
5. Compute target: y = r + γ × Q_target(s', a')
6. Loss: Huber(Q(s,a), y) weighted by importance sampling
7. Backpropagate with gradient clipping (max_norm=10)
8. Soft update target: θ_target ← τ×θ_online + (1-τ)×θ_target
9. Update priorities: priority ∝ |TD_error|^α
```

### Hyperparameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Learning rate | 1e-4 | AdamW optimizer |
| Batch size | 64 | Mini-batch size |
| Gamma (γ) | 0.0 | Discount factor (contextual bandit) |
| Tau (τ) | 0.005 | Soft update rate |
| Epsilon start | 1.0 | Initial exploration |
| Epsilon end | 0.01 | Final exploration |
| Epsilon decay | 0.995 | Exponential decay |
| Buffer size | 100K | Replay buffer capacity |
| PER alpha (α) | 0.6 | Priority exponent |
| PER beta (β) | 0.4 → 1.0 | Importance sampling (annealed) |
| Warmup steps | 1000 | Before training starts |
| Train frequency | 4 | Train every N steps |
| Early stop patience | 800 | Episodes without improvement |

### Contextual Bandit (γ=0)

Each pricing decision is **independent** (no long-term state dependencies), so we set discount factor γ=0. This simplifies to:

```
Q(s, a) ≈ E[r | s, a]
```

No bootstrapping, only immediate reward prediction.

## Configuration

All hyperparameters are in `config/dqn_config.yaml`. Key sections:

### Training
```yaml
training:
  episodes: 15000
  learning_rate: 0.0001
  epsilon_decay: 0.995
```

### Network
```yaml
network:
  hidden_dims: [128, 128, 64]
  use_batch_norm: true
```

### Replay
```yaml
replay:
  buffer_size: 100000
  use_per: true
  per_alpha: 0.6
```

### Environment
```yaml
environment:
  reward_weights:
    revenue: 0.4
    margin: 0.4
    volume: 0.2
  synthetic_ratio: 0.3
```

## Project Structure

```
python-dqn/
├── config/
│   └── dqn_config.yaml          # Hyperparameters
├── src/
│   ├── environment/
│   │   ├── pricing_env.py       # Port of TypeScript environment
│   │   └── state_encoder.py     # State normalization
│   ├── models/
│   │   ├── dqn_network.py       # Neural network
│   │   └── replay_buffer.py     # Experience replay with PER
│   ├── training/
│   │   └── trainer.py           # Training loop
│   └── utils/
│       └── reward.py            # Reward computation
├── scripts/
│   ├── train_dqn.py             # Training entry point
│   ├── evaluate_model.py        # Evaluation & comparison
│   └── export_policy.py         # Export for TypeScript
└── README.md
```

## Performance

### Expected Results

Based on Q-learning baseline:
- **Convergence:** ~1000-3000 episodes (with early stopping)
- **Training time:** ~10-20 minutes on CPU for 15K episodes
- **Performance:** DQN should match or exceed Q-learning (±5%)

### Metrics Tracked

- **Episode reward:** Total reward per episode
- **Average reward:** Rolling average (window=50)
- **Training loss:** Huber loss per batch
- **Epsilon:** Exploration rate decay
- **Action distribution:** Exploration vs exploitation

### Early Stopping

Monitors rolling average reward (last 50 episodes):
- Stops if no improvement > 0.001 for 800 consecutive episodes
- Saves best model checkpoint automatically

## Evaluation & Comparison

### Compare vs Q-Learning

```bash
python scripts/evaluate_model.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --checkpoint checkpoints/best_model.pt \
    --episodes 100 \
    --qlearning ../qlearning_results.json
```

**Output:**
- Side-by-side metric comparison
- Statistical significance (t-test)
- Percentage improvement

### Export Policy for TypeScript

```bash
python scripts/export_policy.py \
    --checkpoint checkpoints/best_model.pt \
    --output dqn_policy.json
```

Generates JSON lookup table with 972 state-action pairs for integration with TypeScript demo.

## Troubleshooting

### DQN underperforms Q-learning

**Solution:**
- Tune learning rate (try 5e-5 or 2e-4)
- Increase network size: `hidden_dims: [256, 256, 128]`
- Adjust epsilon decay (slower: 0.998, faster: 0.990)

### Training unstable (loss explodes)

**Solution:**
- Verify gradient clipping is enabled (`gradient_clip_max_norm: 10.0`)
- Reduce learning rate
- Check reward normalization ranges in environment

### Slow convergence

**Solution:**
- Increase batch size to 128
- Use hard target updates (set `tau: 1.0`, update every 100 steps)
- Tune PER parameters (`per_alpha: 0.4`)

### Overfitting to training data

**Solution:**
- Add dropout: `dropout_rate: 0.1`
- Increase synthetic ratio: `synthetic_ratio: 0.5`
- Reduce network size: `hidden_dims: [64, 64]`

## References

### Papers

- **DQN:** Mnih et al. (2015) "Human-level control through deep reinforcement learning"
- **Double DQN:** van Hasselt et al. (2015) "Deep Reinforcement Learning with Double Q-learning"
- **Prioritized Replay:** Schaul et al. (2015) "Prioritized Experience Replay"
- **Soft Updates:** Lillicrap et al. (2015) "Continuous control with deep reinforcement learning" (DDPG)

### TypeScript Implementation

- Environment: `/Users/tarunbandi/Desktop/dynamic-pricing-rl-demo/src/engine/environment.ts`
- Reward: `/Users/tarunbandi/Desktop/dynamic-pricing-rl-demo/src/engine/reward.ts`
- Q-Learning: `/Users/tarunbandi/Desktop/dynamic-pricing-rl-demo/src/engine/q-learning.ts`

## License

Same as parent project (Dynamic Pricing RL Demo).

## Contributing

This is a production-ready DQN implementation. For improvements:
1. Add GBRT demand model integration
2. Implement TensorBoard logging
3. Add visualization scripts (policy heatmaps)
4. Support multi-product training
5. Add hyperparameter search (Optuna)
