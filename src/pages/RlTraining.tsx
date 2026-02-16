import { useState, useEffect, useMemo } from 'react';
import {
  Typography, Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  CHART_COLORS, getSeriesColor,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer, LineChart as RechartsLineChart, Line,
  XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
} from 'recharts';
import { useCsvData } from '../hooks/useCsvData';
import type { useRlTraining } from '../hooks/useRlTraining';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { QTableHeatmap } from '../components/QTableHeatmap';
import { MetricCard } from '../components/MetricCard';
import type { RewardWeights } from '../types/rl';

interface RlTrainingProps {
  training: ReturnType<typeof useRlTraining>;
}

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

export function RlTraining({ training }: RlTrainingProps) {
  const { rows, products, isLoaded } = useCsvData();
  const trainedCtx = useTrainedAgent();
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

  // Publish trained agent to shared context for Pricing Lab / Explainability
  useEffect(() => {
    if (training.agent && training.env && selectedProduct && training.episode > 0) {
      trainedCtx.setTrained(training.agent, training.env, selectedProduct, training.episode);
    }
  }, [training.agent, training.env, training.episode, selectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // Downsample chart data — show ~60 points for smooth charts
  const chartData = useMemo(() => {
    const hist = training.history;
    if (hist.length === 0) return [];

    // Compute smoothed values on full data first
    const smoothWindow = Math.max(5, Math.floor(hist.length / 20));
    const full = hist.map((h, i) => {
      const start = Math.max(0, i - smoothWindow + 1);
      const slice = hist.slice(start, i + 1);
      const rewardAvg = slice.reduce((s, v) => s + v.avgReward, 0) / slice.length;
      const revAvg = slice.reduce((s, v) => s + v.avgRevenue, 0) / slice.length;
      return {
        episode: h.episode,
        reward: Math.round(h.avgReward * 1000) / 1000,
        smoothReward: Math.round(rewardAvg * 1000) / 1000,
        epsilon: Math.round(h.epsilon * 1000) / 1000,
        revenue: Math.round(revAvg),
      };
    });

    const maxPoints = 60;
    if (full.length <= maxPoints) return full.map(p => ({ ...p, episode: Math.round(p.episode) }));
    const step = full.length / maxPoints;
    const sampled = [];
    const seen = new Set<number>();
    for (let i = 0; i < maxPoints; i++) {
      const point = full[Math.floor(i * step)];
      const ep = Math.round(point.episode);
      if (!seen.has(ep)) {
        seen.add(ep);
        sampled.push({ ...point, episode: ep });
      }
    }
    // Always include the last point
    const lastEp = Math.round(full[full.length - 1].episode);
    if (!seen.has(lastEp)) {
      sampled.push({ ...full[full.length - 1], episode: lastEp });
    }
    return sampled;
  }, [training.history]);

  // Explicitly compute chart X domain to avoid Recharts caching stale bounds during streaming
  const chartXDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 100];
    return [chartData[0].episode, chartData[chartData.length - 1].episode];
  }, [chartData]);

  // Compute static baseline revenue (what 1.0x pricing would yield on average)
  const staticBaselineRevenue = useMemo(() => {
    if (!training.env) return null;
    const env = training.env;
    const basePrice = env.getBasePrice();
    const baseQty = env.getBaseQty();
    return Math.round(basePrice * baseQty);
  }, [training.env]);

  // Add static baseline to chart data for revenue comparison
  const revenueChartData = useMemo(() => {
    if (!staticBaselineRevenue) return chartData;
    return chartData.map(d => ({ ...d, staticRevenue: staticBaselineRevenue }));
  }, [chartData, staticBaselineRevenue]);

  const maxEpisodes = training.agent?.getConfig().episodes ?? 500;
  const progress = Math.round((training.episode / maxEpisodes) * 100);

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
          takes an <RlTerm term="Action" definition="One of 12 price multipliers (0.80x to 1.60x) applied to the base price.">action</RlTerm> (price multiplier),
          and receives a <RlTerm term="Reward" definition="Weighted combination of normalized revenue, margin, and volume metrics.">reward</RlTerm> based on revenue, margin, and volume.
          Using <RlTerm term="Q-Learning" definition="A model-free RL algorithm that learns the value of state-action pairs (Q-values) to find the optimal pricing policy.">Q-learning</RlTerm>,
          it balances <RlTerm term="Exploration" definition="Trying random actions to discover potentially better pricing strategies.">exploration</RlTerm> vs{' '}
          <RlTerm term="Exploitation" definition="Using the best known action (highest Q-value) for the current state.">exploitation</RlTerm> via an{' '}
          <RlTerm term="Epsilon" definition="The probability of choosing a random action. Starts high (explore) and decays toward zero (exploit).">e-greedy</RlTerm> policy.
        </Typography>
        <div className="flex" style={{ gap: '8px', marginTop: '12px' }}>
          <Badge variant="neutral">108 states</Badge>
          <Badge variant="neutral">12 actions</Badge>
          <Badge variant="neutral">1,296 Q-values</Badge>
        </div>
      </div>

      {/* Data Pipeline */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>Data Pipeline</Typography>
        <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
          How your retail data feeds into the RL pricing model. In production, a platform like Palantir Foundry
          acts as the data integration layer — connecting live transactional, competitor, and market data into
          the feature pipeline in real time.
        </Typography>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', overflow: 'auto' }}>
          {[
            { title: 'Raw Data', color: 'var(--color-blue-100)', fields: ['unit_price', 'qty', 'freight_price', 'comp_1', 'lag_price', 'month'] },
            { title: 'Feature Extraction', color: 'var(--color-purple-100)', fields: ['Demand level', 'Competitor ratio', 'Seasonality', 'Price history'] },
            { title: 'State Discretization', color: 'var(--color-yellow-100)', fields: ['3 demand bins', '3 competitor bins', '4 season bins', '3 lag-price bins'] },
            { title: 'Q-Learning Agent', color: 'var(--color-green-100)', fields: ['108 states x 12 actions', 'Reward = f(rev, margin, vol)', 'Epsilon-greedy exploration'] },
            { title: 'Pricing Decision', color: 'var(--color-success-subtle)', fields: ['Optimal multiplier', 'Per-state policy', 'Adapts to conditions'] },
          ].map((stage, i) => (
            <div key={stage.title} style={{ display: 'flex', alignItems: 'stretch' }}>
              {i > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', color: 'var(--color-secondary)', fontSize: '18px', fontWeight: 700 }}>
                  {'\u2192'}
                </div>
              )}
              <div style={{
                backgroundColor: stage.color,
                borderRadius: '8px',
                padding: '12px 14px',
                minWidth: '150px',
                flex: '1 0 auto',
              }}>
                <Typography variant="label-sm-bold" style={{ marginBottom: '6px' }}>{stage.title}</Typography>
                {stage.fields.map(f => (
                  <Typography key={f} variant="body-xs" style={{ color: 'var(--color-secondary)', lineHeight: 1.6 }}>{f}</Typography>
                ))}
              </div>
            </div>
          ))}
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

      {/* Progress Bar */}
      {(training.isRunning || training.episode > 0) && (
        <div style={{ marginBottom: '24px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
            <Typography variant="label-sm-bold">
              {training.isRunning ? 'Training...' : training.earlyStopped ? `Converged at episode ${training.earlyStoppedAt}` : training.episode >= maxEpisodes ? 'Training Complete' : 'Paused'}
            </Typography>
            <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>
              {training.episode} / {maxEpisodes} episodes ({progress}%)
            </Typography>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--color-neutral-200)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: '3px',
                backgroundColor: (training.earlyStopped || training.episode >= maxEpisodes) ? 'var(--color-success)' : 'var(--color-interactive)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

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
        <MetricCard label="Total Steps" value={(training.episode * 200).toLocaleString()} />
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
        {chartData.length > 0 && (
          <div className="border border-subtle bg-light mx-0" style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
              <Typography variant="label-sm-bold">Reward per Episode</Typography>
              <div className="flex items-center" style={{ gap: '12px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 12, height: 3, backgroundColor: getSeriesColor(0), display: 'inline-block', borderRadius: 1 }} /> Smoothed
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 12, height: 3, backgroundColor: 'var(--color-neutral-400)', display: 'inline-block', borderRadius: 1 }} /> Raw
                </span>
              </div>
            </div>
            <div style={{ padding: '8px 8px 16px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsLineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                  <XAxis dataKey="episode" type="number" domain={chartXDomain} tick={{ fontSize: 11 }} label={{ value: 'Episode', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} label={{ value: 'Avg Reward', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="smoothReward" stroke={getSeriesColor(0)} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="reward" stroke="var(--color-neutral-400)" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {revenueChartData.length > 0 && (
          <div className="border border-subtle bg-light mx-0" style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
              <Typography variant="label-sm-bold">Revenue vs Static Baseline</Typography>
              <div className="flex items-center" style={{ gap: '12px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 12, height: 3, backgroundColor: CHART_COLORS.SUCCESS, display: 'inline-block', borderRadius: 1 }} /> RL Agent
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 12, height: 3, backgroundColor: 'var(--color-neutral-400)', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed' }} /> Static (1.0x)
                </span>
              </div>
            </div>
            <div style={{ padding: '8px 8px 16px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsLineChart data={revenueChartData} margin={{ top: 8, right: 16, left: 16, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                  <XAxis dataKey="episode" type="number" domain={chartXDomain} tick={{ fontSize: 11 }} label={{ value: 'Episode', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} label={{ value: 'Avg Revenue ($)', angle: -90, position: 'insideLeft', offset: 0, fontSize: 12 }} />
                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS.SUCCESS} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} name="RL Agent" />
                  <Line type="monotone" dataKey="staticRevenue" stroke="var(--color-neutral-400)" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} name="Static (1.0x)" />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Q-Table Heatmap + Explainer */}
      {training.agent && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
          <div style={cardStyle}>
            <QTableHeatmap agent={training.agent} episode={training.episode} />
          </div>
          <div style={{ ...cardStyle, backgroundColor: 'var(--color-info-subtle)', borderColor: 'var(--color-blue-200)' }}>
            <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>Reading the Q-Table</Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
              Each row is a <strong>state</strong> (a market condition the agent has encountered).
              Each column is an <strong>action</strong> (a price multiplier from 0.80x to 1.60x).
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
              Cell values are <strong>Q-values</strong> — the agent's learned estimate of how much reward
              it expects from taking that action in that state. Higher values (darker green) mean the agent
              believes that price multiplier is more profitable.
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
              The <strong>outlined cell</strong> in each row is the agent's preferred action for that state —
              the price it would recommend.
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              As training progresses, Q-values should differentiate: good actions rise while poor ones stay low.
              If all values in a row look similar, the agent hasn't learned a clear preference for that state yet.
            </Typography>
          </div>
        </div>
      )}
    </div>
  );
}
