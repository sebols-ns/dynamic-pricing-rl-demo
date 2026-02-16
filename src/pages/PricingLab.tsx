import { useState, useMemo } from 'react';
import {
  Typography, Badge,
  CHART_COLORS,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer, BarChart as RechartsBarChart, Bar,
  XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell, LabelList,
} from 'recharts';
import { useCsvData } from '../hooks/useCsvData';
import { useTrainedAgent } from '../hooks/useTrainedAgent';
import { MetricCard } from '../components/MetricCard';
import type { State } from '../types/rl';
import { ACTION_MULTIPLIERS, NUM_ACTIONS, DEMAND_BINS, COMPETITOR_BINS, SEASON_BINS, LAG_PRICE_BINS, INVENTORY_BINS, FORECAST_BINS } from '../types/rl';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

export function PricingLab() {
  const { isLoaded, datasetName } = useCsvData();
  const { agent, env, isTrained, productId, episode } = useTrainedAgent();
  const [demand, setDemand] = useState(1.0);
  const [competitorPrice, setCompetitorPrice] = useState(1);
  const [season, setSeason] = useState(2);
  const [inventoryBin, setInventoryBin] = useState(1);
  const [forecastBin, setForecastBin] = useState(1);

  const hasExtended = env?.hasExtendedState ?? false;

  const results = useMemo(() => {
    if (!agent || !env || !isTrained) return null;

    const state: State = {
      demandBin: Math.min(2, Math.max(0, Math.round(demand))),
      competitorPriceBin: competitorPrice,
      seasonBin: season,
      lagPriceBin: 1,
      inventoryBin: hasExtended ? inventoryBin : 0,
      forecastBin: hasExtended ? forecastBin : 0,
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
  }, [agent, env, isTrained, demand, competitorPrice, season, hasExtended, inventoryBin, forecastBin]);

  const comparisonData = useMemo(() => {
    if (!results) return { revenue: [], margin: [], revLift: 0, marginLift: 0 };
    const rlRev = Math.round(results.rl.revenue);
    const stRev = Math.round(results.static.revenue);
    const rdRev = Math.round(results.random.revenue);
    const rlMar = Math.round(results.rl.margin);
    const stMar = Math.round(results.static.margin);
    const rdMar = Math.round(results.random.margin);
    return {
      revenue: [
        { strategy: 'RL Agent', value: rlRev },
        { strategy: 'Static', value: stRev },
        { strategy: 'Random', value: rdRev },
      ],
      margin: [
        { strategy: 'RL Agent', value: rlMar },
        { strategy: 'Static', value: stMar },
        { strategy: 'Random', value: rdMar },
      ],
      revLift: stRev > 0 ? ((rlRev - stRev) / stRev) * 100 : 0,
      marginLift: stMar > 0 ? ((rlMar - stMar) / stMar) * 100 : 0,
    };
  }, [results]);

  // Aggregate comparison across all states — shows RL's true adaptive advantage
  const aggregateComparison = useMemo(() => {
    if (!agent || !env || !isTrained) return null;

    const staticActionIdx = ACTION_MULTIPLIERS.indexOf(1.00);
    const staticAction = staticActionIdx >= 0 ? staticActionIdx : 3;
    let rlTotalRev = 0, stTotalRev = 0, rdTotalRev = 0;
    let rlTotalMar = 0, stTotalMar = 0, rdTotalMar = 0;
    let stateCount = 0;

    const invMax = hasExtended ? INVENTORY_BINS : 1;
    const frcMax = hasExtended ? FORECAST_BINS : 1;

    for (let d = 0; d < DEMAND_BINS; d++) {
      for (let c = 0; c < COMPETITOR_BINS; c++) {
        for (let s = 0; s < SEASON_BINS; s++) {
          for (let l = 0; l < LAG_PRICE_BINS; l++) {
            for (let inv = 0; inv < invMax; inv++) {
              for (let frc = 0; frc < frcMax; frc++) {
                const state: State = { demandBin: d, competitorPriceBin: c, seasonBin: s, lagPriceBin: l, inventoryBin: inv, forecastBin: frc };
                const stateIndex = env.stateToIndex(state);
                const bestAction = agent.getBestAction(stateIndex);

                const rlRes = env.simulateAction(state, bestAction);
                const stRes = env.simulateAction(state, staticAction);

                rlTotalRev += rlRes.revenue;
                stTotalRev += stRes.revenue;
                rlTotalMar += rlRes.margin;
                stTotalMar += stRes.margin;

                for (let a = 0; a < NUM_ACTIONS; a++) {
                  const r = env.simulateAction(state, a);
                  rdTotalRev += r.revenue / NUM_ACTIONS;
                  rdTotalMar += r.margin / NUM_ACTIONS;
                }
                stateCount++;
              }
            }
          }
        }
      }
    }

    const avgRlRev = rlTotalRev / stateCount;
    const avgStRev = stTotalRev / stateCount;
    const avgRdRev = rdTotalRev / stateCount;
    const avgRlMar = rlTotalMar / stateCount;
    const avgStMar = stTotalMar / stateCount;
    const avgRdMar = rdTotalMar / stateCount;

    return {
      revenue: [
        { strategy: 'RL Agent', value: Math.round(avgRlRev) },
        { strategy: 'Static', value: Math.round(avgStRev) },
        { strategy: 'Random', value: Math.round(avgRdRev) },
      ],
      margin: [
        { strategy: 'RL Agent', value: Math.round(avgRlMar) },
        { strategy: 'Static', value: Math.round(avgStMar) },
        { strategy: 'Random', value: Math.round(avgRdMar) },
      ],
      revLift: avgStRev > 0 ? ((avgRlRev - avgStRev) / avgStRev) * 100 : 0,
      marginLift: avgStMar > 0 ? ((avgRlMar - avgStMar) / avgStMar) * 100 : 0,
    };
  }, [agent, env, isTrained, hasExtended]);

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
  const inventoryLabels = ['Low', 'Medium', 'High'];
  const forecastLabels = ['Low', 'Medium', 'High'];
  const totalStates = env?.getTotalStates() ?? 108;

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

          {hasExtended && (
            <>
              <div style={{ marginTop: '16px' }}>
                <div className="flex justify-between" style={{ marginBottom: '6px' }}>
                  <Typography variant="label-sm-bold">Inventory Level</Typography>
                  <Typography variant="label-sm" style={{ color: 'var(--color-interactive)' }}>{inventoryLabels[inventoryBin]}</Typography>
                </div>
                <input type="range" min={0} max={2} step={1} value={inventoryBin}
                  onChange={e => setInventoryBin(Number(e.target.value))} style={{ width: '100%' }} />
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="flex justify-between" style={{ marginBottom: '6px' }}>
                  <Typography variant="label-sm-bold">Demand Forecast</Typography>
                  <Typography variant="label-sm" style={{ color: 'var(--color-interactive)' }}>{forecastLabels[forecastBin]}</Typography>
                </div>
                <input type="range" min={0} max={2} step={1} value={forecastBin}
                  onChange={e => setForecastBin(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
            </>
          )}
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
            <MetricCard label={datasetName === 'store_inventory' ? 'Expected Margin (est.)' : 'Expected Margin'} value={`$${results.rl.margin.toFixed(0)}`} />
            <MetricCard label="Base Price" value={`$${results.basePrice.toFixed(2)}`} />
          </div>

          {/* Current conditions comparison */}
          <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>Current Conditions</Typography>
          <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Performance for the specific market conditions selected above. For individual conditions, the RL
            agent may perform similarly to static pricing when 1.00x happens to be near-optimal for that state.
          </Typography>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '24px',
              marginBottom: '40px',
            }}
          >
            {[
              { data: comparisonData.revenue, title: 'Revenue — Current Conditions', label: 'Revenue ($)', color: CHART_COLORS.PRIMARY, lift: comparisonData.revLift },
              { data: comparisonData.margin, title: datasetName === 'store_inventory' ? 'Margin (est.) — Current Conditions' : 'Margin — Current Conditions', label: 'Margin ($)', color: CHART_COLORS.SUCCESS, lift: comparisonData.marginLift },
            ].map(chart => {
              const values = chart.data.map(d => d.value);
              const min = Math.min(...values);
              const max = Math.max(...values);
              const padding = Math.max(1, (max - min) * 0.3);
              const yMin = Math.max(0, Math.floor((min - padding) / 10) * 10);
              const yMax = Math.ceil((max + padding) / 10) * 10;
              const barColors = [chart.color, 'var(--color-neutral-400)', 'var(--color-neutral-300)'];

              return (
                <div key={chart.title} style={{ ...cardStyle }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                    <Typography variant="label-sm-bold">{chart.title}</Typography>
                    {chart.lift !== 0 && (
                      <Badge variant={chart.lift > 0 ? 'success' : 'error'}>
                        {chart.lift > 0 ? '+' : ''}{chart.lift.toFixed(1)}% vs Static
                      </Badge>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <RechartsBarChart data={chart.data} margin={{ top: 20, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                      <XAxis dataKey="strategy" tick={{ fontSize: 12 }} />
                      <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11 }} label={{ value: chart.label, angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                      <RechartsTooltip formatter={((value: number) => `$${value.toLocaleString()}`) as any} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="value" position="top" fontSize={12} formatter={((v: number) => `$${v.toLocaleString()}`) as any} />
                        {chart.data.map((_, i) => (
                          <Cell key={i} fill={barColors[i]} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>

          {/* Aggregate comparison across ALL states */}
          {aggregateComparison && (
            <>
              <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>Across All Market Conditions</Typography>
              <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
                Average performance across all {totalStates} possible state combinations. This is where the RL agent's
                adaptive pricing shines — it chooses a different optimal price for each market condition, while
                static pricing uses 1.00x everywhere.
              </Typography>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                  gap: '24px',
                }}
              >
                {[
                  { data: aggregateComparison.revenue, title: 'Avg Revenue — All Conditions', label: 'Revenue ($)', color: CHART_COLORS.PRIMARY, lift: aggregateComparison.revLift },
                  { data: aggregateComparison.margin, title: datasetName === 'store_inventory' ? 'Avg Margin (est.) — All Conditions' : 'Avg Margin — All Conditions', label: 'Margin ($)', color: CHART_COLORS.SUCCESS, lift: aggregateComparison.marginLift },
                ].map(chart => {
                  const values = chart.data.map(d => d.value);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const padding = Math.max(1, (max - min) * 0.3);
                  const yMin = Math.max(0, Math.floor((min - padding) / 10) * 10);
                  const yMax = Math.ceil((max + padding) / 10) * 10;
                  const barColors = [chart.color, 'var(--color-neutral-400)', 'var(--color-neutral-300)'];

                  return (
                    <div key={chart.title} style={{ ...cardStyle }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                        <Typography variant="label-sm-bold">{chart.title}</Typography>
                        <Badge variant={chart.lift > 0 ? 'success' : 'error'}>
                          {chart.lift > 0 ? '+' : ''}{chart.lift.toFixed(1)}% vs Static
                        </Badge>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <RechartsBarChart data={chart.data} margin={{ top: 20, right: 16, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                          <XAxis dataKey="strategy" tick={{ fontSize: 12 }} />
                          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11 }} label={{ value: chart.label, angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                          <RechartsTooltip formatter={((value: number) => `$${value.toLocaleString()}`) as any} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="value" position="top" fontSize={12} formatter={((v: number) => `$${v.toLocaleString()}`) as any} />
                            {chart.data.map((_, i) => (
                              <Cell key={i} fill={barColors[i]} />
                            ))}
                          </Bar>
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
