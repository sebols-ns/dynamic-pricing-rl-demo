export interface State {
  demandBin: number;
  competitorPriceBin: number;
  seasonBin: number;
  lagPriceBin: number;
}

export const ACTION_MULTIPLIERS = [0.70, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20] as const;
export const NUM_ACTIONS = ACTION_MULTIPLIERS.length;

export const DEMAND_BINS = 5;
export const COMPETITOR_BINS = 5;
export const SEASON_BINS = 4;
export const LAG_PRICE_BINS = 5;
export const TOTAL_STATES = DEMAND_BINS * COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS; // 500

export interface TrainingConfig {
  learningRate: number;
  discountFactor: number;
  epsilonStart: number;
  epsilonEnd: number;
  epsilonDecay: number;
  episodes: number;
  earlyStopPatience: number;
  earlyStopThreshold: number;
}

export const DEFAULT_CONFIG: TrainingConfig = {
  learningRate: 0.2,
  discountFactor: 0.0, // Contextual bandit: pricing decisions are independent
  epsilonStart: 1.0,
  epsilonEnd: 0.01,
  epsilonDecay: 0.998,
  episodes: 3000,
  earlyStopPatience: 100,
  earlyStopThreshold: 0.005,
};

export interface EpisodeResult {
  episode: number;
  totalReward: number;
  avgReward: number;
  epsilon: number;
  steps: number;
}

export interface RewardWeights {
  revenue: number;
  margin: number;
  volume: number;
}

export interface ShapleyValue {
  feature: string;
  value: number;
  label: string;
}
