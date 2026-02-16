import { useState, useMemo, useEffect } from 'react';
import {
  Typography, Badge, BarChart,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  CHART_COLORS,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { MetricCard } from '../components/MetricCard';
import { PricingEnvironment } from '../engine/environment';
import { QLearningAgent } from '../engine/q-learning';
import type { RewardWeights, State } from '../types/rl';
import { ACTION_MULTIPLIERS, NUM_ACTIONS } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

export function PricingLab() {
  const { rows, products, isLoaded } = useCsvData();
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [demand, setDemand] = useState(1.0);
  const [competitorPrice, setCompetitorPrice] = useState(2);
  const [season, setSeason] = useState(2);
  const [weights, setWeights] = useState<RewardWeights>({ revenue: 0.4, margin: 0.4, volume: 0.2 });
  const [agent, setAgent] = useState<QLearningAgent | null>(null);
  const [env, setEnv] = useState<PricingEnvironment | null>(null);
  const [isTrained, setIsTrained] = useState(false);

  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct || !isLoaded) return;
    const productRows = rows.filter(r => r.product_id === selectedProduct);
    if (productRows.length === 0) return;

    const newEnv = new PricingEnvironment({ productRows, weights });
    const newAgent = new QLearningAgent({ episodes: 300 });
    for (let ep = 0; ep < 300; ep++) {
      newAgent.runEpisode(newEnv);
    }
    setEnv(newEnv);
    setAgent(newAgent);
    setIsTrained(true);
  }, [selectedProduct, isLoaded, rows, weights]);

  const results = useMemo(() => {
    if (!agent || !env || !isTrained) return null;

    const state: State = {
      demandBin: Math.min(4, Math.max(0, Math.round(demand * 2))),
      competitorPriceBin: competitorPrice,
      seasonBin: season,
      lagPriceBin: 2,
    };

    const stateIndex = env.stateToIndex(state);
    const bestAction = agent.getBestAction(stateIndex);
    const rlResult = env.simulateAction(state, bestAction, { demandMultiplier: demand });
    const staticResult = env.simulateAction(state, 5, { demandMultiplier: demand });

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

  const seasonLabels = ['Winter', 'Spring', 'Summer', 'Fall'];
  const compLabels = ['Much Lower', 'Lower', 'Similar', 'Higher', 'Much Higher'];

  return (
    <div style={{ padding: '32px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <Typography variant="heading-lg">Pricing Lab</Typography>
        {isTrained && <Badge variant="success">Agent Trained (300 episodes)</Badge>}
      </div>
      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
        Adjust market conditions and objective weights to see how the RL agent adapts its pricing recommendation.
      </Typography>

      {/* Product selector */}
      <div style={{ width: '240px', marginBottom: '24px' }}>
        <Typography variant="label-sm-bold" style={{ marginBottom: '6px' }}>Product</Typography>
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger width="fill">
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
          <SelectContent>
            {products.slice(0, 20).map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.id} ({p.category})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            <input type="range" min={0} max={4} step={1} value={competitorPrice}
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
