import { useState, useCallback, useMemo } from 'react';

export const PIPELINE_STEPS = ['data', 'demand-model', 'training', 'results', 'explainability'] as const;
export type PipelineStep = typeof PIPELINE_STEPS[number];

export const STEP_LABELS: Record<PipelineStep, string> = {
  'data': 'Data',
  'demand-model': 'Demand Model',
  'training': 'RL Training',
  'results': 'Results',
  'explainability': 'Explainability',
};

export interface PipelineState {
  activeStep: PipelineStep;
  completedSteps: Set<PipelineStep>;
  setActiveStep: (step: PipelineStep) => void;
  markComplete: (step: PipelineStep) => void;
  resetFrom: (step: PipelineStep) => void;
  canNavigateTo: (step: PipelineStep) => boolean;
}

export function usePipelineState(): PipelineState {
  const [activeStep, setActiveStepRaw] = useState<PipelineStep>('data');
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStep>>(new Set());

  const canNavigateTo = useCallback((step: PipelineStep): boolean => {
    if (completedSteps.has(step)) return true;
    // Can navigate to a step if all prior steps are complete
    const idx = PIPELINE_STEPS.indexOf(step);
    for (let i = 0; i < idx; i++) {
      if (!completedSteps.has(PIPELINE_STEPS[i])) return false;
    }
    return true;
  }, [completedSteps]);

  const setActiveStep = useCallback((step: PipelineStep) => {
    setActiveStepRaw(step);
  }, []);

  const markComplete = useCallback((step: PipelineStep) => {
    setCompletedSteps(prev => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, []);

  const resetFrom = useCallback((step: PipelineStep) => {
    const idx = PIPELINE_STEPS.indexOf(step);
    setCompletedSteps(prev => {
      const next = new Set<PipelineStep>();
      for (const s of prev) {
        if (PIPELINE_STEPS.indexOf(s) < idx) next.add(s);
      }
      return next;
    });
  }, []);

  return { activeStep, completedSteps, setActiveStep, markComplete, resetFrom, canNavigateTo };
}
