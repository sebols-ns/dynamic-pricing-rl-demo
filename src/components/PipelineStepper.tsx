import { Typography } from '@northslopetech/altitude-ui';
import { PIPELINE_STEPS, STEP_LABELS, type PipelineStep } from '../hooks/usePipelineState';

interface PipelineStepperProps {
  activeStep: PipelineStep;
  completedSteps: Set<PipelineStep>;
  canNavigateTo: (step: PipelineStep) => boolean;
  onStepClick: (step: PipelineStep) => void;
}

export function PipelineStepper({ activeStep, completedSteps, canNavigateTo, onStepClick }: PipelineStepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', padding: '16px 0' }}>
      {PIPELINE_STEPS.map((step, i) => {
        const isActive = step === activeStep;
        const isComplete = completedSteps.has(step);
        const canNav = canNavigateTo(step);
        const isLocked = !isActive && !isComplete && !canNav;

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div
                style={{
                  width: '40px',
                  height: '2px',
                  backgroundColor: completedSteps.has(PIPELINE_STEPS[i - 1])
                    ? 'var(--color-success)'
                    : 'var(--color-neutral-300)',
                  margin: '0 4px',
                }}
              />
            )}
            <button
              onClick={() => {
                if (canNav || isActive) onStepClick(step);
              }}
              disabled={isLocked}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '20px',
                border: isActive
                  ? '2px solid var(--color-interactive)'
                  : '1px solid transparent',
                backgroundColor: isActive
                  ? 'var(--color-info-subtle)'
                  : 'transparent',
                cursor: isLocked ? 'default' : 'pointer',
                opacity: isLocked ? 0.4 : 1,
                transition: 'all 0.2s',
              }}
            >
              {/* Circle indicator */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                  backgroundColor: isComplete
                    ? 'var(--color-success)'
                    : isActive
                      ? 'var(--color-interactive)'
                      : 'var(--color-neutral-300)',
                  color: (isComplete || isActive) ? 'white' : 'var(--color-secondary)',
                  animation: isActive && !isComplete ? 'pulse-ring 2s ease-in-out infinite' : 'none',
                }}
              >
                {isComplete ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <Typography
                variant="label-sm"
                style={{
                  fontWeight: isActive ? 700 : 500,
                  color: isLocked ? 'var(--color-neutral-400)' : 'var(--color-dark)',
                  whiteSpace: 'nowrap',
                }}
              >
                {STEP_LABELS[step]}
              </Typography>
            </button>
          </div>
        );
      })}

      {/* CSS animation for active pulse */}
      <style>{`
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
        }
      `}</style>
    </div>
  );
}
