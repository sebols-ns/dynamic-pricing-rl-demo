import { createContext, useContext } from 'react';
import type { QLearningAgent } from '../engine/q-learning';
import type { PricingEnvironment } from '../engine/environment';

interface TrainedAgentState {
  agent: QLearningAgent | null;
  env: PricingEnvironment | null;
  productId: string;
  isTrained: boolean;
  episode: number;
  setTrained: (agent: QLearningAgent, env: PricingEnvironment, productId: string, episode: number) => void;
}

const defaultState: TrainedAgentState = {
  agent: null,
  env: null,
  productId: '',
  isTrained: false,
  episode: 0,
  setTrained: () => {},
};

export const TrainedAgentContext = createContext<TrainedAgentState>(defaultState);

export function useTrainedAgent() {
  return useContext(TrainedAgentContext);
}
