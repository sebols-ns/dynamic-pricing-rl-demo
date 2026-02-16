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
  // Threshold-based volume: full credit if volume stays above 40% of range,
  // linear penalty only for extreme volume loss. This prevents the volume component
  // from fighting against revenue/margin for moderate price increases.
  const rawVolume = normalize(inputs.volume, volumeRange.min, volumeRange.max);
  const volumeThreshold = 0.35;
  const normVolume = rawVolume >= volumeThreshold ? 1.0 : rawVolume / volumeThreshold;

  return (
    weights.revenue * normRevenue +
    weights.margin * normMargin +
    weights.volume * normVolume
  );
}
