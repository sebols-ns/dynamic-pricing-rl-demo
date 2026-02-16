import { useState, useRef, useCallback } from 'react';
import type { EpisodeResult, RewardWeights, TrainingConfig } from '../types/rl';
import type { RetailRow } from '../types/data';
import { DEFAULT_CONFIG } from '../types/rl';
import { PricingEnvironment } from '../engine/environment';
import { QLearningAgent } from '../engine/q-learning';

interface TrainingState {
  isRunning: boolean;
  episode: number;
  history: EpisodeResult[];
  agent: QLearningAgent | null;
  env: PricingEnvironment | null;
  explorationRate: number;
}

export function useRlTraining() {
  const [state, setState] = useState<TrainingState>({
    isRunning: false,
    episode: 0,
    history: [],
    agent: null,
    env: null,
    explorationRate: 1.0,
  });

  const rafRef = useRef<number>(0);
  const agentRef = useRef<QLearningAgent | null>(null);
  const envRef = useRef<PricingEnvironment | null>(null);
  const episodeRef = useRef(0);
  const historyRef = useRef<EpisodeResult[]>([]);
  const isRunningRef = useRef(false);
  const speedRef = useRef(1); // episodes per frame

  const initialize = useCallback((productRows: RetailRow[], weights: RewardWeights, config?: Partial<TrainingConfig>) => {
    const env = new PricingEnvironment({ productRows, weights });
    const agent = new QLearningAgent(config);
    envRef.current = env;
    agentRef.current = agent;
    episodeRef.current = 0;
    historyRef.current = [];
    setState({
      isRunning: false,
      episode: 0,
      history: [],
      agent,
      env,
      explorationRate: agent.epsilon,
    });
  }, []);

  const runFrame = useCallback(() => {
    if (!isRunningRef.current || !agentRef.current || !envRef.current) return;

    const batchSize = speedRef.current;
    for (let i = 0; i < batchSize; i++) {
      const result = agentRef.current.runEpisode(envRef.current);
      episodeRef.current++;
      result.episode = episodeRef.current;
      historyRef.current.push(result);
    }

    setState(prev => ({
      ...prev,
      episode: episodeRef.current,
      history: [...historyRef.current],
      explorationRate: agentRef.current?.epsilon ?? 0,
      agent: agentRef.current,
      env: envRef.current,
    }));

    if (episodeRef.current < (agentRef.current?.getConfig().episodes ?? DEFAULT_CONFIG.episodes)) {
      rafRef.current = requestAnimationFrame(runFrame);
    } else {
      isRunningRef.current = false;
      setState(prev => ({ ...prev, isRunning: false }));
    }
  }, []);

  const play = useCallback(() => {
    if (!agentRef.current || !envRef.current) return;
    isRunningRef.current = true;
    setState(prev => ({ ...prev, isRunning: true }));
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const stepOnce = useCallback(() => {
    if (!agentRef.current || !envRef.current) return;
    const result = agentRef.current.runEpisode(envRef.current);
    episodeRef.current++;
    result.episode = episodeRef.current;
    historyRef.current.push(result);
    setState(prev => ({
      ...prev,
      episode: episodeRef.current,
      history: [...historyRef.current],
      explorationRate: agentRef.current?.epsilon ?? 0,
      agent: agentRef.current,
      env: envRef.current,
    }));
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    isRunningRef.current = false;
    agentRef.current?.reset();
    episodeRef.current = 0;
    historyRef.current = [];
    setState(prev => ({
      ...prev,
      isRunning: false,
      episode: 0,
      history: [],
      explorationRate: agentRef.current?.epsilon ?? 1.0,
      agent: agentRef.current,
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
