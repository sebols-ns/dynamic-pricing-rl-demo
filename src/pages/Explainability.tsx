import { useState, useMemo } from 'react';
import {
  Typography, Badge,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { useDemandModel } from '../hooks/useDemandModel';
import { DataLineage } from '../components/DataLineage';
import { computeShapleyValues } from '../engine/explainer';
import type { State } from '../types/rl';
import {
  ResponsiveContainer, BarChart as RechartsBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';

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
  const { mode: demandMode, model: demandModel } = useDemandModel();
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
                  ? '#3b82f6'
                  : '#ef4444',
              }}
            >
              {shapResult.finalPrice >= shapResult.basePrice ? '+' : ''}
              ${(shapResult.finalPrice - shapResult.basePrice).toFixed(2)}
              {' '}({((shapResult.finalPrice - shapResult.basePrice) / shapResult.basePrice * 100).toFixed(1)}%)
            </Typography>
          </div>
        )}
      </div>

      {/* Waterfall Chart */}
      {shapResult && (() => {
        // Build waterfall steps: baseline → contributions → final
        const steps: { label: string; delta: number; runningTotal: number; type: 'anchor' | 'pos' | 'neg' }[] = [];
        let running = shapResult.basePrice;
        steps.push({ label: 'Baseline', delta: 0, runningTotal: running, type: 'anchor' });
        for (const sv of sorted) {
          running += sv.value;
          steps.push({ label: sv.label, delta: sv.value, runningTotal: running, type: sv.value >= 0 ? 'pos' : 'neg' });
        }
        steps.push({ label: 'Final Price', delta: 0, runningTotal: shapResult.finalPrice, type: 'anchor' });

        // Layout constants
        const labelWidth = 120;
        const valueWidth = 80;
        const chartLeftPad = 8;
        const barAreaWidth = 500;
        const totalWidth = labelWidth + chartLeftPad + barAreaWidth + valueWidth;
        const rowHeight = 44;
        const barHeight = 28;
        const svgHeight = steps.length * rowHeight + 12;

        // Scale: map price values to x positions in the bar area
        const allPrices = steps.map(s => s.runningTotal);
        const pMin = Math.min(...allPrices);
        const pMax = Math.max(...allPrices);
        const pPad = Math.max(1, (pMax - pMin) * 0.2);
        const scaleMin = pMin - pPad;
        const scaleMax = pMax + pPad;
        const xScale = (price: number) =>
          labelWidth + chartLeftPad + ((price - scaleMin) / (scaleMax - scaleMin)) * barAreaWidth;

        const BLUE = '#3b82f6';
        const RED = '#ef4444';
        const GREY = '#94a3b8';

        return (
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <Typography variant="label-md-bold" style={{ marginBottom: '16px' }}>
              Price Waterfall (Shapley Values)
            </Typography>

            <svg width="100%" viewBox={`0 0 ${totalWidth} ${svgHeight}`} style={{ overflow: 'visible', maxWidth: totalWidth }}>
              {steps.map((step, i) => {
                const y = i * rowHeight + 6;
                const barY = y + (rowHeight - barHeight) / 2;

                if (step.type === 'anchor') {
                  // Anchor block: grey outlined bar from 0-width marker at price
                  const x = xScale(step.runningTotal);
                  const anchorW = 6;
                  return (
                    <g key={i}>
                      {/* Connector from previous step */}
                      {i > 0 && (
                        <line
                          x1={xScale(steps[i - 1].runningTotal)}
                          y1={barY - 2}
                          x2={xScale(steps[i - 1].runningTotal)}
                          y2={barY + barHeight / 2}
                          stroke={GREY}
                          strokeWidth={1.5}
                          strokeDasharray="4,3"
                        />
                      )}
                      {/* Label */}
                      <text
                        x={labelWidth - 4}
                        y={barY + barHeight / 2}
                        textAnchor="end"
                        fontSize={12}
                        fontWeight={700}
                        fill="var(--color-dark)"
                        dominantBaseline="middle"
                      >
                        {step.label}
                      </text>
                      {/* Anchor bar */}
                      <rect
                        x={x - anchorW / 2}
                        y={barY}
                        width={anchorW}
                        height={barHeight}
                        rx={3}
                        fill={GREY}
                        opacity={0.5}
                      />
                      <rect
                        x={x - anchorW / 2}
                        y={barY}
                        width={anchorW}
                        height={barHeight}
                        rx={3}
                        fill="none"
                        stroke={GREY}
                        strokeWidth={1.5}
                      />
                      {/* Price label */}
                      <text
                        x={x + anchorW / 2 + 8}
                        y={barY + barHeight / 2}
                        fontSize={12}
                        fontWeight={700}
                        fill="var(--color-dark)"
                        dominantBaseline="middle"
                      >
                        ${step.runningTotal.toFixed(2)}
                      </text>
                    </g>
                  );
                }

                // Contribution block
                const prevTotal = steps[i - 1].runningTotal;
                const barLeft = xScale(Math.min(prevTotal, step.runningTotal));
                const barRight = xScale(Math.max(prevTotal, step.runningTotal));
                const barW = Math.max(3, barRight - barLeft);
                const color = step.type === 'pos' ? BLUE : RED;

                return (
                  <g key={i}>
                    {/* Connector line from previous step's end */}
                    <line
                      x1={xScale(prevTotal)}
                      y1={barY - 2}
                      x2={xScale(prevTotal)}
                      y2={barY + barHeight / 2}
                      stroke={GREY}
                      strokeWidth={1.5}
                      strokeDasharray="4,3"
                    />
                    {/* Label */}
                    <text
                      x={labelWidth - 4}
                      y={barY + barHeight / 2}
                      textAnchor="end"
                      fontSize={11}
                      fill="var(--color-dark)"
                      dominantBaseline="middle"
                    >
                      {step.label}
                    </text>
                    {/* Bar */}
                    <rect
                      x={barLeft}
                      y={barY}
                      width={barW}
                      height={barHeight}
                      rx={4}
                      fill={color}
                      opacity={0.75}
                    />
                    {/* Delta label inside or beside bar */}
                    <text
                      x={step.type === 'pos' ? barRight + 6 : barLeft - 6}
                      y={barY + barHeight / 2}
                      textAnchor={step.type === 'pos' ? 'start' : 'end'}
                      fontSize={11}
                      fontWeight={600}
                      fill={color}
                      dominantBaseline="middle"
                    >
                      {step.delta >= 0 ? '+' : ''}{step.delta.toFixed(2)}
                    </text>
                    {/* Running total - right side */}
                    <text
                      x={labelWidth + chartLeftPad + barAreaWidth + 8}
                      y={barY + barHeight / 2}
                      fontSize={10}
                      fill="var(--color-secondary)"
                      dominantBaseline="middle"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      ${step.runningTotal.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Summary breadcrumb */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '16px',
              padding: '12px 0',
              borderTop: '1px solid var(--color-subtle)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-dark)' }}>
                Base ${shapResult.basePrice.toFixed(2)}
              </span>
              {sorted.map(sv => (
                <span key={sv.feature} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--color-neutral-400)', fontSize: '12px' }}>{'\u2192'}</span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: sv.value >= 0 ? '#3b82f6' : '#ef4444',
                  }}>
                    {sv.value >= 0 ? '+' : ''}{sv.value.toFixed(2)}
                  </span>
                </span>
              ))}
              <span style={{ color: 'var(--color-neutral-400)', fontSize: '12px' }}>{'\u2192'}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-interactive)' }}>
                Final ${shapResult.finalPrice.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Demand Model Feature Importance (Advanced mode only) */}
      {demandMode === 'advanced' && demandModel && (() => {
        const importanceData = demandModel.featureNames
          .map((name, i) => ({
            name,
            importance: Math.round(demandModel.featureImportance[i] * 1000) / 10,
          }))
          .sort((a, b) => b.importance - a.importance);

        return (
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <Typography variant="label-md-bold" style={{ marginBottom: '4px' }}>
              Demand Model — What Drives Demand
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
              Feature importance from the GBT demand model, showing which features most influence predicted quantity.
            </Typography>
            <ResponsiveContainer width="100%" height={Math.max(200, importanceData.length * 32)}>
              <RechartsBarChart data={importanceData} layout="vertical" margin={{ top: 8, right: 16, left: 100, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Importance (%)', position: 'insideBottom', offset: -4, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <RechartsTooltip formatter={((v: number) => `${v.toFixed(1)}%`) as any} />
                <Bar dataKey="importance" fill="var(--color-interactive)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Data Lineage */}
      <div style={cardStyle}>
        <DataLineage />
      </div>
    </div>
  );
}
