import { useState, useRef, useCallback } from 'react';
import type { RetailRow } from '../types/data';
import {
  type GBRTModel, type GBRTConfig, type GBRTSnapshot, type PreparedData,
  type DemandCurvePoint, type TrainingContext,
  DEFAULT_GBRT_CONFIG, prepareFeatures, initTraining, trainOneTree, generateDemandCurve,
} from '../engine/gbrt';

export interface R2HistoryPoint {
  tree: number;
  train: number;
  test: number;
}

interface GbrtTrainingState {
  isRunning: boolean;
  isComplete: boolean;
  earlyStopped: boolean;
  currentTree: number;
  totalTrees: number;
  trainR2: number;
  testR2: number;
  bestTestR2: number;
  bestTestTree: number;
  trainSize: number;
  testSize: number;
  featureImportance: number[];
  featureNames: string[];
  predictions: Float64Array | null;
  actuals: Float64Array | null;
  model: GBRTModel | null;
  demandCurveData: DemandCurvePoint[];
  r2History: R2HistoryPoint[];
}

const UI_UPDATE_INTERVAL_MS = 80;
const EARLY_STOP_PATIENCE = 200; // stop if test R² hasn't improved for this many trees

export function useGbrtTraining() {
  const [state, setState] = useState<GbrtTrainingState>({
    isRunning: false,
    isComplete: false,
    earlyStopped: false,
    currentTree: 0,
    totalTrees: DEFAULT_GBRT_CONFIG.nTrees,
    trainR2: 0,
    testR2: 0,
    bestTestR2: -Infinity,
    bestTestTree: 0,
    trainSize: 0,
    testSize: 0,
    featureImportance: [],
    featureNames: [],
    predictions: null,
    actuals: null,
    model: null,
    demandCurveData: [],
    r2History: [],
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxRef = useRef<TrainingContext | null>(null);
  const dataRef = useRef<PreparedData | null>(null);
  const rowsRef = useRef<RetailRow[]>([]);
  const isRunningRef = useRef(false);
  const treeIndexRef = useRef(0);
  const speedRef = useRef(1);
  const r2HistoryRef = useRef<R2HistoryPoint[]>([]);
  const bestTestR2Ref = useRef(-Infinity);
  const bestTestTreeRef = useRef(0);

  const flushSnapshot = useCallback((snapshot: GBRTSnapshot, ctx: TrainingContext) => {
    const curve = generateDemandCurve(ctx.model, rowsRef.current);
    r2HistoryRef.current.push({
      tree: snapshot.treeIndex + 1,
      train: snapshot.trainR2,
      test: snapshot.testR2,
    });

    // Track best test R²
    if (snapshot.testR2 > bestTestR2Ref.current) {
      bestTestR2Ref.current = snapshot.testR2;
      bestTestTreeRef.current = snapshot.treeIndex + 1;
    }

    setState(prev => ({
      ...prev,
      currentTree: snapshot.treeIndex + 1,
      trainR2: snapshot.trainR2,
      testR2: snapshot.testR2,
      bestTestR2: bestTestR2Ref.current,
      bestTestTree: bestTestTreeRef.current,
      featureImportance: snapshot.featureImportance,
      featureNames: ctx.model.featureNames,
      predictions: snapshot.predictions,
      actuals: ctx.y,
      model: ctx.model,
      demandCurveData: curve,
      r2History: r2HistoryRef.current.slice(),
    }));
  }, []);

  const initialize = useCallback((rows: RetailRow[], config?: Partial<GBRTConfig>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    isRunningRef.current = false;

    const fullConfig = { ...DEFAULT_GBRT_CONFIG, ...config };
    const data = prepareFeatures(rows);
    const ctx = initTraining(data, fullConfig);
    dataRef.current = data;
    ctxRef.current = ctx;
    rowsRef.current = rows;
    treeIndexRef.current = 0;
    r2HistoryRef.current = [];
    bestTestR2Ref.current = -Infinity;
    bestTestTreeRef.current = 0;

    setState({
      isRunning: false,
      isComplete: false,
      earlyStopped: false,
      currentTree: 0,
      totalTrees: fullConfig.nTrees,
      trainR2: 0,
      testR2: 0,
      bestTestR2: -Infinity,
      bestTestTree: 0,
      trainSize: ctx.nRows,
      testSize: ctx.testIndices.length,
      featureImportance: [],
      featureNames: data.featureNames,
      predictions: null,
      actuals: ctx.y,
      model: null,
      demandCurveData: [],
      r2History: [],
    });
  }, []);

  const runBatch = useCallback(() => {
    if (!isRunningRef.current || !ctxRef.current) return;

    const ctx = ctxRef.current;
    const totalTrees = ctx.config.nTrees;
    const treesPerTick = Math.max(1, speedRef.current);
    let lastSnapshot: GBRTSnapshot | null = null;
    let shouldEarlyStop = false;

    for (let i = 0; i < treesPerTick && treeIndexRef.current < totalTrees; i++) {
      lastSnapshot = trainOneTree(ctx, treeIndexRef.current);
      treeIndexRef.current++;

      // Track best test R²
      if (lastSnapshot.testR2 > bestTestR2Ref.current) {
        bestTestR2Ref.current = lastSnapshot.testR2;
        bestTestTreeRef.current = treeIndexRef.current;
      }

      // Check early stopping: test R² hasn't improved for PATIENCE trees
      if (treeIndexRef.current - bestTestTreeRef.current >= EARLY_STOP_PATIENCE
          && treeIndexRef.current >= 50) { // don't stop before 50 trees
        shouldEarlyStop = true;
        break;
      }
    }

    if (lastSnapshot) {
      flushSnapshot(lastSnapshot, ctx);
    }

    if (shouldEarlyStop || treeIndexRef.current >= totalTrees) {
      isRunningRef.current = false;
      setState(prev => ({
        ...prev,
        isRunning: false,
        isComplete: true,
        earlyStopped: shouldEarlyStop,
      }));
    } else {
      timerRef.current = setTimeout(runBatch, UI_UPDATE_INTERVAL_MS);
    }
  }, [flushSnapshot]);

  const play = useCallback(() => {
    if (!ctxRef.current) return;
    isRunningRef.current = true;
    setState(prev => ({ ...prev, isRunning: true, isComplete: false, earlyStopped: false }));
    timerRef.current = setTimeout(runBatch, 0);
  }, [runBatch]);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const stepOnce = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    if (treeIndexRef.current >= ctx.config.nTrees) return;
    const snapshot = trainOneTree(ctx, treeIndexRef.current);
    treeIndexRef.current++;
    flushSnapshot(snapshot, ctx);
    if (treeIndexRef.current >= ctx.config.nTrees) {
      setState(prev => ({ ...prev, isComplete: true }));
    }
  }, [flushSnapshot]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    isRunningRef.current = false;
    r2HistoryRef.current = [];
    bestTestR2Ref.current = -Infinity;
    bestTestTreeRef.current = 0;
    if (dataRef.current && rowsRef.current.length > 0) {
      const ctx = initTraining(dataRef.current, ctxRef.current?.config ?? DEFAULT_GBRT_CONFIG);
      ctxRef.current = ctx;
      treeIndexRef.current = 0;
    }
    setState(prev => ({
      ...prev,
      isRunning: false,
      isComplete: false,
      earlyStopped: false,
      currentTree: 0,
      trainR2: 0,
      testR2: 0,
      bestTestR2: -Infinity,
      bestTestTree: 0,
      featureImportance: [],
      predictions: null,
      model: null,
      demandCurveData: [],
      r2History: [],
    }));
  }, []);

  const trainMore = useCallback((additionalTrees: number) => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    ctx.config.nTrees += additionalTrees;
    setState(prev => ({
      ...prev,
      totalTrees: ctx.config.nTrees,
      isComplete: false,
      earlyStopped: false,
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
    trainMore,
    setSpeed,
  };
}
