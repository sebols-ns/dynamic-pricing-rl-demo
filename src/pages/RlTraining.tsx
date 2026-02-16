import { useState, useEffect, useMemo } from 'react';
import {
  Typography, Button, Badge, LineChart,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useRlTraining } from '../hooks/useRlTraining';
import { QTableHeatmap } from '../components/QTableHeatmap';
import { MetricCard } from '../components/MetricCard';
import type { RewardWeights } from '../types/rl';

function RlTerm({ term, definition, children }: { term: string; definition: string; children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted cursor-help" style={{ color: 'var(--color-interactive)' }}>
            {children ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs text-sm">
            <strong>{term}:</strong> {definition}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RlTraining() {
  const { rows, products, isLoaded } = useCsvData();
  const training = useRlTraining();
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [speed, setSpeed] = useState(1);
  const [weights] = useState<RewardWeights>({ revenue: 0.4, margin: 0.4, volume: 0.2 });

  // Initialize when product is selected
  useEffect(() => {
    if (selectedProduct && isLoaded) {
      const productRows = rows.filter(r => r.product_id === selectedProduct);
      if (productRows.length > 0) {
        training.initialize(productRows, weights);
      }
    }
  }, [selectedProduct, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    training.setSpeed(speed);
  }, [speed, training]);

  // Auto-select first product
  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  // Chart data for reward history
  const rewardChartData = useMemo(() => {
    return training.history.map(h => ({
      episode: h.episode,
      reward: Math.round(h.avgReward * 1000) / 1000,
      epsilon: Math.round(h.epsilon * 100) / 100,
    }));
  }, [training.history]);

  // Moving average for smoother curve
  const smoothedData = useMemo(() => {
    const window = 10;
    return rewardChartData.map((d, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = rewardChartData.slice(start, i + 1);
      const avg = slice.reduce((s, v) => s + v.reward, 0) / slice.length;
      return { ...d, smoothReward: Math.round(avg * 1000) / 1000 };
    });
  }, [rewardChartData]);

  if (!isLoaded) {
    return (
      <div className="p-6">
        <Typography variant="heading-lg">RL Training</Typography>
        <Typography variant="body-md" className="mt-4" style={{ color: 'var(--color-secondary)' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  const lastResult = training.history[training.history.length - 1];

  return (
    <div className="p-6 space-y-6">
      <Typography variant="heading-lg">RL Training</Typography>

      {/* MDP Explanation */}
      <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--color-gray)', background: 'var(--color-light)' }}>
        <Typography variant="heading-sm">How the MDP Works</Typography>
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          The agent observes a <RlTerm term="State" definition="A discretized snapshot of market conditions: demand level, competitor price, season, and historical price.">state</RlTerm> (demand level, competitor price, season, lag price),
          takes an <RlTerm term="Action" definition="One of 10 price multipliers (0.70× to 1.20×) applied to the base price.">action</RlTerm> (price multiplier),
          and receives a <RlTerm term="Reward" definition="Weighted combination of normalized revenue, margin, and volume metrics.">reward</RlTerm> based on revenue, margin, and volume.
          Using <RlTerm term="Q-Learning" definition="A model-free RL algorithm that learns the value of state-action pairs (Q-values) to find the optimal pricing policy.">Q-learning</RlTerm>,
          it balances <RlTerm term="Exploration" definition="Trying random actions to discover potentially better pricing strategies.">exploration</RlTerm> (random) vs
          <RlTerm term="Exploitation" definition="Using the best known action (highest Q-value) for the current state.">exploitation</RlTerm> (best known) via
          <RlTerm term="Epsilon" definition="The probability of choosing a random action. Starts high (explore) and decays toward zero (exploit).">ε-greedy</RlTerm> policy.
        </Typography>
        <div className="flex gap-2 mt-2">
          <Badge variant="neutral">500 states</Badge>
          <Badge variant="neutral">10 actions</Badge>
          <Badge variant="neutral">5,000 Q-values</Badge>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex gap-2">
          {!training.isRunning ? (
            <Button onClick={training.play} disabled={!training.env}>
              ▶ Play
            </Button>
          ) : (
            <Button onClick={training.pause} variant="outline">
              ⏸ Pause
            </Button>
          )}
          <Button onClick={training.stepOnce} variant="outline" disabled={training.isRunning || !training.env}>
            Step
          </Button>
          <Button onClick={training.reset} variant="ghost" disabled={!training.env}>
            Reset
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Typography variant="label-sm">Speed:</Typography>
          <input
            type="range"
            min={1}
            max={20}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="w-24"
          />
          <Typography variant="body-sm">{speed}×</Typography>
        </div>

        <div className="flex items-center gap-2">
          {training.explorationRate > 0.5 ? (
            <Badge variant="warning">Exploring (ε={training.explorationRate.toFixed(3)})</Badge>
          ) : training.explorationRate > 0.1 ? (
            <Badge variant="accent">Transitioning (ε={training.explorationRate.toFixed(3)})</Badge>
          ) : (
            <Badge variant="primary">Exploiting (ε={training.explorationRate.toFixed(3)})</Badge>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Episode" value={training.episode} />
        <MetricCard label="Avg Reward" value={lastResult?.avgReward.toFixed(3) ?? '—'} />
        <MetricCard label="Epsilon (ε)" value={training.explorationRate.toFixed(4)} />
        <MetricCard label="Total Steps" value={(training.episode * 50).toLocaleString()} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {smoothedData.length > 0 && (
          <LineChart
            data={smoothedData}
            xAxisKey="episode"
            series={[
              { dataKey: 'smoothReward', color: 'var(--color-interactive)', strokeWidth: 2 },
              { dataKey: 'reward', color: 'var(--color-gray)', strokeWidth: 1, dot: false },
            ]}
            title="Reward per Episode"
            xAxisLabel="Episode"
            yAxisLabel="Avg Reward"
            showLegend
            legendItems={[
              { key: 'smoothed', label: 'Smoothed (10-ep avg)', color: 'var(--color-interactive)' },
              { key: 'raw', label: 'Raw', color: 'var(--color-gray)' },
            ]}
          />
        )}

        {smoothedData.length > 0 && (
          <LineChart
            data={smoothedData}
            xAxisKey="episode"
            series={[{ dataKey: 'epsilon', color: 'var(--color-warning)', strokeWidth: 2 }]}
            title="Epsilon Decay"
            xAxisLabel="Episode"
            yAxisLabel="ε"
          />
        )}
      </div>

      {/* Q-Table Heatmap */}
      {training.agent && (
        <QTableHeatmap agent={training.agent} className="mt-4" />
      )}
    </div>
  );
}
