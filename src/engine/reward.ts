import type { RewardWeights } from '../types/rl';
import { normalize } from '../utils/math';

interface RewardInputs {
  revenue: number;
  margin: number;
  volume: number;
}

interface Range {
  min: number;
  max: number;
}

export function computeReward(
  inputs: RewardInputs,
  weights: RewardWeights,
  revenueRange: Range,
  marginRange: Range,
  volumeRange: Range,
): number {
  const normRevenue = normalize(inputs.revenue, revenueRange.min, revenueRange.max);
  const normMargin = normalize(inputs.margin, marginRange.min, marginRange.max);
  // Cap volume at 1.0 (baseline) — penalize losing volume but don't reward gaining it
  // This prevents the agent from always discounting to chase volume
  const normVolume = Math.min(1.0, normalize(inputs.volume, volumeRange.min, volumeRange.max));

  return (
    weights.revenue * normRevenue +
    weights.margin * normMargin +
    weights.volume * normVolume
  );
}
