import type { State, ShapleyValue } from '../types/rl';
import { ACTION_MULTIPLIERS, DEMAND_BINS, COMPETITOR_BINS, SEASON_BINS, LAG_PRICE_BINS, INVENTORY_BINS, FORECAST_BINS } from '../types/rl';
import { factorial } from '../utils/math';
import type { QLearningAgent } from './q-learning';
import type { PricingEnvironment } from './environment';

type StateKey = keyof State;

const BASE_FEATURES: StateKey[] = ['demandBin', 'competitorPriceBin', 'seasonBin', 'lagPriceBin'];
const EXTENDED_FEATURES: StateKey[] = ['inventoryBin', 'forecastBin'];

const FEATURE_LABELS: Record<string, string[]> = {
  demandBin: ['Low Demand', 'Medium Demand', 'High Demand'],
  competitorPriceBin: ['Lower Comp.', 'Similar Comp.', 'Higher Comp.'],
  seasonBin: ['Winter', 'Spring', 'Summer', 'Fall'],
  lagPriceBin: ['Low Hist.', 'Medium Hist.', 'High Hist.'],
  inventoryBin: ['Low Inventory', 'Medium Inventory', 'High Inventory'],
  forecastBin: ['Low Forecast', 'Medium Forecast', 'High Forecast'],
};

function getBaselineState(hasExtended: boolean): State {
  return {
    demandBin: Math.floor(DEMAND_BINS / 2),
    competitorPriceBin: Math.floor(COMPETITOR_BINS / 2),
    seasonBin: Math.floor(SEASON_BINS / 2),
    lagPriceBin: Math.floor(LAG_PRICE_BINS / 2),
    inventoryBin: hasExtended ? Math.floor(INVENTORY_BINS / 2) : 0,
    forecastBin: hasExtended ? Math.floor(FORECAST_BINS / 2) : 0,
  };
}

function buildCoalitionState(
  coalition: Set<number>,
  features: StateKey[],
  actualState: State,
  baselineState: State,
): State {
  const state = { ...baselineState };
  for (const idx of coalition) {
    const feature = features[idx];
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

  const maxQ = Math.max(...qValues);
  if (maxQ <= 0.001) return basePrice;

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
  const hasExtended = env.hasExtendedState;
  const features: StateKey[] = hasExtended
    ? [...BASE_FEATURES, ...EXTENDED_FEATURES]
    : BASE_FEATURES;
  const n = features.length;

  const baselineState = getBaselineState(hasExtended);
  const basePrice = getExpectedPrice(agent, env, baselineState);
  const finalPrice = getExpectedPrice(agent, env, actualState);

  const shapValues: ShapleyValue[] = [];

  for (let i = 0; i < n; i++) {
    let shapValue = 0;

    const otherFeatures: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== i) otherFeatures.push(j);
    }

    const numSubsets = 1 << otherFeatures.length;
    for (let mask = 0; mask < numSubsets; mask++) {
      const S = new Set<number>();
      for (let bit = 0; bit < otherFeatures.length; bit++) {
        if (mask & (1 << bit)) {
          S.add(otherFeatures[bit]);
        }
      }

      const sSize = S.size;
      const weight = (factorial(sSize) * factorial(n - sSize - 1)) / factorial(n);

      const withI = new Set(S);
      withI.add(i);

      const priceWithout = getExpectedPrice(agent, env, buildCoalitionState(S, features, actualState, baselineState));
      const priceWith = getExpectedPrice(agent, env, buildCoalitionState(withI, features, actualState, baselineState));

      shapValue += weight * (priceWith - priceWithout);
    }

    const featureName = features[i];
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
