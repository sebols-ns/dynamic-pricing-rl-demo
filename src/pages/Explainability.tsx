import { useState, useMemo } from 'react';
import {
  Typography, Badge,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { WaterfallChart } from '../components/WaterfallChart';
import { DataLineage } from '../components/DataLineage';
import { computeShapleyValues } from '../engine/explainer';
import type { State } from '../types/rl';

export function Explainability() {
  const { isLoaded } = useCsvData();
  const { agent, env, isTrained, productId, episode } = useTrainedAgent();
  const [demandBin, setDemandBin] = useState(1);
  const [compBin, setCompBin] = useState(1);
  const [seasonBin, setSeasonBin] = useState(2);
  const [lagBin, setLagBin] = useState(1);

  const state: State = useMemo(() => ({
    demandBin,
    competitorPriceBin: compBin,
    seasonBin,
    lagPriceBin: lagBin,
  }), [demandBin, compBin, seasonBin, lagBin]);

  const shapResult = useMemo(() => {
    if (!agent || !env || !isTrained) return null;
    return computeShapleyValues(state, agent, env);
  }, [agent, env, isTrained, state]);

  // Generate plain-English explanation
  const explanation = useMemo(() => {
    if (!shapResult) return '';
    const sorted = [...shapResult.shapValues].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const parts = sorted.map(sv => {
      const direction = sv.value >= 0 ? 'increases' : 'decreases';
      return `**${sv.label}** ${direction} the price by $${Math.abs(sv.value).toFixed(2)}`;
    });
    return `Starting from a baseline price of **$${shapResult.basePrice.toFixed(2)}**, ${parts.join(', ')}, resulting in a recommended price of **$${shapResult.finalPrice.toFixed(2)}**.`;
  }, [shapResult]);

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
          border: '1px solid var(--color-subtle)',
          borderRadius: '8px',
          padding: '48px 32px',
          backgroundColor: 'var(--color-base-white)',
          marginTop: '24px',
          textAlign: 'center',
        }}>
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>
            No Trained Model Available
          </Typography>
          <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Please train an RL agent in the RL Training tab first. Shapley values will be computed on the trained model.
          </Typography>
          <Badge variant="warning">Go to RL Training tab to train a model</Badge>
        </div>
      </div>
    );
  }

  const demandLabels = ['Low', 'Medium', 'High'];
  const compLabels = ['Lower', 'Similar', 'Higher'];
  const seasonLabels = ['Winter', 'Spring', 'Summer', 'Fall'];
  const lagLabels = ['Low', 'Medium', 'High'];

  return (
    <div style={{ padding: '32px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <Typography variant="heading-lg">Explainability</Typography>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <Badge variant="primary">Exact Shapley Values (2^4 = 16 coalitions)</Badge>
          <Badge variant="success">Trained on {productId} ({episode} ep)</Badge>
        </div>
      </div>

      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
        Understand why the agent recommends a specific price. Shapley values decompose the contribution
        of each market feature to the final pricing decision.
      </Typography>

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 160px)', gap: '16px', alignItems: 'end' }}>
        <div>
          <Typography variant="label-sm-bold" style={{ marginBottom: '6px', whiteSpace: 'nowrap' }}>
            Demand: {demandLabels[demandBin]}
          </Typography>
          <input type="range" min={0} max={2} step={1} value={demandBin}
            onChange={e => setDemandBin(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div>
          <Typography variant="label-sm-bold" style={{ marginBottom: '6px', whiteSpace: 'nowrap' }}>
            Competitor: {compLabels[compBin]}
          </Typography>
          <input type="range" min={0} max={2} step={1} value={compBin}
            onChange={e => setCompBin(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div>
          <Typography variant="label-sm-bold" style={{ marginBottom: '6px', whiteSpace: 'nowrap' }}>
            Season: {seasonLabels[seasonBin]}
          </Typography>
          <input type="range" min={0} max={3} step={1} value={seasonBin}
            onChange={e => setSeasonBin(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div>
          <Typography variant="label-sm-bold" style={{ marginBottom: '6px', whiteSpace: 'nowrap' }}>
            Hist. Price: {lagLabels[lagBin]}
          </Typography>
          <input type="range" min={0} max={2} step={1} value={lagBin}
            onChange={e => setLagBin(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
      </div>

      {/* SHAP Waterfall */}
      {shapResult && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginTop: '24px',
          marginBottom: '32px',
        }}>
          <div style={{
            border: '1px solid var(--color-subtle)',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: 'var(--color-base-white)',
          }}>
            <WaterfallChart
              shapValues={shapResult.shapValues}
              basePrice={shapResult.basePrice}
              finalPrice={shapResult.finalPrice}
            />
          </div>

          {/* Decision Breakdown */}
          <div style={{
            border: '1px solid var(--color-subtle)',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: 'var(--color-base-white)',
          }}>
            <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>Decision Breakdown</Typography>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
              {explanation.split('**').map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
              )}
            </Typography>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shapResult.shapValues
                .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                .map(sv => (
                  <div key={sv.feature} className="flex items-center justify-between">
                    <Typography variant="label-sm">{sv.label}</Typography>
                    <Badge variant={sv.value >= 0 ? 'success' : 'error'}>
                      {sv.value >= 0 ? '+' : ''}{sv.value.toFixed(2)}
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Data Lineage */}
      <div style={{
        border: '1px solid var(--color-subtle)',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: 'var(--color-base-white)',
      }}>
        <DataLineage />
      </div>
    </div>
  );
}
