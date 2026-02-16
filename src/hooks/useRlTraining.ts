import { useState, useRef, useCallback } from 'react';
import type { EpisodeResult, RewardWeights, TrainingConfig } from '../types/rl';
import type { RetailRow } from '../types/data';
import { PricingEnvironment } from '../engine/environment';
import { QLearningAgent } from '../engine/q-learning';

interface TrainingState {
  isRunning: boolean;
  episode: number;
  history: EpisodeResult[];
  agent: QLearningAgent | null;
  env: PricingEnvironment | null;
  explorationRate: number;
  earlyStopped: boolean;
  earlyStoppedAt: number | null;
}

// How many episodes to run before pushing a UI update
const EPISODES_PER_UI_UPDATE = 5;
// Minimum ms between UI updates to avoid overwhelming React
const UI_UPDATE_INTERVAL_MS = 80;

export function useRlTraining() {
  const [state, setState] = useState<TrainingState>({
    isRunning: false,
    episode: 0,
    history: [],
    agent: null,
    env: null,
    explorationRate: 1.0,
    earlyStopped: false,
    earlyStoppedAt: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentRef = useRef<QLearningAgent | null>(null);
  const envRef = useRef<PricingEnvironment | null>(null);
  const episodeRef = useRef(0);
  const historyRef = useRef<EpisodeResult[]>([]);
  const isRunningRef = useRef(false);
  const speedRef = useRef(1);
  const bestRollingAvgRef = useRef(-Infinity);
  const noImprovementCountRef = useRef(0);
  const earlyStoppedRef = useRef(false);

  const initialize = useCallback((productRows: RetailRow[], weights: RewardWeights, config?: Partial<TrainingConfig>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    isRunningRef.current = false;

    const env = new PricingEnvironment({ productRows, weights });
    const agent = new QLearningAgent(config);
    envRef.current = env;
    agentRef.current = agent;
    episodeRef.current = 0;
    historyRef.current = [];
    bestRollingAvgRef.current = -Infinity;
    noImprovementCountRef.current = 0;
    earlyStoppedRef.current = false;
    setState({
      isRunning: false,
      episode: 0,
      history: [],
      agent,
      env,
      explorationRate: agent.epsilon,
      earlyStopped: false,
      earlyStoppedAt: null,
    });
  }, []);

  const flushState = useCallback(() => {
    // Snapshot current refs into React state (single setState call)
    const history = historyRef.current;
    const episode = episodeRef.current;
    const epsilon = agentRef.current?.epsilon ?? 0;
    const agent = agentRef.current;
    const env = envRef.current;
    setState(prev => ({
      ...prev,
      episode,
      history: history.slice(), // shallow copy for React diffing
      explorationRate: epsilon,
      agent,
      env,
      earlyStopped: earlyStoppedRef.current,
      earlyStoppedAt: earlyStoppedRef.current ? episode : prev.earlyStoppedAt,
    }));
  }, []);

  const runBatch = useCallback(() => {
    if (!isRunningRef.current || !agentRef.current || !envRef.current) return;

    const maxEpisodes = agentRef.current.getConfig().episodes;
    const batchSize = EPISODES_PER_UI_UPDATE * speedRef.current;

    const config = agentRef.current.getConfig();
    let converged = false;

    for (let i = 0; i < batchSize && episodeRef.current < maxEpisodes; i++) {
      const result = agentRef.current.runEpisode(envRef.current);
      episodeRef.current++;
      result.episode = episodeRef.current;
      historyRef.current.push(result);

      // Convergence check: only after agent is deep in exploitation (epsilon < 0.05)
      const hist = historyRef.current;
      const currentEpsilon = agentRef.current!.epsilon;
      if (hist.length >= 50 && currentEpsilon < 0.05) {
        const recent = hist.slice(-50);
        const rollingAvg = recent.reduce((s, r) => s + r.avgReward, 0) / recent.length;
        if (rollingAvg > bestRollingAvgRef.current + config.earlyStopThreshold) {
          bestRollingAvgRef.current = rollingAvg;
          noImprovementCountRef.current = 0;
        } else {
          noImprovementCountRef.current++;
        }
        if (noImprovementCountRef.current >= config.earlyStopPatience) {
          converged = true;
          break;
        }
      }
    }

    if (converged) {
      earlyStoppedRef.current = true;
    }

    flushState();

    if (converged || episodeRef.current >= maxEpisodes) {
      isRunningRef.current = false;
      setState(prev => ({ ...prev, isRunning: false }));
    } else {
      timerRef.current = setTimeout(runBatch, UI_UPDATE_INTERVAL_MS);
    }
  }, [flushState]);

  const play = useCallback(() => {
    if (!agentRef.current || !envRef.current) return;
    isRunningRef.current = true;
    setState(prev => ({ ...prev, isRunning: true }));
    timerRef.current = setTimeout(runBatch, 0);
  }, [runBatch]);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const stepOnce = useCallback(() => {
    if (!agentRef.current || !envRef.current) return;
    const result = agentRef.current.runEpisode(envRef.current);
    episodeRef.current++;
    result.episode = episodeRef.current;
    historyRef.current.push(result);
    flushState();
  }, [flushState]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    isRunningRef.current = false;
    agentRef.current?.reset();
    episodeRef.current = 0;
    historyRef.current = [];
    bestRollingAvgRef.current = -Infinity;
    noImprovementCountRef.current = 0;
    earlyStoppedRef.current = false;
    setState(prev => ({
      ...prev,
      isRunning: false,
      episode: 0,
      history: [],
      explorationRate: agentRef.current?.epsilon ?? 1.0,
      agent: agentRef.current,
      earlyStopped: false,
      earlyStoppedAt: null,
    }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    speedRef.current = speed;
  }, []);

  return {
    ...state,
    initialize,
    play,
    pause,
    stepOnce,
    reset,
    setSpeed,
  };
}
