import type { RetailRow } from '../types/data';
import type { State, RewardWeights } from '../types/rl';
import { ACTION_MULTIPLIERS, DEMAND_BINS, COMPETITOR_BINS, SEASON_BINS, LAG_PRICE_BINS, INVENTORY_BINS, FORECAST_BINS, NUM_ACTIONS } from '../types/rl';
import { quantileBins, digitize, mean } from '../utils/math';
import { computeReward } from './reward';
import type { GBRTModel } from './gbrt';
import { predictModel, encodeCategory } from './gbrt';

export interface EnvironmentConfig {
  productRows: RetailRow[];
  weights: RewardWeights;
  demandModel?: GBRTModel;
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
  private inventoryThresholds: number[];
  private forecastThresholds: number[];
  private basePrice: number;
  private baseCost: number;
  private baseQty: number;
  private elasticity: number;
  private weights: RewardWeights;
  private currentIdx: number = 0;
  private lastAction: number = -1;
  /** Penalty weight for price changes between steps (0 = no penalty) */
  private priceChangePenalty: number = 0.15;
  private demandModel: GBRTModel | null = null;

  /** True when the data has meaningful inventory_level / demand_forecast columns */
  readonly hasExtendedState: boolean;

  // Normalization ranges (estimated from data)
  private revenueRange: { min: number; max: number };
  private marginRange: { min: number; max: number };
  private volumeRange: { min: number; max: number };

  constructor(config: EnvironmentConfig) {
    this.rows = config.productRows;
    this.weights = config.weights;
    this.demandModel = config.demandModel ?? null;

    const qtys = this.rows.map(r => r.qty);
    const comps = this.rows.map(r => r.comp_1).filter(c => c > 0);
    const lags = this.rows.map(r => r.lag_price).filter(l => l > 0);

    this.demandThresholds = quantileBins(qtys, DEMAND_BINS);
    this.compThresholds = quantileBins(comps.length > 0 ? comps : [0, 1], COMPETITOR_BINS);
    this.lagThresholds = quantileBins(lags.length > 0 ? lags : [0, 1], LAG_PRICE_BINS);

    // Detect extended state columns
    const inventories = this.rows.map(r => r.inventory_level).filter(v => v > 0);
    const forecasts = this.rows.map(r => r.demand_forecast).filter(v => v > 0);
    this.hasExtendedState = inventories.length > this.rows.length * 0.1 && forecasts.length > this.rows.length * 0.1;

    if (this.hasExtendedState) {
      this.inventoryThresholds = quantileBins(inventories, INVENTORY_BINS);
      this.forecastThresholds = quantileBins(forecasts, FORECAST_BINS);
    } else {
      this.inventoryThresholds = [0];
      this.forecastThresholds = [0];
    }

    this.basePrice = mean(this.rows.map(r => r.unit_price));
    this.baseCost = mean(this.rows.map(r => r.freight_price));
    this.baseQty = mean(qtys);

    this.elasticity = 0.7;

    this.revenueRange = {
      min: this.basePrice * 0.95 * this.baseQty * 0.6,
      max: this.basePrice * 1.30 * this.baseQty * 1.1,
    };
    this.marginRange = {
      min: (this.basePrice * 0.95 - this.baseCost) * this.baseQty * 0.6,
      max: (this.basePrice * 1.30 - this.baseCost) * this.baseQty * 1.1,
    };
    this.volumeRange = { min: this.baseQty * 0.3, max: this.baseQty * 1.2 };
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
      inventoryBin: this.hasExtendedState ? digitize(row.inventory_level, this.inventoryThresholds) : 0,
      forecastBin: this.hasExtendedState ? digitize(row.demand_forecast, this.forecastThresholds) : 0,
    };
  }

  stateToIndex(state: State): number {
    // Order: demand, competitor, season, lag, inventory, forecast
    const invBins = this.hasExtendedState ? INVENTORY_BINS : 1;
    const frcBins = this.hasExtendedState ? FORECAST_BINS : 1;
    return (
      state.demandBin * (COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS * invBins * frcBins) +
      state.competitorPriceBin * (SEASON_BINS * LAG_PRICE_BINS * invBins * frcBins) +
      state.seasonBin * (LAG_PRICE_BINS * invBins * frcBins) +
      state.lagPriceBin * (invBins * frcBins) +
      state.inventoryBin * frcBins +
      state.forecastBin
    );
  }

  indexToState(index: number): State {
    const invBins = this.hasExtendedState ? INVENTORY_BINS : 1;
    const frcBins = this.hasExtendedState ? FORECAST_BINS : 1;

    const forecastBin = index % frcBins;
    let rem = Math.floor(index / frcBins);
    const inventoryBin = rem % invBins;
    rem = Math.floor(rem / invBins);
    const lagPriceBin = rem % LAG_PRICE_BINS;
    rem = Math.floor(rem / LAG_PRICE_BINS);
    const seasonBin = rem % SEASON_BINS;
    rem = Math.floor(rem / SEASON_BINS);
    const competitorPriceBin = rem % COMPETITOR_BINS;
    const demandBin = Math.floor(rem / COMPETITOR_BINS);
    return { demandBin, competitorPriceBin, seasonBin, lagPriceBin, inventoryBin, forecastBin };
  }

  getTotalStates(): number {
    if (this.hasExtendedState) {
      return DEMAND_BINS * COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS * INVENTORY_BINS * FORECAST_BINS;
    }
    return DEMAND_BINS * COMPETITOR_BINS * SEASON_BINS * LAG_PRICE_BINS;
  }

  /**
   * State-dependent elasticity: market conditions modulate price sensitivity.
   *
   * Extended state adds:
   * - Low inventory → less elastic (scarcity premium, can charge more)
   * - High demand forecast → less elastic (expected demand, can charge more)
   */
  private getEffectiveElasticity(state: State): number {
    let e = this.elasticity;
    const demandFactor = 1.8 - (state.demandBin / (DEMAND_BINS - 1)) * 1.2;
    const compFactor = 1.6 - (state.competitorPriceBin / (COMPETITOR_BINS - 1)) * 0.8;
    const seasonFactor = state.seasonBin === 2 ? 0.7 : state.seasonBin === 0 ? 1.3 : 1.0;
    e *= demandFactor * compFactor * seasonFactor;

    if (this.hasExtendedState) {
      // Low inventory (bin 0) → scarcity, less elastic (0.7x); high inventory (bin 2) → more elastic (1.3x)
      const inventoryFactor = 0.7 + (state.inventoryBin / (INVENTORY_BINS - 1)) * 0.6;
      // High forecast (bin 2) → confident demand, less elastic (0.8x); low forecast (bin 0) → more elastic (1.2x)
      const forecastFactor = 1.2 - (state.forecastBin / (FORECAST_BINS - 1)) * 0.4;
      e *= inventoryFactor * forecastFactor;
    }

    return Math.min(4.0, Math.max(0.05, e));
  }

  /**
   * Predict demand using the GBRT model by building a feature vector from the row
   * and overriding the price.
   */
  private predictWithGBRT(row: RetailRow, price: number): number {
    if (!this.demandModel) return 0;
    const features = [
      price,
      row.comp_1,
      row.month,
      row.lag_price,
      row.holiday,
      row.weekday,
      row.product_score,
      row.freight_price,
      encodeCategory(row.product_category_name),
      row.discount,
    ];
    return Math.max(1, predictModel(this.demandModel, features));
  }

  /**
   * Build an approximate feature vector from state bins for synthetic/simulated steps.
   * Maps bins back to continuous values using stored thresholds or reasonable defaults.
   */
  private buildSyntheticFeatures(state: State, price: number): number[] {
    // Map demand bin to approximate qty (not used as feature, but for reference)
    const seasonToMonth = [1, 4, 7, 10]; // winter=Jan, spring=Apr, summer=Jul, fall=Oct
    const month = seasonToMonth[state.seasonBin] ?? 1;

    // Approximate comp_1 from bin
    const compValues = this.compThresholds.length > 0
      ? [this.compThresholds[0] * 0.8, mean(this.compThresholds), this.compThresholds[this.compThresholds.length - 1] * 1.2]
      : [this.basePrice * 0.9, this.basePrice, this.basePrice * 1.1];
    const comp = compValues[Math.min(state.competitorPriceBin, compValues.length - 1)];

    // Approximate lag_price from bin
    const lagValues = this.lagThresholds.length > 0
      ? [this.lagThresholds[0] * 0.8, mean(this.lagThresholds), this.lagThresholds[this.lagThresholds.length - 1] * 1.2]
      : [this.basePrice * 0.9, this.basePrice, this.basePrice * 1.1];
    const lag = lagValues[Math.min(state.lagPriceBin, lagValues.length - 1)];

    const cat = encodeCategory(this.rows[0].product_category_name);
    const disc = mean(this.rows.map(r => r.discount));
    return [price, comp, month, lag, 0, 3, 4.0, this.baseCost, cat, disc];
  }

  hasDemandModel(): boolean {
    return this.demandModel !== null;
  }

  reset(): State {
    this.currentIdx = Math.floor(Math.random() * this.rows.length);
    this.lastAction = -1;
    return this.getState(this.rows[this.currentIdx]);
  }

  step(action: number): StepResult {
    const row = this.rows[this.currentIdx];
    const state = this.getState(row);
    const multiplier = ACTION_MULTIPLIERS[action];
    const price = this.basePrice * multiplier;

    let predictedQty: number;
    if (this.demandModel) {
      predictedQty = this.predictWithGBRT(row, price);
    } else {
      const effectiveElasticity = this.getEffectiveElasticity(state);
      const priceChangeRatio = (price - this.basePrice) / (this.basePrice || 1);
      // Use demand_forecast as base qty when available, fall back to actual qty
      const baseQ = this.hasExtendedState && row.demand_forecast > 0 ? row.demand_forecast : row.qty;
      predictedQty = Math.max(1, baseQ * Math.exp(-effectiveElasticity * priceChangeRatio));
    }

    const revenue = price * predictedQty;
    const margin = (price - this.baseCost) * predictedQty;
    const volumeSold = predictedQty;

    let reward = computeReward(
      { revenue, margin, volume: volumeSold },
      this.weights,
      this.revenueRange,
      this.marginRange,
      this.volumeRange,
    );

    // Penalize price changes to encourage stability
    if (this.lastAction >= 0 && action !== this.lastAction) {
      const prevMultiplier = ACTION_MULTIPLIERS[this.lastAction];
      const changeMagnitude = Math.abs(multiplier - prevMultiplier) / prevMultiplier;
      reward -= this.priceChangePenalty * changeMagnitude;
    }
    this.lastAction = action;

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

  randomState(): State {
    return {
      demandBin: Math.floor(Math.random() * DEMAND_BINS),
      competitorPriceBin: Math.floor(Math.random() * COMPETITOR_BINS),
      seasonBin: Math.floor(Math.random() * SEASON_BINS),
      lagPriceBin: Math.floor(Math.random() * LAG_PRICE_BINS),
      inventoryBin: this.hasExtendedState ? Math.floor(Math.random() * INVENTORY_BINS) : 0,
      forecastBin: this.hasExtendedState ? Math.floor(Math.random() * FORECAST_BINS) : 0,
    };
  }

  syntheticStep(state: State, action: number): StepResult {
    const multiplier = ACTION_MULTIPLIERS[action];
    const price = this.basePrice * multiplier;
    let predictedQty: number;
    if (this.demandModel) {
      const features = this.buildSyntheticFeatures(state, price);
      const noise = 0.9 + Math.random() * 0.2;
      predictedQty = Math.max(1, predictModel(this.demandModel, features) * noise);
    } else {
      const demandScale = 0.6 + (state.demandBin / (DEMAND_BINS - 1)) * 0.5;
      const baseQ = this.baseQty * demandScale;
      const effectiveElasticity = this.getEffectiveElasticity(state);
      const priceChangeRatio = (price - this.basePrice) / (this.basePrice || 1);
      const noise = 0.9 + Math.random() * 0.2;
      predictedQty = Math.max(1, baseQ * Math.exp(-effectiveElasticity * priceChangeRatio) * noise);
    }

    const revenue = price * predictedQty;
    const margin = (price - this.baseCost) * predictedQty;
    const volumeSold = predictedQty;

    let reward = computeReward(
      { revenue, margin, volume: volumeSold },
      this.weights,
      this.revenueRange,
      this.marginRange,
      this.volumeRange,
    );

    // Penalize price changes to encourage stability
    if (this.lastAction >= 0 && action !== this.lastAction) {
      const prevMultiplier = ACTION_MULTIPLIERS[this.lastAction];
      const changeMagnitude = Math.abs(multiplier - prevMultiplier) / prevMultiplier;
      reward -= this.priceChangePenalty * changeMagnitude;
    }

    return { nextState: this.randomState(), reward, price, revenue, margin, volumeSold };
  }

  simulateAction(state: State, action: number, overrides?: {
    demandMultiplier?: number;
    competitorPrice?: number;
    season?: number;
    inventoryLevel?: number;
  }): StepResult {
    const multiplier = ACTION_MULTIPLIERS[action];
    const price = this.basePrice * multiplier;

    let predictedQty: number;
    if (this.demandModel) {
      const features = this.buildSyntheticFeatures(state, price);
      predictedQty = Math.max(1, predictModel(this.demandModel, features));
    } else {
      const demandScale = overrides?.demandMultiplier ?? (0.6 + (state.demandBin / (DEMAND_BINS - 1)) * 0.5);
      const baseQ = this.baseQty * demandScale;
      const effectiveElasticity = this.getEffectiveElasticity(state);
      const priceChangeRatio = (price - this.basePrice) / (this.basePrice || 1);
      predictedQty = Math.max(1, baseQ * Math.exp(-effectiveElasticity * priceChangeRatio));
    }

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
