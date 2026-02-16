import { useState, useMemo } from 'react';
import {
  Typography, Badge, BarChart,
  CHART_COLORS,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { MetricCard } from '../components/MetricCard';
import type { RewardWeights, State } from '../types/rl';
import { ACTION_MULTIPLIERS, NUM_ACTIONS } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

export function PricingLab() {
  const { isLoaded } = useCsvData();
  const { agent, env, isTrained, productId, episode } = useTrainedAgent();
  const [demand, setDemand] = useState(1.0);
  const [competitorPrice, setCompetitorPrice] = useState(1);
  const [season, setSeason] = useState(2);
  const [weights, setWeights] = useState<RewardWeights>({ revenue: 0.4, margin: 0.4, volume: 0.2 });

  const results = useMemo(() => {
    if (!agent || !env || !isTrained) return null;

    const state: State = {
      demandBin: Math.min(2, Math.max(0, Math.round(demand))),
      competitorPriceBin: competitorPrice,
      seasonBin: season,
      lagPriceBin: 1,
    };

    const stateIndex = env.stateToIndex(state);
    const bestAction = agent.getBestAction(stateIndex);
    const rlResult = env.simulateAction(state, bestAction, { demandMultiplier: demand });
    const staticActionIdx = ACTION_MULTIPLIERS.indexOf(1.00);
    const staticResult = env.simulateAction(state, staticActionIdx >= 0 ? staticActionIdx : 3, { demandMultiplier: demand });

    let randomRevenue = 0, randomMargin = 0, randomVolume = 0;
    for (let a = 0; a < NUM_ACTIONS; a++) {
      const r = env.simulateAction(state, a, { demandMultiplier: demand });
      randomRevenue += r.revenue;
      randomMargin += r.margin;
      randomVolume += r.volumeSold;
    }
    randomRevenue /= NUM_ACTIONS;
    randomMargin /= NUM_ACTIONS;
    randomVolume /= NUM_ACTIONS;

    return {
      rl: rlResult,
      static: staticResult,
      random: { revenue: randomRevenue, margin: randomMargin, volume: randomVolume },
      bestAction,
      basePrice: env.getBasePrice(),
    };
  }, [agent, env, isTrained, demand, competitorPrice, season]);

  const comparisonData = useMemo(() => {
    if (!results) return [];
    return [
      { strategy: 'RL Agent', revenue: Math.round(results.rl.revenue), margin: Math.round(results.rl.margin) },
      { strategy: 'Static', revenue: Math.round(results.static.revenue), margin: Math.round(results.static.margin) },
      { strategy: 'Random', revenue: Math.round(results.random.revenue), margin: Math.round(results.random.margin) },
    ];
  }, [results]);

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Pricing Lab</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '16px' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  if (!isTrained) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Pricing Lab</Typography>
        <div style={{
          ...cardStyle,
          marginTop: '24px',
          textAlign: 'center',
          padding: '48px 32px',
        }}>
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>
            No Trained Model Available
          </Typography>
          <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Please train an RL agent in the RL Training tab first. The trained model will automatically be available here for what-if analysis.
          </Typography>
          <Badge variant="warning">Go to RL Training tab to train a model</Badge>
        </div>
      </div>
    );
  }

  const seasonLabels = ['Winter', 'Spring', 'Summer', 'Fall'];
  const compLabels = ['Lower', 'Similar', 'Higher'];

  return (
    <div style={{ padding: '32px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <Typography variant="heading-lg">Pricing Lab</Typography>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <Badge variant="success">Trained on {productId} ({episode} episodes)</Badge>
        </div>
      </div>
      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
        Adjust market conditions and objective weights to see how the RL agent adapts its pricing recommendation.
      </Typography>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {/* What-if Sliders */}
        <div style={cardStyle}>
          <Typography variant="heading-sm" style={{ marginBottom: '20px' }}>Market Conditions</Typography>

          <div style={{ marginBottom: '16px' }}>
            <div className="flex justify-between" style={{ marginBottom: '6px' }}>
              <Typography variant="label-sm-bold">Demand Level</Typography>
              <Typography variant="label-sm" style={{ color: 'var(--color-interactive)' }}>{demand.toFixed(1)}x</Typography>
            </div>
            <input type="range" min={0.2} max={2.0} step={0.1} value={demand}
              onChange={e => setDemand(Number(e.target.value))} style={{ width: '100%' }} />
            <div className="flex justify-between">
              <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>Low</Typography>
              <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>High</Typography>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div className="flex justify-between" style={{ marginBottom: '6px' }}>
              <Typography variant="label-sm-bold">Competitor Price</Typography>
              <Typography variant="label-sm" style={{ color: 'var(--color-interactive)' }}>{compLabels[competitorPrice]}</Typography>
            </div>
            <input type="range" min={0} max={2} step={1} value={competitorPrice}
              onChange={e => setCompetitorPrice(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div>
            <div className="flex justify-between" style={{ marginBottom: '6px' }}>
              <Typography variant="label-sm-bold">Season</Typography>
              <Typography variant="label-sm" style={{ color: 'var(--color-interactive)' }}>{seasonLabels[season]}</Typography>
            </div>
            <input type="range" min={0} max={3} step={1} value={season}
              onChange={e => setSeason(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Objective Weights */}
        <div style={cardStyle}>
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>Objective Weights</Typography>
          <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '20px' }}>
            Adjust how the agent balances competing objectives. Weights are normalized.
          </Typography>

          {[
            { key: 'revenue' as const, label: 'Revenue', color: 'var(--color-blue-500)' },
            { key: 'margin' as const, label: 'Margin', color: 'var(--color-green-500)' },
            { key: 'volume' as const, label: 'Volume', color: 'var(--color-yellow-500)' },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ marginBottom: '16px' }}>
              <div className="flex justify-between" style={{ marginBottom: '6px' }}>
                <Typography variant="label-sm-bold">{label}</Typography>
                <Typography variant="label-sm" style={{ color }}>{(weights[key] * 100).toFixed(0)}%</Typography>
              </div>
              <input
                type="range" min={0} max={1} step={0.05} value={weights[key]}
                onChange={e => {
                  const v = Number(e.target.value);
                  const others = Object.entries(weights).filter(([k]) => k !== key);
                  const otherTotal = others.reduce((s, [, val]) => s + val, 0);
                  const total = v + otherTotal;
                  if (total > 0) {
                    setWeights(prev => {
                      const next = { ...prev };
                      next[key] = v / total;
                      for (const [k, val] of others) {
                        next[k as keyof RewardWeights] = val / total;
                      }
                      return next;
                    });
                  }
                }}
                style={{ width: '100%' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <MetricCard
              label="Recommended Price"
              value={`$${results.rl.price.toFixed(2)}`}
              subtitle={`${ACTION_MULTIPLIERS[results.bestAction].toFixed(2)}x base`}
            />
            <MetricCard label="Expected Revenue" value={`$${results.rl.revenue.toFixed(0)}`} />
            <MetricCard label="Expected Margin" value={`$${results.rl.margin.toFixed(0)}`} />
            <MetricCard label="Base Price" value={`$${results.basePrice.toFixed(2)}`} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '24px',
            }}
          >
            {comparisonData.length > 0 && (
              <BarChart
                data={comparisonData}
                xAxisKey="strategy"
                yAxisKey="revenue"
                title="Revenue Comparison"
                xAxisLabel="Strategy"
                yAxisLabel="Revenue ($)"
                barColor={CHART_COLORS.PRIMARY}
              />
            )}
            {comparisonData.length > 0 && (
              <BarChart
                data={comparisonData}
                xAxisKey="strategy"
                yAxisKey="margin"
                title="Margin Comparison"
                xAxisLabel="Strategy"
                yAxisLabel="Margin ($)"
                barColor={CHART_COLORS.SUCCESS}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
