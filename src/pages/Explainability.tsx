import { useState, useMemo } from 'react';
import {
  Typography, Badge,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { DataLineage } from '../components/DataLineage';
import { computeShapleyValues } from '../engine/explainer';
import type { State } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

const sliderTrackStyle: React.CSSProperties = {
  width: '100%',
  accentColor: 'var(--color-interactive)',
  cursor: 'pointer',
};

interface SliderControlProps {
  label: string;
  value: number;
  labels: string[];
  max: number;
  onChange: (v: number) => void;
}

function SliderControl({ label, value, labels, max, onChange }: SliderControlProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>{label}</Typography>
        <Typography variant="label-sm-bold">{labels[value]}</Typography>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={sliderTrackStyle}
      />
      <div className="flex justify-between" style={{ marginTop: '2px' }}>
        {labels.map((l, i) => (
          <Typography
            key={i}
            variant="label-sm"
            style={{
              fontSize: '9px',
              color: i === value ? 'var(--color-dark)' : 'var(--color-neutral-400)',
              fontWeight: i === value ? 600 : 400,
            }}
          >
            {l}
          </Typography>
        ))}
      </div>
    </div>
  );
}

export function Explainability() {
  const { isLoaded } = useCsvData();
  const { agent, env, isTrained, productId, episode } = useTrainedAgent();
  // Defaults differ from baseline (mid bins) so Shapley values are non-zero on load
  const [demandBin, setDemandBin] = useState(0);
  const [compBin, setCompBin] = useState(2);
  const [seasonBin, setSeasonBin] = useState(0);
  const [lagBin, setLagBin] = useState(2);
  const [inventoryBin, setInventoryBin] = useState(0);
  const [forecastBin, setForecastBin] = useState(2);

  const hasExtended = env?.hasExtendedState ?? false;

  const state: State = useMemo(() => ({
    demandBin,
    competitorPriceBin: compBin,
    seasonBin,
    lagPriceBin: lagBin,
    inventoryBin: hasExtended ? inventoryBin : 0,
    forecastBin: hasExtended ? forecastBin : 0,
  }), [demandBin, compBin, seasonBin, lagBin, hasExtended, inventoryBin, forecastBin]);

  const shapResult = useMemo(() => {
    if (!agent || !env || !isTrained) return null;
    return computeShapleyValues(state, agent, env);
  }, [agent, env, isTrained, state]);

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Explainability</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '16px' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  if (!isTrained) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Explainability</Typography>
        <div style={{
          ...cardStyle,
          padding: '48px 32px',
          marginTop: '24px',
          textAlign: 'center',
        }}>
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>
            No Trained Model Available
          </Typography>
          <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Train an RL agent in the Training tab first. Shapley values will be computed on the trained model.
          </Typography>
          <Badge variant="warning">Go to RL Training tab</Badge>
        </div>
      </div>
    );
  }

  const numCoalitions = hasExtended ? 64 : 16;
  const sorted = shapResult
    ? [...shapResult.shapValues].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];
  const maxAbsShap = sorted.length > 0 ? Math.abs(sorted[0].value) : 1;

  return (
    <div style={{ padding: '32px 0' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <Typography variant="heading-lg">Explainability</Typography>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <Badge variant="primary">Exact Shapley ({numCoalitions} coalitions)</Badge>
          <Badge variant="success">{productId} ({episode} ep)</Badge>
        </div>
      </div>

      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
        Adjust market conditions to see how each feature drives the agent's pricing decision.
      </Typography>

      {/* Top section: Controls + Price Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: '24px',
        marginBottom: '24px',
      }}>
        {/* Controls card */}
        <div style={cardStyle}>
          <Typography variant="label-md-bold" style={{ marginBottom: '16px' }}>Market Conditions</Typography>
          <div style={{
            display: 'grid',
            gridTemplateColumns: hasExtended ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
            gap: '20px 32px',
          }}>
            <SliderControl label="Demand" value={demandBin} labels={['Low', 'Medium', 'High']} max={2} onChange={setDemandBin} />
            <SliderControl label="Competitor" value={compBin} labels={['Lower', 'Similar', 'Higher']} max={2} onChange={setCompBin} />
            <SliderControl label="Season" value={seasonBin} labels={['Winter', 'Spring', 'Summer', 'Fall']} max={3} onChange={setSeasonBin} />
            <SliderControl label="Hist. Price" value={lagBin} labels={['Low', 'Medium', 'High']} max={2} onChange={setLagBin} />
            {hasExtended && (
              <>
                <SliderControl label="Inventory" value={inventoryBin} labels={['Low', 'Medium', 'High']} max={2} onChange={setInventoryBin} />
                <SliderControl label="Forecast" value={forecastBin} labels={['Low', 'Medium', 'High']} max={2} onChange={setForecastBin} />
              </>
            )}
          </div>
        </div>

        {/* Price summary card */}
        {shapResult && (
          <div style={{
            ...cardStyle,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}>
            <Typography variant="label-sm" style={{ color: 'var(--color-secondary)', marginBottom: '4px' }}>
              Baseline
            </Typography>
            <Typography variant="heading-sm" style={{ marginBottom: '16px' }}>
              ${shapResult.basePrice.toFixed(2)}
            </Typography>

            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-interactive)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 700,
            }}>
              {shapResult.finalPrice >= shapResult.basePrice ? '\u2191' : '\u2193'}
            </div>

            <Typography variant="label-sm" style={{ color: 'var(--color-secondary)', marginBottom: '4px' }}>
              Recommended
            </Typography>
            <Typography variant="heading-lg" style={{ color: 'var(--color-interactive)' }}>
              ${shapResult.finalPrice.toFixed(2)}
            </Typography>

            <Typography
              variant="label-sm-bold"
              style={{
                marginTop: '8px',
                color: shapResult.finalPrice >= shapResult.basePrice
                  ? 'var(--color-success)'
                  : 'var(--color-error)',
              }}
            >
              {shapResult.finalPrice >= shapResult.basePrice ? '+' : ''}
              ${(shapResult.finalPrice - shapResult.basePrice).toFixed(2)}
              {' '}({((shapResult.finalPrice - shapResult.basePrice) / shapResult.basePrice * 100).toFixed(1)}%)
            </Typography>
          </div>
        )}
      </div>

      {/* Feature Contributions — horizontal bar chart */}
      {shapResult && (
        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <Typography variant="label-md-bold" style={{ marginBottom: '20px' }}>
            Feature Contributions (Shapley Values)
          </Typography>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sorted.map(sv => {
              const pct = maxAbsShap > 0 ? (Math.abs(sv.value) / maxAbsShap) * 100 : 0;
              const isPositive = sv.value >= 0;
              return (
                <div key={sv.feature} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 70px', alignItems: 'center', gap: '12px' }}>
                  <Typography variant="label-sm" style={{ textAlign: 'right', color: 'var(--color-dark)' }}>
                    {sv.label}
                  </Typography>

                  <div style={{ position: 'relative', height: '24px' }}>
                    {/* Center line */}
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: 'var(--color-neutral-300)',
                    }} />
                    {/* Bar */}
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      height: '20px',
                      borderRadius: '4px',
                      backgroundColor: isPositive ? 'var(--color-success)' : 'var(--color-error)',
                      opacity: 0.8,
                      ...(isPositive
                        ? { left: '50%', width: `${pct / 2}%` }
                        : { right: '50%', width: `${pct / 2}%` }
                      ),
                      transition: 'width 0.2s ease, left 0.2s ease, right 0.2s ease',
                    }} />
                  </div>

                  <Typography
                    variant="label-sm-bold"
                    style={{
                      color: isPositive ? 'var(--color-success)' : 'var(--color-error)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isPositive ? '+' : ''}{sv.value.toFixed(2)}
                  </Typography>
                </div>
              );
            })}
          </div>

          {/* Price flow summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '20px',
            padding: '12px 0',
            borderTop: '1px solid var(--color-subtle)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>Base</Typography>
              <Typography variant="label-md-bold">${shapResult.basePrice.toFixed(2)}</Typography>
            </div>
            {sorted.map(sv => (
              <div key={sv.feature} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--color-neutral-400)' }}>{'\u2192'}</span>
                <Typography
                  variant="label-sm"
                  style={{
                    color: sv.value >= 0 ? 'var(--color-success)' : 'var(--color-error)',
                    fontWeight: 600,
                  }}
                >
                  {sv.value >= 0 ? '+' : ''}{sv.value.toFixed(2)}
                </Typography>
              </div>
            ))}
            <span style={{ color: 'var(--color-neutral-400)' }}>{'\u2192'}</span>
            <div style={{ textAlign: 'center' }}>
              <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>Final</Typography>
              <Typography variant="label-md-bold" style={{ color: 'var(--color-interactive)' }}>
                ${shapResult.finalPrice.toFixed(2)}
              </Typography>
            </div>
          </div>
        </div>
      )}

      {/* Data Lineage */}
      <div style={cardStyle}>
        <DataLineage />
      </div>
    </div>
  );
}
