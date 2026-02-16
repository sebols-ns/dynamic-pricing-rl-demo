import { useMemo } from 'react';
import {
  Typography, Badge, CHART_COLORS,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  BarChart as RechartsBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
} from 'recharts';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { MetricCard } from '../components/MetricCard';
import { computeBacktest } from '../utils/backtesting';
import { DEMAND_BINS, COMPETITOR_BINS, INVENTORY_BINS, FORECAST_BINS } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

const tooltipStyle = {
  backgroundColor: 'var(--color-base-white)',
  borderColor: 'var(--color-subtle)',
  color: 'var(--color-dark)',
};

function formatDollars(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

export function Backtesting() {
  const { rows, isLoaded, datasetName } = useCsvData();
  const { agent, env, isTrained, productId: trainedProductId, episode } = useTrainedAgent();

  // Only backtest the trained product — the agent/env are calibrated for it
  const productRows = useMemo(() => {
    if (!isLoaded || !trainedProductId) return [];
    return rows.filter(r => r.product_id === trainedProductId);
  }, [rows, isLoaded, trainedProductId]);

  const summary = useMemo(() => {
    if (!agent || !env || !isTrained || productRows.length === 0) return null;
    return computeBacktest(productRows, agent, env);
  }, [productRows, agent, env, isTrained]);

  // Breakdown by demand bin
  const demandBreakdown = useMemo(() => {
    if (!summary) return [];
    const bins: Record<number, { staticRev: number; rlRev: number; count: number }> = {};
    for (const r of summary.rows) {
      const d = r.state.demandBin;
      if (!bins[d]) bins[d] = { staticRev: 0, rlRev: 0, count: 0 };
      bins[d].staticRev += r.staticRevenue;
      bins[d].rlRev += r.rlRevenue;
      bins[d].count++;
    }
    const labels = ['Low', 'Medium', 'High'];
    return Array.from({ length: DEMAND_BINS }, (_, i) => ({
      name: labels[i] ?? `Bin ${i}`,
      lift: bins[i] && bins[i].staticRev > 0
        ? ((bins[i].rlRev - bins[i].staticRev) / bins[i].staticRev) * 100
        : 0,
      count: bins[i]?.count ?? 0,
    }));
  }, [summary]);

  // Breakdown by competitor bin
  const compBreakdown = useMemo(() => {
    if (!summary) return [];
    const bins: Record<number, { staticRev: number; rlRev: number; count: number }> = {};
    for (const r of summary.rows) {
      const c = r.state.competitorPriceBin;
      if (!bins[c]) bins[c] = { staticRev: 0, rlRev: 0, count: 0 };
      bins[c].staticRev += r.staticRevenue;
      bins[c].rlRev += r.rlRevenue;
      bins[c].count++;
    }
    const labels = ['Below', 'At Parity', 'Above'];
    return Array.from({ length: COMPETITOR_BINS }, (_, i) => ({
      name: labels[i] ?? `Bin ${i}`,
      lift: bins[i] && bins[i].staticRev > 0
        ? ((bins[i].rlRev - bins[i].staticRev) / bins[i].staticRev) * 100
        : 0,
      count: bins[i]?.count ?? 0,
    }));
  }, [summary]);

  // Breakdown by season
  const seasonBreakdown = useMemo(() => {
    if (!summary) return [];
    const bins: Record<number, { staticRev: number; rlRev: number; count: number }> = {};
    for (const r of summary.rows) {
      const s = r.state.seasonBin;
      if (!bins[s]) bins[s] = { staticRev: 0, rlRev: 0, count: 0 };
      bins[s].staticRev += r.staticRevenue;
      bins[s].rlRev += r.rlRevenue;
      bins[s].count++;
    }
    const labels = ['Winter', 'Spring', 'Summer', 'Fall'];
    return Array.from({ length: 4 }, (_, i) => ({
      name: labels[i],
      lift: bins[i] && bins[i].staticRev > 0
        ? ((bins[i].rlRev - bins[i].staticRev) / bins[i].staticRev) * 100
        : 0,
      count: bins[i]?.count ?? 0,
    })).filter(b => b.count > 0);
  }, [summary]);

  const hasExtended = env?.hasExtendedState ?? false;

  // Breakdown by inventory level (only for extended datasets)
  const inventoryBreakdown = useMemo(() => {
    if (!summary || !hasExtended) return [];
    const bins: Record<number, { staticRev: number; rlRev: number; count: number }> = {};
    for (const r of summary.rows) {
      const d = r.state.inventoryBin;
      if (!bins[d]) bins[d] = { staticRev: 0, rlRev: 0, count: 0 };
      bins[d].staticRev += r.staticRevenue;
      bins[d].rlRev += r.rlRevenue;
      bins[d].count++;
    }
    const labels = ['Low', 'Medium', 'High'];
    return Array.from({ length: INVENTORY_BINS }, (_, i) => ({
      name: labels[i] ?? `Bin ${i}`,
      lift: bins[i] && bins[i].staticRev > 0
        ? ((bins[i].rlRev - bins[i].staticRev) / bins[i].staticRev) * 100
        : 0,
      count: bins[i]?.count ?? 0,
    }));
  }, [summary, hasExtended]);

  // Breakdown by demand forecast (only for extended datasets)
  const forecastBreakdown = useMemo(() => {
    if (!summary || !hasExtended) return [];
    const bins: Record<number, { staticRev: number; rlRev: number; count: number }> = {};
    for (const r of summary.rows) {
      const d = r.state.forecastBin;
      if (!bins[d]) bins[d] = { staticRev: 0, rlRev: 0, count: 0 };
      bins[d].staticRev += r.staticRevenue;
      bins[d].rlRev += r.rlRevenue;
      bins[d].count++;
    }
    const labels = ['Low', 'Medium', 'High'];
    return Array.from({ length: FORECAST_BINS }, (_, i) => ({
      name: labels[i] ?? `Bin ${i}`,
      lift: bins[i] && bins[i].staticRev > 0
        ? ((bins[i].rlRev - bins[i].staticRev) / bins[i].staticRev) * 100
        : 0,
      count: bins[i]?.count ?? 0,
    }));
  }, [summary, hasExtended]);

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Backtesting</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '8px' }}>
          Load a dataset in the Data Explorer tab to begin.
        </Typography>
      </div>
    );
  }

  if (!isTrained) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Backtesting</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '8px' }}>
          Train an RL agent in the Training tab first. The backtest will replay historical data through
          the trained agent to show what prices it would have recommended.
        </Typography>
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Backtesting</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '8px' }}>
          No data available for product {trainedProductId}.
        </Typography>
      </div>
    );
  }

  const datasetLabel = datasetName === 'store_inventory' ? 'Store Inventory' : 'Retail Price';

  return (
    <div style={{ padding: '32px 0' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <div>
          <Typography variant="heading-lg">Backtesting</Typography>
          <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '4px' }}>
            RL agent vs. historical pricing — replayed across {productRows.length.toLocaleString()} historical rows for product {trainedProductId}.
          </Typography>
        </div>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <Badge variant="neutral">{datasetLabel}</Badge>
          <Badge variant="neutral">{trainedProductId}</Badge>
          <Badge variant="primary">Ep. {episode.toLocaleString()}</Badge>
        </div>
      </div>

      {/* Explanation */}
      <div style={{
        border: '1px solid var(--color-blue-200)',
        borderRadius: '8px',
        padding: '12px 16px',
        backgroundColor: 'var(--color-info-subtle)',
        marginBottom: '24px',
      }}>
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          Both strategies use the same demand model. <strong>Historical</strong> represents the baseline 1.00x pricing
          (${ env!.getBasePrice().toFixed(2) }). <strong>RL</strong> adapts per market state. This is an apples-to-apples
          comparison — the only difference is pricing strategy.
        </Typography>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <MetricCard
          label="Revenue Lift vs Historical"
          value={formatPct(summary.revenueLift)}
          subtitle={`${formatDollars(summary.totalRlRevenue)} vs ${formatDollars(summary.totalStaticRevenue)}`}
        />
        <MetricCard
          label="Margin Lift vs Historical"
          value={formatPct(summary.marginLift)}
          subtitle={`${formatDollars(summary.totalRlMargin)} vs ${formatDollars(summary.totalStaticMargin)}`}
        />
        <MetricCard
          label="Avg RL Multiplier"
          value={`${summary.avgPriceChange.toFixed(2)}x`}
          subtitle={`Base price: $${env!.getBasePrice().toFixed(2)}`}
        />
        <MetricCard
          label="Rows Analyzed"
          value={summary.rows.length.toLocaleString()}
          subtitle={`${summary.monthly.length} months`}
        />
      </div>

      {/* Cumulative Revenue Gap Chart */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
          Cumulative Revenue — RL Agent vs Historical Pricing
        </Typography>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={summary.monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
              interval={Math.max(0, Math.ceil(summary.monthly.length / 10) - 1)}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
              tickFormatter={formatDollars}
            />
            <RechartsTooltip
              contentStyle={tooltipStyle}
              formatter={((value: number, name: string) => [formatDollars(value), name]) as never}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="cumulativeRlRevenue"
              name="RL Agent"
              stroke={CHART_COLORS.PRIMARY}
              fill={CHART_COLORS.PRIMARY}
              fillOpacity={0.3}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="cumulativeStaticRevenue"
              name="Historical (1.00x)"
              stroke={CHART_COLORS.SECONDARY}
              fill={CHART_COLORS.SECONDARY}
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Price Timeline */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
          Average Price Over Time — Actual vs RL Recommended
        </Typography>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={summary.monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
              interval={Math.max(0, Math.ceil(summary.monthly.length / 10) - 1)}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              domain={['auto', 'auto']}
            />
            <RechartsTooltip
              contentStyle={tooltipStyle}
              formatter={((value: number, name: string) => [`$${value.toFixed(2)}`, name]) as never}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="avgActualPrice"
              name="Actual (Historical)"
              stroke={CHART_COLORS.SECONDARY}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avgRlPrice"
              name="RL Recommended"
              stroke={CHART_COLORS.PRIMARY}
              strokeWidth={2}
              dot={false}
              strokeDasharray="6 3"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        <div style={cardStyle}>
          <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
            Revenue Lift by Demand Level
          </Typography>
          <ResponsiveContainer width="100%" height={200}>
            <RechartsBarChart data={demandBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-secondary)' }} />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              />
              <RechartsTooltip
                contentStyle={tooltipStyle}
                formatter={((value: number) => [`${value.toFixed(1)}%`, 'Lift vs Historical']) as never}
              />
              <Bar dataKey="lift" fill={CHART_COLORS.PRIMARY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
            Revenue Lift by Competitor Pricing
          </Typography>
          <ResponsiveContainer width="100%" height={200}>
            <RechartsBarChart data={compBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-secondary)' }} />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              />
              <RechartsTooltip
                contentStyle={tooltipStyle}
                formatter={((value: number) => [`${value.toFixed(1)}%`, 'Lift vs Historical']) as never}
              />
              <Bar dataKey="lift" fill={CHART_COLORS.SECONDARY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
            Revenue Lift by Season
          </Typography>
          <ResponsiveContainer width="100%" height={200}>
            <RechartsBarChart data={seasonBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-secondary)' }} />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              />
              <RechartsTooltip
                contentStyle={tooltipStyle}
                formatter={((value: number) => [`${value.toFixed(1)}%`, 'Lift vs Historical']) as never}
              />
              <Bar dataKey="lift" fill="#8b5cf6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>

        {hasExtended && (
          <>
            <div style={cardStyle}>
              <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
                Revenue Lift by Inventory Level
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <RechartsBarChart data={inventoryBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-secondary)' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    formatter={((value: number) => [`${value.toFixed(1)}%`, 'Lift vs Historical']) as never}
                  />
                  <Bar dataKey="lift" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>

            <div style={cardStyle}>
              <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
                Revenue Lift by Demand Forecast
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <RechartsBarChart data={forecastBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-secondary)' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    formatter={((value: number) => [`${value.toFixed(1)}%`, 'Lift vs Historical']) as never}
                  />
                  <Bar dataKey="lift" fill="#06b6d4" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Caveat banner */}
      <div style={{
        border: '1px solid var(--color-blue-200)',
        borderRadius: '8px',
        padding: '16px 20px',
        backgroundColor: 'var(--color-info-subtle)',
      }}>
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          <strong>Note:</strong> Both RL and Historical strategies are evaluated using the same log-linear demand model
          with state-dependent elasticity. The lift shown reflects the advantage of adaptive pricing over
          a fixed 1.00x strategy within that model. Real-world results depend on actual demand elasticity
          and market dynamics.
        </Typography>
      </div>
    </div>
  );
}
