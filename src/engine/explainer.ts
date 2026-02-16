import type { State, ShapleyValue } from '../types/rl';
import { ACTION_MULTIPLIERS, DEMAND_BINS, COMPETITOR_BINS, SEASON_BINS, LAG_PRICE_BINS } from '../types/rl';
import { factorial } from '../utils/math';
import type { QLearningAgent } from './q-learning';
import type { PricingEnvironment } from './environment';

const FEATURES = ['demandBin', 'competitorPriceBin', 'seasonBin', 'lagPriceBin'] as const;
const NUM_FEATURES = FEATURES.length;

const FEATURE_LABELS: Record<string, string[]> = {
  demandBin: ['Low Demand', 'Medium Demand', 'High Demand'],
  competitorPriceBin: ['Lower Comp.', 'Similar Comp.', 'Higher Comp.'],
  seasonBin: ['Winter', 'Spring', 'Summer', 'Fall'],
  lagPriceBin: ['Low Hist.', 'Medium Hist.', 'High Hist.'],
};

function getBaselineState(): State {
  return {
    demandBin: Math.floor(DEMAND_BINS / 2),
    competitorPriceBin: Math.floor(COMPETITOR_BINS / 2),
    seasonBin: Math.floor(SEASON_BINS / 2),
    lagPriceBin: Math.floor(LAG_PRICE_BINS / 2),
  };
}

function buildCoalitionState(
  coalition: Set<number>,
  actualState: State,
  baselineState: State,
): State {
  const state = { ...baselineState };
  for (const idx of coalition) {
    const feature = FEATURES[idx];
    state[feature] = actualState[feature];
  }
  return state;
}

/**
 * Softmax-weighted expected price. Using the argmax price alone produces 0 Shapley values
 * when many states share the same best action. The softmax weighting gives a continuous
 * signal that reflects the *strength* of the agent's preference, not just the winner.
 */
function getExpectedPrice(agent: QLearningAgent, env: PricingEnvironment, state: State): number {
  const stateIndex = env.stateToIndex(state);
  const qValues = agent.getQValues(stateIndex);
  const basePrice = env.getBasePrice();

  // Check if Q-values are all zero (untrained) — return base price
  const maxQ = Math.max(...qValues);
  if (maxQ <= 0.001) return basePrice;

  // Softmax with temperature — lower temp = sharper distribution
  const temperature = Math.max(0.05, maxQ * 0.1);
  const expValues = qValues.map(q => Math.exp((q - maxQ) / temperature));
  const sumExp = expValues.reduce((s, v) => s + v, 0);

  let expectedPrice = 0;
  for (let i = 0; i < qValues.length; i++) {
    expectedPrice += (expValues[i] / sumExp) * basePrice * ACTION_MULTIPLIERS[i];
  }
  return expectedPrice;
}

export function computeShapleyValues(
  actualState: State,
  agent: QLearningAgent,
  env: PricingEnvironment,
): { shapValues: ShapleyValue[]; basePrice: number; finalPrice: number } {
  const baselineState = getBaselineState();
  const basePrice = getExpectedPrice(agent, env, baselineState);
  // finalPrice must also use getExpectedPrice so that basePrice + sum(shapley) = finalPrice
  const finalPrice = getExpectedPrice(agent, env, actualState);

  const shapValues: ShapleyValue[] = [];
  const n = NUM_FEATURES;

  for (let i = 0; i < n; i++) {
    let shapValue = 0;

    // Enumerate all subsets S of features NOT including i
    const otherFeatures = [];
    for (let j = 0; j < n; j++) {
      if (j !== i) otherFeatures.push(j);
    }

    const numSubsets = 1 << otherFeatures.length; // 2^(n-1) = 8 subsets
    for (let mask = 0; mask < numSubsets; mask++) {
      const S = new Set<number>();
      for (let bit = 0; bit < otherFeatures.length; bit++) {
        if (mask & (1 << bit)) {
          S.add(otherFeatures[bit]);
        }
      }

      const sSize = S.size;
      const weight = (factorial(sSize) * factorial(n - sSize - 1)) / factorial(n);

      // V(S ∪ {i}) - V(S)
      const withI = new Set(S);
      withI.add(i);

      const priceWithout = getExpectedPrice(agent, env, buildCoalitionState(S, actualState, baselineState));
      const priceWith = getExpectedPrice(agent, env, buildCoalitionState(withI, actualState, baselineState));

      shapValue += weight * (priceWith - priceWithout);
    }

    const featureName = FEATURES[i];
    const binValue = actualState[featureName];
    const labels = FEATURE_LABELS[featureName];
    const label = labels[binValue] || `Bin ${binValue}`;

    shapValues.push({
      feature: featureName,
      value: shapValue,
      label,
    });
  }

  return { shapValues, basePrice, finalPrice };
}
