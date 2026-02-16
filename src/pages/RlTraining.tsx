import { useState, useEffect, useMemo } from 'react';
import {
  Typography, Button, Badge, LineChart,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  CHART_COLORS, getSeriesColor,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { useRlTraining } from '../hooks/useRlTraining';
import { QTableHeatmap } from '../components/QTableHeatmap';
import { MetricCard } from '../components/MetricCard';
import type { RewardWeights } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

function RlTerm({ term, definition, children }: { term: string; definition: string; children?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            style={{
              color: 'var(--color-interactive)',
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              cursor: 'help',
            }}
          >
            {children ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div style={{ maxWidth: '280px' }}>
            <Typography variant="label-sm-bold">{term}</Typography>
            <Typography variant="body-xs" style={{ marginTop: '4px' }}>{definition}</Typography>
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

  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  const rewardChartData = useMemo(() => {
    return training.history.map(h => ({
      episode: h.episode,
      reward: Math.round(h.avgReward * 1000) / 1000,
      epsilon: Math.round(h.epsilon * 100) / 100,
    }));
  }, [training.history]);

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
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">RL Training</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '16px' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  const lastResult = training.history[training.history.length - 1];

  return (
    <div style={{ padding: '32px 0' }}>
      <Typography variant="heading-lg" style={{ marginBottom: '24px' }}>RL Training</Typography>

      {/* MDP Explanation */}
      <div style={{ ...cardStyle, backgroundColor: 'var(--color-info-subtle)', borderColor: 'var(--color-blue-200)', marginBottom: '24px' }}>
        <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>How the MDP Works</Typography>
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          The agent observes a <RlTerm term="State" definition="A discretized snapshot of market conditions: demand level, competitor price, season, and historical price.">state</RlTerm> (demand level, competitor price, season, lag price),
          takes an <RlTerm term="Action" definition="One of 10 price multipliers (0.70x to 1.20x) applied to the base price.">action</RlTerm> (price multiplier),
          and receives a <RlTerm term="Reward" definition="Weighted combination of normalized revenue, margin, and volume metrics.">reward</RlTerm> based on revenue, margin, and volume.
          Using <RlTerm term="Q-Learning" definition="A model-free RL algorithm that learns the value of state-action pairs (Q-values) to find the optimal pricing policy.">Q-learning</RlTerm>,
          it balances <RlTerm term="Exploration" definition="Trying random actions to discover potentially better pricing strategies.">exploration</RlTerm> vs{' '}
          <RlTerm term="Exploitation" definition="Using the best known action (highest Q-value) for the current state.">exploitation</RlTerm> via an{' '}
          <RlTerm term="Epsilon" definition="The probability of choosing a random action. Starts high (explore) and decays toward zero (exploit).">e-greedy</RlTerm> policy.
        </Typography>
        <div className="flex" style={{ gap: '8px', marginTop: '12px' }}>
          <Badge variant="neutral">500 states</Badge>
          <Badge variant="neutral">10 actions</Badge>
          <Badge variant="neutral">5,000 Q-values</Badge>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-wrap items-end"
        style={{ gap: '16px', marginBottom: '24px' }}
      >
        <div style={{ width: '240px' }}>
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

        <div className="flex" style={{ gap: '8px' }}>
          {!training.isRunning ? (
            <Button onClick={training.play} disabled={!training.env}>Play</Button>
          ) : (
            <Button onClick={training.pause} variant="outline">Pause</Button>
          )}
          <Button onClick={training.stepOnce} variant="outline" disabled={training.isRunning || !training.env}>
            Step
          </Button>
          <Button onClick={training.reset} variant="ghost" disabled={!training.env}>
            Reset
          </Button>
        </div>

        <div>
          <Typography variant="label-sm-bold" style={{ marginBottom: '6px' }}>Speed: {speed}x</Typography>
          <input
            type="range"
            min={1}
            max={20}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{ width: '120px' }}
          />
        </div>

        <div>
          {training.explorationRate > 0.5 ? (
            <Badge variant="warning">Exploring (e={training.explorationRate.toFixed(3)})</Badge>
          ) : training.explorationRate > 0.1 ? (
            <Badge variant="accent">Transitioning (e={training.explorationRate.toFixed(3)})</Badge>
          ) : (
            <Badge variant="primary">Exploiting (e={training.explorationRate.toFixed(3)})</Badge>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <MetricCard label="Episode" value={training.episode} />
        <MetricCard label="Avg Reward" value={lastResult?.avgReward.toFixed(3) ?? '—'} />
        <MetricCard label="Epsilon" value={training.explorationRate.toFixed(4)} />
        <MetricCard label="Total Steps" value={(training.episode * 50).toLocaleString()} />
      </div>

      {/* Charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {smoothedData.length > 0 && (
          <LineChart
            data={smoothedData}
            xAxisKey="episode"
            series={[
              { dataKey: 'smoothReward', color: getSeriesColor(0), strokeWidth: 2 },
              { dataKey: 'reward', color: 'var(--color-neutral-400)', strokeWidth: 1, dot: false },
            ]}
            title="Reward per Episode"
            xAxisLabel="Episode"
            yAxisLabel="Avg Reward"
            showLegend
            legendItems={[
              { key: 'smoothed', label: 'Smoothed (10-ep)', color: getSeriesColor(0) },
              { key: 'raw', label: 'Raw', color: 'var(--color-neutral-400)' },
            ]}
          />
        )}
        {smoothedData.length > 0 && (
          <LineChart
            data={smoothedData}
            xAxisKey="episode"
            series={[{ dataKey: 'epsilon', color: CHART_COLORS.WARNING, strokeWidth: 2 }]}
            title="Epsilon Decay"
            xAxisLabel="Episode"
            yAxisLabel="Epsilon"
          />
        )}
      </div>

      {/* Q-Table Heatmap */}
      {training.agent && (
        <div style={cardStyle}>
          <QTableHeatmap agent={training.agent} />
        </div>
      )}
    </div>
  );
}
