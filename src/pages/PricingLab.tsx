import { useState, useMemo, useEffect } from 'react';
import {
  Typography, Badge, BarChart,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { MetricCard } from '../components/MetricCard';
import { PricingEnvironment } from '../engine/environment';
import { QLearningAgent } from '../engine/q-learning';
import type { RewardWeights, State } from '../types/rl';
import { ACTION_MULTIPLIERS, NUM_ACTIONS } from '../types/rl';

export function PricingLab() {
  const { rows, products, isLoaded } = useCsvData();
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [demand, setDemand] = useState(1.0);
  const [competitorPrice, setCompetitorPrice] = useState(2); // bin
  const [season, setSeason] = useState(2); // summer
  const [weights, setWeights] = useState<RewardWeights>({ revenue: 0.4, margin: 0.4, volume: 0.2 });
  const [agent, setAgent] = useState<QLearningAgent | null>(null);
  const [env, setEnv] = useState<PricingEnvironment | null>(null);
  const [isTrained, setIsTrained] = useState(false);

  // Auto-select first product
  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  // Auto-train a quick agent when product changes
  useEffect(() => {
    if (!selectedProduct || !isLoaded) return;
    const productRows = rows.filter(r => r.product_id === selectedProduct);
    if (productRows.length === 0) return;

    const newEnv = new PricingEnvironment({ productRows, weights });
    const newAgent = new QLearningAgent({ episodes: 300 });

    // Quick background training
    for (let ep = 0; ep < 300; ep++) {
      newAgent.runEpisode(newEnv);
    }

    setEnv(newEnv);
    setAgent(newAgent);
    setIsTrained(true);
  }, [selectedProduct, isLoaded, rows, weights]);

  // Compute recommendations
  const results = useMemo(() => {
    if (!agent || !env || !isTrained) return null;

    const state: State = {
      demandBin: Math.min(4, Math.max(0, Math.round(demand * 2))),
      competitorPriceBin: competitorPrice,
      seasonBin: season,
      lagPriceBin: 2, // median
    };

    const stateIndex = env.stateToIndex(state);
    const bestAction = agent.getBestAction(stateIndex);
    const rlResult = env.simulateAction(state, bestAction, { demandMultiplier: demand });

    // Static pricing (action=5 → multiplier=1.0)
    const staticResult = env.simulateAction(state, 5, { demandMultiplier: demand });

    // Random pricing (average over all actions)
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
      <div className="p-6">
        <Typography variant="heading-lg">Pricing Lab</Typography>
        <Typography variant="body-md" className="mt-4" style={{ color: 'var(--color-secondary)' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  const seasonLabels = ['Winter', 'Spring', 'Summer', 'Fall'];
  const compLabels = ['Much Lower', 'Lower', 'Similar', 'Higher', 'Much Higher'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Typography variant="heading-lg">Pricing Lab</Typography>
        {isTrained && <Badge variant="success">Agent Trained (300 episodes)</Badge>}
      </div>

      <Typography variant="body-md" style={{ color: 'var(--color-secondary)' }}>
        Adjust market conditions and objective weights to see how the RL agent adapts its pricing recommendation.
      </Typography>

      {/* Product selector */}
      <div className="w-64">
        <Typography variant="label-sm" className="mb-1">Product</Typography>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* What-if Sliders */}
        <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: 'var(--color-gray)' }}>
          <Typography variant="heading-sm">Market Conditions</Typography>

          <div>
            <Typography variant="label-sm">Demand Level: {demand.toFixed(1)}×</Typography>
            <input type="range" min={0.2} max={2.0} step={0.1} value={demand}
              onChange={e => setDemand(Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-xs" style={{ color: 'var(--color-secondary)' }}>
              <span>Low</span><span>High</span>
            </div>
          </div>

          <div>
            <Typography variant="label-sm">Competitor Price: {compLabels[competitorPrice]}</Typography>
            <input type="range" min={0} max={4} step={1} value={competitorPrice}
              onChange={e => setCompetitorPrice(Number(e.target.value))} className="w-full" />
          </div>

          <div>
            <Typography variant="label-sm">Season: {seasonLabels[season]}</Typography>
            <input type="range" min={0} max={3} step={1} value={season}
              onChange={e => setSeason(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        {/* Objective Weights */}
        <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: 'var(--color-gray)' }}>
          <Typography variant="heading-sm">Objective Weights</Typography>
          <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
            Adjust how the agent balances competing objectives. Weights are normalized.
          </Typography>

          <div>
            <Typography variant="label-sm">Revenue: {(weights.revenue * 100).toFixed(0)}%</Typography>
            <input type="range" min={0} max={1} step={0.05} value={weights.revenue}
              onChange={e => {
                const v = Number(e.target.value);
                const total = v + weights.margin + weights.volume;
                setWeights({ revenue: v / total, margin: weights.margin / total, volume: weights.volume / total });
              }} className="w-full" />
          </div>

          <div>
            <Typography variant="label-sm">Margin: {(weights.margin * 100).toFixed(0)}%</Typography>
            <input type="range" min={0} max={1} step={0.05} value={weights.margin}
              onChange={e => {
                const v = Number(e.target.value);
                const total = weights.revenue + v + weights.volume;
                setWeights({ revenue: weights.revenue / total, margin: v / total, volume: weights.volume / total });
              }} className="w-full" />
          </div>

          <div>
            <Typography variant="label-sm">Volume: {(weights.volume * 100).toFixed(0)}%</Typography>
            <input type="range" min={0} max={1} step={0.05} value={weights.volume}
              onChange={e => {
                const v = Number(e.target.value);
                const total = weights.revenue + weights.margin + v;
                setWeights({ revenue: weights.revenue / total, margin: weights.margin / total, volume: v / total });
              }} className="w-full" />
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Recommended Price"
              value={`$${results.rl.price.toFixed(2)}`}
              subtitle={`${ACTION_MULTIPLIERS[results.bestAction].toFixed(2)}× base`}
            />
            <MetricCard
              label="Expected Revenue"
              value={`$${results.rl.revenue.toFixed(0)}`}
            />
            <MetricCard
              label="Expected Margin"
              value={`$${results.rl.margin.toFixed(0)}`}
            />
            <MetricCard
              label="Base Price"
              value={`$${results.basePrice.toFixed(2)}`}
            />
          </div>

          {/* Comparison Chart */}
          {comparisonData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BarChart
                data={comparisonData}
                xAxisKey="strategy"
                yAxisKey="revenue"
                title="Revenue Comparison"
                xAxisLabel="Strategy"
                yAxisLabel="Revenue ($)"
              />
              <BarChart
                data={comparisonData}
                xAxisKey="strategy"
                yAxisKey="margin"
                title="Margin Comparison"
                xAxisLabel="Strategy"
                yAxisLabel="Margin ($)"
                barColor="var(--color-success)"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
