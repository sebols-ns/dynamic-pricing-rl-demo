# Example Workflow: Training DQN from Scratch

Complete end-to-end workflow for training and evaluating DQN on retail pricing data.

## Prerequisites

```bash
cd python-dqn
pip install -r requirements.txt
python scripts/test_integration.py  # Verify installation
```

## Workflow Steps

### Step 1: Prepare Data

Ensure you have retail data CSV with required columns:
- `product_id`: Product identifier
- `qty`: Quantity sold
- `unit_price`: Selling price
- `freight_price`: Cost per unit
- `month`: Month (1-12)
- Optional: `comp_1`, `lag_price`, `inventory_level`, `demand_forecast`

Example data location: `../retail_store_inventory.csv`

### Step 2: Configure Training

Review and edit `config/dqn_config.yaml` if needed:

```yaml
training:
  episodes: 15000          # Adjust based on convergence
  learning_rate: 0.0001    # Tune if unstable
  epsilon_decay: 0.995     # Slower decay = more exploration

early_stopping:
  patience: 800            # Episodes without improvement
  min_delta: 0.001         # Minimum improvement threshold
```

### Step 3: Train DQN

**Quick test (100 episodes):**
```bash
python scripts/train_dqn.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --episodes 100 \
    --output quick_test_metrics.json
```

**Full training (15K episodes with early stopping):**
```bash
python scripts/train_dqn.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --config config/dqn_config.yaml \
    --output training_metrics.json
```

**Monitor progress:**
```
Episode 10/15000 | Reward: 0.5234 | Avg Reward: 0.4891 | Loss: 0.0234 | Epsilon: 0.951
Episode 20/15000 | Reward: 0.6102 | Avg Reward: 0.5432 | Loss: 0.0198 | Epsilon: 0.904
Episode 30/15000 | Reward: 0.6543 | Avg Reward: 0.5789 | Loss: 0.0176 | Epsilon: 0.859
...
Episode 1230/15000 | Reward: 0.7891 | Avg Reward: 0.7856 | Loss: 0.0043 | Epsilon: 0.186

Early stopping at episode 1230
Best average reward: 0.7856
```

**Checkpoints saved:**
- `checkpoints/best_model.pt` - Best model (highest avg reward)
- `checkpoints/final_model.pt` - Last episode model
- `training_metrics.json` - Episode-by-episode data

### Step 4: Evaluate Performance

```bash
python scripts/evaluate_model.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --checkpoint checkpoints/best_model.pt \
    --episodes 100 \
    --output evaluation_results.json
```

**Output:**
```
============================================================
Evaluation Results
============================================================
Episodes: 100
Mean Reward: 0.7891 ± 0.0234
Mean Revenue: $1250.45 ± $45.23
Mean Margin: $625.12 ± $23.45
Mean Volume: 12.34 ± 1.23

Action Distribution:
  Action 0 (×0.80): 0.012
  Action 1 (×0.90): 0.034
  Action 2 (×0.95): 0.089
  Action 3 (×1.00): 0.234
  Action 4 (×1.05): 0.345
  Action 5 (×1.10): 0.287
  ...
```

### Step 5: Compare with Q-Learning (Optional)

If you have Q-learning baseline results:

```bash
python scripts/evaluate_model.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --checkpoint checkpoints/best_model.pt \
    --episodes 100 \
    --qlearning ../qlearning_results.json \
    --output dqn_vs_qlearning.json
```

**Output includes:**
```
============================================================
DQN vs Q-Learning Comparison
============================================================

mean_reward:
  DQN:        0.7891
  Q-Learning: 0.7623
  Difference: +0.0268 (+3.51%)

mean_revenue:
  DQN:        1250.45
  Q-Learning: 1198.23
  Difference: +52.22 (+4.36%)

Statistical Significance (t-test):
  t-statistic: 2.456
  p-value: 0.0156
  Significant: Yes (p < 0.05)
```

### Step 6: Export Policy for TypeScript

```bash
python scripts/export_policy.py \
    --checkpoint checkpoints/best_model.pt \
    --output dqn_policy.json
```

**Output:**
- `dqn_policy.json` - Lookup table with 972 state-action pairs

**Sample content:**
```json
{
  "0": 3,
  "1": 4,
  "2": 5,
  ...
  "971": 6
}
```

**Action distribution:**
```
Action distribution:
  Action 2 (×0.95): 45 (4.6%)
  Action 3 (×1.00): 234 (24.1%)
  Action 4 (×1.05): 345 (35.5%)
  Action 5 (×1.10): 287 (29.5%)
  Action 6 (×1.15): 61 (6.3%)
```

### Step 7: Analyze Results

**Plot training curves (optional):**
```python
import json
import matplotlib.pyplot as plt

with open('training_metrics.json') as f:
    metrics = json.load(f)

episodes = [m['episode'] for m in metrics]
rewards = [m['reward'] for m in metrics]

plt.figure(figsize=(10, 6))
plt.plot(episodes, rewards, alpha=0.3)
plt.plot(episodes, pd.Series(rewards).rolling(50).mean(), linewidth=2)
plt.xlabel('Episode')
plt.ylabel('Reward')
plt.title('DQN Training Progress')
plt.savefig('training_curve.png')
```

**Key metrics to check:**
- ✓ Convergence: Reward plateaus after ~1000-3000 episodes
- ✓ Stability: Rolling average has low variance
- ✓ Performance: Final reward ≥ 0.75 (comparable to Q-learning)
- ✓ Action diversity: Not stuck on single action

### Step 8: Integrate with TypeScript Demo (Optional)

**Load policy in TypeScript:**
```typescript
import dqnPolicy from './dqn_policy.json';

function getDQNAction(state: State): number {
  const stateIndex = stateToIndex(state);
  return dqnPolicy[stateIndex.toString()];
}
```

**Compare in UI:**
- Toggle between Q-learning and DQN policies
- Show side-by-side performance metrics
- Visualize action differences

## Troubleshooting

### Training not converging
**Symptoms:** Reward oscillates, doesn't increase
**Solutions:**
1. Increase episodes: `--episodes 20000`
2. Slower epsilon decay: `epsilon_decay: 0.998`
3. Smaller learning rate: `learning_rate: 0.00005`
4. Check data: Ensure enough variety in states

### Loss exploding
**Symptoms:** Loss suddenly jumps to large values (>1.0)
**Solutions:**
1. Verify gradient clipping: `gradient_clip_max_norm: 10.0`
2. Reduce learning rate: `learning_rate: 0.00005`
3. Check reward ranges in environment

### DQN worse than Q-learning
**Symptoms:** Mean reward < 0.7 or < Q-learning baseline
**Solutions:**
1. Tune learning rate: try [0.00005, 0.0002]
2. Increase network size: `hidden_dims: [256, 256, 128]`
3. More exploration: `epsilon_end: 0.05`, `epsilon_decay: 0.998`
4. More episodes: `episodes: 25000`

### Slow training
**Symptoms:** Taking >30 minutes for 15K episodes
**Solutions:**
1. Reduce buffer size: `buffer_size: 50000`
2. Increase train frequency: `train_frequency: 8`
3. Smaller network: `hidden_dims: [64, 64]`
4. Use GPU: `device = torch.device('cuda')`

### Overfitting
**Symptoms:** Training reward high, evaluation reward low
**Solutions:**
1. Add dropout: `dropout_rate: 0.1`
2. Increase synthetic ratio: `synthetic_ratio: 0.5`
3. Early stopping: `patience: 500`
4. Reduce network size: `hidden_dims: [64, 64]`

## Expected Timings (CPU)

| Task | Episodes | Time |
|------|----------|------|
| Quick test | 100 | 1-2 min |
| Partial training | 1000 | 5-10 min |
| Full training | 15000 | 20-30 min |
| Evaluation | 100 | 1 min |
| Policy export | - | 10 sec |

## File Outputs

After complete workflow, you should have:

```
python-dqn/
├── checkpoints/
│   ├── best_model.pt          # Best model checkpoint
│   └── final_model.pt         # Final model checkpoint
├── training_metrics.json      # Episode-by-episode training data
├── evaluation_results.json    # Evaluation metrics
├── dqn_policy.json           # Exported lookup table
└── dqn_vs_qlearning.json     # Comparison results (optional)
```

## Next Steps

1. **Hyperparameter tuning:** Experiment with config values
2. **Multi-product:** Train on different products, compare
3. **Visualization:** Plot policies, heatmaps, action distributions
4. **Production deployment:** API server for real-time inference
5. **Advanced methods:** Dueling DQN, Rainbow DQN, A2C/PPO

## Success Criteria

✓ Training converges (reward plateaus)
✓ Evaluation reward ≥ 0.75
✓ Performance comparable to Q-learning (±5%)
✓ Stable action distribution (not stuck on single action)
✓ All tests pass
✓ Policy exports successfully

If all criteria met: **DQN implementation successful!** 🎉
