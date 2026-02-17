import { createContext, useContext, useState, useCallback } from 'react';
import type { GBRTModel } from '../engine/gbrt';

export type DemandModelMode = 'simple' | 'advanced';

interface DemandModelState {
  mode: DemandModelMode;
  setMode: (m: DemandModelMode) => void;
  model: GBRTModel | null;
  setModel: (m: GBRTModel | null) => void;
  isReady: boolean; // simple always ready; advanced only after training
}

const defaultState: DemandModelState = {
  mode: 'simple',
  setMode: () => {},
  model: null,
  setModel: () => {},
  isReady: true,
};

export const DemandModelContext = createContext<DemandModelState>(defaultState);

export function useDemandModel() {
  return useContext(DemandModelContext);
}

export function useDemandModelProvider(): DemandModelState {
  const [mode, setModeRaw] = useState<DemandModelMode>('simple');
  const [model, setModelRaw] = useState<GBRTModel | null>(null);

  const setMode = useCallback((m: DemandModelMode) => {
    setModeRaw(m);
  }, []);

  const setModel = useCallback((m: GBRTModel | null) => {
    setModelRaw(m);
  }, []);

  const isReady = mode === 'simple' || model !== null;

  return { mode, setMode, model, setModel, isReady };
}
