import type { TrainingConfig, EpisodeResult } from '../types/rl';
import { TOTAL_STATES, NUM_ACTIONS, DEFAULT_CONFIG } from '../types/rl';
import { argmax } from '../utils/math';
import type { PricingEnvironment } from './environment';

export class QLearningAgent {
  qTable: Float64Array;
  private config: TrainingConfig;
  epsilon: number;
  private totalStates: number;
  private numActions: number;

  constructor(config: Partial<TrainingConfig> = {}, totalStates?: number) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.totalStates = totalStates ?? TOTAL_STATES;
    this.numActions = NUM_ACTIONS;
    this.qTable = new Float64Array(this.totalStates * this.numActions);
    // Zero initialization — epsilon-greedy handles exploration
    this.qTable.fill(0.0);
    this.epsilon = this.config.epsilonStart;
  }

  getQValues(stateIndex: number): number[] {
    const offset = stateIndex * this.numActions;
    const values: number[] = [];
    for (let i = 0; i < this.numActions; i++) {
      values.push(this.qTable[offset + i]);
    }
    return values;
  }

  selectAction(stateIndex: number): { action: number; isExploration: boolean } {
    if (Math.random() < this.epsilon) {
      return {
        action: Math.floor(Math.random() * this.numActions),
        isExploration: true,
      };
    }
    return {
      action: argmax(this.getQValues(stateIndex)),
      isExploration: false,
    };
  }

  getBestAction(stateIndex: number): number {
    return argmax(this.getQValues(stateIndex));
  }

  update(stateIndex: number, action: number, reward: number, nextStateIndex: number): void {
    const offset = stateIndex * this.numActions;
    const nextOffset = nextStateIndex * this.numActions;

    let maxNextQ = this.qTable[nextOffset];
    for (let i = 1; i < this.numActions; i++) {
      if (this.qTable[nextOffset + i] > maxNextQ) {
        maxNextQ = this.qTable[nextOffset + i];
      }
    }

    const currentQ = this.qTable[offset + action];
    const target = reward + this.config.discountFactor * maxNextQ;
    this.qTable[offset + action] = currentQ + this.config.learningRate * (target - currentQ);
  }

  decayEpsilon(): void {
    this.epsilon = Math.max(
      this.config.epsilonEnd,
      this.epsilon * this.config.epsilonDecay,
    );
  }

  runEpisode(env: PricingEnvironment, stepsPerEpisode: number = 200): EpisodeResult & { explorationCount: number } {
    let state = env.reset();
    let stateIndex = env.stateToIndex(state);
    let totalReward = 0;
    let totalRevenue = 0;
    let totalMargin = 0;
    let explorationCount = 0;

    // Synthetic exploration ratio: 30% of steps use synthetic data for states
    // not present in training data. This ensures all 108 states get coverage.
    const syntheticRatio = 0.3;

    for (let step = 0; step < stepsPerEpisode; step++) {
      if (Math.random() < syntheticRatio) {
        // Synthetic step: explore a random state using the demand model
        const synState = env.randomState();
        const synStateIndex = env.stateToIndex(synState);
        const { action, isExploration } = this.selectAction(synStateIndex);
        if (isExploration) explorationCount++;

        const synResult = env.syntheticStep(synState, action);
        const nextSynIndex = env.stateToIndex(synResult.nextState);
        this.update(synStateIndex, action, synResult.reward, nextSynIndex);

        totalReward += synResult.reward;
        totalRevenue += synResult.revenue;
        totalMargin += synResult.margin;
      } else {
        // Real data step
        const { action, isExploration } = this.selectAction(stateIndex);
        if (isExploration) explorationCount++;

        const result = env.step(action);
        const nextStateIndex = env.stateToIndex(result.nextState);
        this.update(stateIndex, action, result.reward, nextStateIndex);

        state = result.nextState;
        stateIndex = nextStateIndex;
        totalReward += result.reward;
        totalRevenue += result.revenue;
        totalMargin += result.margin;
      }
    }

    this.decayEpsilon();

    return {
      episode: 0, // caller sets this
      totalReward,
      avgReward: totalReward / stepsPerEpisode,
      avgRevenue: totalRevenue / stepsPerEpisode,
      avgMargin: totalMargin / stepsPerEpisode,
      epsilon: this.epsilon,
      steps: stepsPerEpisode,
      explorationCount,
    };
  }

  reset(): void {
    this.qTable.fill(0.0);
    this.epsilon = this.config.epsilonStart;
  }

  getConfig(): TrainingConfig {
    return { ...this.config };
  }
}
