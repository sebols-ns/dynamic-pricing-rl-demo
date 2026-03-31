# Quick Start Guide

Get DQN training in 5 minutes.

## 1. Install Dependencies

```bash
cd python-dqn
pip install -r requirements.txt
```

**Requirements:**
- Python 3.8+
- PyTorch 2.0+
- NumPy, Pandas, PyYAML, scikit-learn

## 2. Verify Installation

Run integration test:

```bash
python scripts/test_integration.py
```

Expected output: `ALL TESTS PASSED ✓`

## 3. Train DQN

Basic training (100 episodes for quick test):

```bash
python scripts/train_dqn.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --episodes 100
```

Full training (15,000 episodes with early stopping):

```bash
python scripts/train_dqn.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --config config/dqn_config.yaml
```

**Expected output:**
```
Episode 10/15000 | Reward: 0.5234 | Avg Reward: 0.4891 | Loss: 0.0234 | Epsilon: 0.951
Episode 20/15000 | Reward: 0.6102 | Avg Reward: 0.5432 | Loss: 0.0198 | Epsilon: 0.904
...
Early stopping at episode 1234
Best average reward: 0.7856
```

**Output files:**
- `checkpoints/best_model.pt` - Best model during training
- `checkpoints/final_model.pt` - Final model
- `training_metrics.json` - Episode-by-episode metrics

## 4. Evaluate Model

```bash
python scripts/evaluate_model.py \
    --data ../retail_store_inventory.csv \
    --product "Product_0" \
    --checkpoint checkpoints/best_model.pt \
    --episodes 100
```

**Expected output:**
```
Evaluation Results
==================
Episodes: 100
Mean Reward: 0.7891 ± 0.0234
Mean Revenue: $1250.45 ± $45.23
Mean Margin: $625.12 ± $23.45
Mean Volume: 12.34 ± 1.23

Action Distribution:
  Action 3 (×1.00): 0.234
  Action 4 (×1.05): 0.345
  Action 5 (×1.10): 0.287
  ...
```

## 5. Export Policy (Optional)

Export DQN as lookup table for TypeScript:

```bash
python scripts/export_policy.py \
    --checkpoint checkpoints/best_model.pt \
    --output dqn_policy.json
```

Creates JSON file with 972 state-action pairs for integration.

## Configuration

Edit `config/dqn_config.yaml` to tune hyperparameters:

```yaml
training:
  episodes: 15000          # Max episodes
  learning_rate: 0.0001    # AdamW learning rate
  epsilon_decay: 0.995     # Exploration decay rate

network:
  hidden_dims: [128, 128, 64]  # Layer sizes

replay:
  buffer_size: 100000      # Experience replay capacity
  use_per: true            # Prioritized replay
```

## Troubleshooting

### Training too slow
- Reduce `episodes` to 1000 for quick test
- Reduce `buffer_size` to 10000
- Use smaller network: `hidden_dims: [64, 64]`

### DQN underperforms Q-learning
- Increase training: `episodes: 20000`
- Tune learning rate: try 0.0005 or 0.00005
- Slower epsilon decay: `epsilon_decay: 0.998`

### Loss explodes
- Check `gradient_clip_max_norm: 10.0` is enabled
- Reduce learning rate: `learning_rate: 0.00005`

## Next Steps

- Read [README.md](README.md) for full architecture details
- Compare with Q-learning using `--qlearning` flag in evaluation
- Visualize training curves from `training_metrics.json`
- Integrate exported policy with TypeScript demo

## Expected Performance

Based on Q-learning baseline:
- **Convergence:** 1000-3000 episodes
- **Training time:** 10-20 minutes (CPU)
- **Final reward:** 0.75-0.85 (comparable to Q-learning)

## Support

If you encounter issues:
1. Run `python scripts/test_integration.py` to verify installation
2. Check Python version: `python --version` (requires 3.8+)
3. Verify PyTorch: `python -c "import torch; print(torch.__version__)"`
