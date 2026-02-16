import type { RetailRow } from '../types/data';
import type { State, RewardWeights } from '../types/rl';
import { ACTION_MULTIPLIERS, DEMAND_BINS, COMPETITOR_BINS, SEASON_BINS, LAG_PRICE_BINS, NUM_ACTIONS } from '../types/rl';
import { quantileBins, digitize, mean } from '../utils/math';
import { computeReward } from './reward';

export interface EnvironmentConfig {
  productRows: RetailRow[];
  weights: RewardWeights;
}

export interface StepResult {
  nextState: State;
  reward: number;
  price: number;
  revenue: number;
  margin: number;
  volumeSold: number;
}

export class PricingEnvironment {
  private rows: RetailRow[];
  private demandThresholds: number[];
  private compThresholds: number[];
  private lagThresholds: number[];
  private basePrice: number;
  private baseCost: number;
  private baseQty: number;
  private elasticity: number;
  private weights: RewardWeights;
  private currentIdx: number = 0;

  // Normalization ranges (estimated from data)
  private revenueRange: { min: number; max: number };
  private marginRange: { min: number; max: number };
  private volumeRange: { min: number; max: number };

  constructor(config: EnvironmentConfig) {
    this.rows = config.productRows;
    this.weights = config.weights;

    const qtys = this.rows.map(r => r.qty);
    const comps = this.rows.map(r => r.comp_1).filter(c => c > 0);
    const lags = this.rows.map(r => r.lag_price).filter(l => l > 0);

    this.demandThresholds = quantileBins(qtys, DEMAND_BINS);
    this.compThresholds = quantileBins(comps.length > 0 ? comps : [0, 1], COMPETITOR_BINS);
    this.lagThresholds = quantileBins(lags.length > 0 ? lags : [0, 1], LAG_PRICE_BINS);

    this.basePrice = mean(this.rows.map(r => r.unit_price));
    this.baseCost = mean(this.rows.map(r => r.freight_price));
    this.baseQty = mean(qtys);

    // Estimate price elasticity from data variance
    const prices = this.rows.map(r => r.unit_price);
    const priceStd = Math.sqrt(prices.reduce((s, p) => s + (p - this.basePrice) ** 2, 0) / prices.length);
    const qtyMean = this.baseQty;
    // Inelastic demand (0.2–0.5): pricing up increases revenue because volume barely drops.
    // This gives the agent a clear gradient — higher prices yield more revenue and margin.
    this.elasticity = priceStd > 0 ? Math.min(0.5, Math.max(0.2, qtyMean / (priceStd * 40))) : 0.35;

    // Precompute normalization ranges — tighter ranges give better reward gradient
    const minMult = ACTION_MULTIPLIERS[0];
    const maxMult = ACTION_MULTIPLIERS[ACTION_MULTIPLIERS.length - 1];
    this.revenueRange = {
      min: this.basePrice * minMult * this.baseQty * 0.5,
      max: this.basePrice * maxMult * this.baseQty * 1.2,
    };
    this.marginRange = {
      min: (this.basePrice * minMult - this.baseCost) * this.baseQty * 0.5,
      max: (this.basePrice * maxMult - this.baseCost) * this.baseQty * 1.2,
    };
    this.volumeRange = { min: this.baseQty * 0.4, max: this.baseQty * 1.5 };
  }

  getState(row: RetailRow): State {
    const monthNum = row.month || 1;
    let seasonBin: number;
    if (monthNum <= 2 || monthNum === 12) seasonBin = 0; // winter
    else if (monthNum <= 5) seasonBin = 1; // spring
    else if (monthNum <= 8) seasonBin = 2; // summer
    else seasonBin = 3; // fall

    return {
      demandBin: digitize(row.qty, this.demandThresholds),
      competitorPriceBin: digitize(row.comp_1, this.compThresholds),
      seasonBin,
      lagPriceBin: digitize(row.lag_price, this.lagThresholds),
    };
  }

  stateToIndex(state: State): number {
    return (
      state.demandBin * (COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS) +
      state.competitorPriceBin * (SEASON_BINS * LAG_PRICE_BINS) +
      state.seasonBin * LAG_PRICE_BINS +
      state.lagPriceBin
    );
  }

  indexToState(index: number): State {
    const lagPriceBin = index % LAG_PRICE_BINS;
    const rem1 = Math.floor(index / LAG_PRICE_BINS);
    const seasonBin = rem1 % SEASON_BINS;
    const rem2 = Math.floor(rem1 / SEASON_BINS);
    const competitorPriceBin = rem2 % COMPETITOR_BINS;
    const demandBin = Math.floor(rem2 / COMPETITOR_BINS);
    return { demandBin, competitorPriceBin, seasonBin, lagPriceBin };
  }

  reset(): State {
    this.currentIdx = Math.floor(Math.random() * this.rows.length);
    return this.getState(this.rows[this.currentIdx]);
  }

  step(action: number): StepResult {
    const row = this.rows[this.currentIdx];
    const multiplier = ACTION_MULTIPLIERS[action];
    const price = this.basePrice * multiplier;

    // Log-linear demand model
    const priceChangeRatio = (price - this.basePrice) / (this.basePrice || 1);
    const predictedQty = Math.max(1, row.qty * Math.exp(-this.elasticity * priceChangeRatio));

    const revenue = price * predictedQty;
    const margin = (price - this.baseCost) * predictedQty;
    const volumeSold = predictedQty;

    const reward = computeReward(
      { revenue, margin, volume: volumeSold },
      this.weights,
      this.revenueRange,
      this.marginRange,
      this.volumeRange,
    );

    // Advance to next row
    this.currentIdx = (this.currentIdx + 1) % this.rows.length;
    const nextState = this.getState(this.rows[this.currentIdx]);

    return { nextState, reward, price, revenue, margin, volumeSold };
  }

  getBasePrice(): number {
    return this.basePrice;
  }

  getBaseCost(): number {
    return this.baseCost;
  }

  getBaseQty(): number {
    return this.baseQty;
  }

  getElasticity(): number {
    return this.elasticity;
  }

  getNumActions(): number {
    return NUM_ACTIONS;
  }

  simulateAction(state: State, action: number, overrides?: {
    demandMultiplier?: number;
    competitorPrice?: number;
    season?: number;
    inventoryLevel?: number;
  }): StepResult {
    const multiplier = ACTION_MULTIPLIERS[action];
    const price = this.basePrice * multiplier;

    // Use the same demand model as step() for consistency
    // Scale baseQty by demand bin (higher bin = higher demand)
    const demandFactor = overrides?.demandMultiplier ?? (0.5 + state.demandBin * 0.3);
    const baseQ = this.baseQty * demandFactor;
    const priceChangeRatio = (price - this.basePrice) / (this.basePrice || 1);
    const predictedQty = Math.max(1, baseQ * Math.exp(-this.elasticity * priceChangeRatio));

    const revenue = price * predictedQty;
    const margin = (price - this.baseCost) * predictedQty;
    const volumeSold = predictedQty;

    const reward = computeReward(
      { revenue, margin, volume: volumeSold },
      this.weights,
      this.revenueRange,
      this.marginRange,
      this.volumeRange,
    );

    return { nextState: state, reward, price, revenue, margin, volumeSold };
  }
}
