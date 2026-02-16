export interface State {
  demandBin: number;
  competitorPriceBin: number;
  seasonBin: number;
  lagPriceBin: number;
}

export const ACTION_MULTIPLIERS = [0.80, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.30, 1.40, 1.50, 1.60] as const;
export const NUM_ACTIONS = ACTION_MULTIPLIERS.length;

export const DEMAND_BINS = 3;
export const COMPETITOR_BINS = 3;
export const SEASON_BINS = 4;
export const LAG_PRICE_BINS = 3;
export const TOTAL_STATES = DEMAND_BINS * COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS; // 108

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
  epsilonDecay: 0.997,
  episodes: 5000,
  earlyStopPatience: 300,
  earlyStopThreshold: 0.002,
};

export interface EpisodeResult {
  episode: number;
  totalReward: number;
  avgReward: number;
  avgRevenue: number;
  avgMargin: number;
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
