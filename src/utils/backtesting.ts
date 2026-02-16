import type { RetailRow } from '../types/data';
import type { State } from '../types/rl';
import { ACTION_MULTIPLIERS } from '../types/rl';
import type { QLearningAgent } from '../engine/q-learning';
import type { PricingEnvironment } from '../engine/environment';
import { compareMonthYear } from './math';

export interface BacktestRow {
  date: string;
  /** Static (1.00x) price from demand model */
  staticPrice: number;
  /** RL-recommended price from demand model */
  rlPrice: number;
  /** Actual historical price from the raw data */
  actualPrice: number;
  /** Revenue at static pricing (same demand model) */
  staticRevenue: number;
  /** Revenue at RL pricing (same demand model) */
  rlRevenue: number;
  /** Margin at static pricing */
  staticMargin: number;
  /** Margin at RL pricing */
  rlMargin: number;
  rlAction: number;
  state: State;
  qty: number;
}

export interface BacktestSummary {
  rows: BacktestRow[];
  totalStaticRevenue: number;
  totalRlRevenue: number;
  totalStaticMargin: number;
  totalRlMargin: number;
  revenueLift: number;
  marginLift: number;
  avgPriceChange: number;
  monthly: MonthlyAggregate[];
  /** Whether actual historical prices are available (non-zero) */
  hasActualPrices: boolean;
}

export interface MonthlyAggregate {
  date: string;
  staticRevenue: number;
  rlRevenue: number;
  staticMargin: number;
  rlMargin: number;
  avgActualPrice: number;
  avgRlPrice: number;
  count: number;
  cumulativeStaticRevenue: number;
  cumulativeRlRevenue: number;
  cumulativeGap: number;
}

/**
 * Compare RL agent vs static (1.00x) pricing, both through the same demand model.
 * This is a fair apples-to-apples comparison — same model, different pricing strategy.
 */
export function computeBacktest(
  rows: RetailRow[],
  agent: QLearningAgent,
  env: PricingEnvironment,
): BacktestSummary {
  const staticActionIdx = ACTION_MULTIPLIERS.indexOf(1.00);
  const staticAction = staticActionIdx >= 0 ? staticActionIdx : 3;

  const backtestRows: BacktestRow[] = [];

  for (const row of rows) {
    const state = env.getState(row);
    const stateIndex = env.stateToIndex(state);
    const bestAction = agent.getBestAction(stateIndex);

    const rlSim = env.simulateAction(state, bestAction);
    const staticSim = env.simulateAction(state, staticAction);

    backtestRows.push({
      date: row.month_year,
      staticPrice: staticSim.price,
      rlPrice: rlSim.price,
      actualPrice: row.unit_price,
      staticRevenue: staticSim.revenue,
      rlRevenue: rlSim.revenue,
      staticMargin: staticSim.margin,
      rlMargin: rlSim.margin,
      rlAction: bestAction,
      state,
      qty: row.qty,
    });
  }

  let totalStaticRevenue = 0;
  let totalRlRevenue = 0;
  let totalStaticMargin = 0;
  let totalRlMargin = 0;
  let totalMultiplier = 0;

  for (const r of backtestRows) {
    totalStaticRevenue += r.staticRevenue;
    totalRlRevenue += r.rlRevenue;
    totalStaticMargin += r.staticMargin;
    totalRlMargin += r.rlMargin;
    totalMultiplier += ACTION_MULTIPLIERS[r.rlAction];
  }

  const revenueLift = totalStaticRevenue > 0
    ? ((totalRlRevenue - totalStaticRevenue) / totalStaticRevenue) * 100
    : 0;
  const marginLift = totalStaticMargin > 0
    ? ((totalRlMargin - totalStaticMargin) / totalStaticMargin) * 100
    : 0;
  const avgPriceChange = backtestRows.length > 0
    ? totalMultiplier / backtestRows.length
    : 1;

  // Monthly aggregation
  const monthMap = new Map<string, {
    staticRevenue: number; rlRevenue: number;
    staticMargin: number; rlMargin: number;
    actualPriceSum: number; rlPriceSum: number;
    count: number;
  }>();

  for (const r of backtestRows) {
    if (!monthMap.has(r.date)) {
      monthMap.set(r.date, {
        staticRevenue: 0, rlRevenue: 0,
        staticMargin: 0, rlMargin: 0,
        actualPriceSum: 0, rlPriceSum: 0,
        count: 0,
      });
    }
    const m = monthMap.get(r.date)!;
    m.staticRevenue += r.staticRevenue;
    m.rlRevenue += r.rlRevenue;
    m.staticMargin += r.staticMargin;
    m.rlMargin += r.rlMargin;
    m.actualPriceSum += r.actualPrice;
    m.rlPriceSum += r.rlPrice;
    m.count++;
  }

  const sortedMonths = [...monthMap.entries()].sort(([a], [b]) => compareMonthYear(a, b));
  let cumStatic = 0;
  let cumRl = 0;
  const monthly: MonthlyAggregate[] = sortedMonths.map(([date, m]) => {
    cumStatic += m.staticRevenue;
    cumRl += m.rlRevenue;
    return {
      date,
      staticRevenue: m.staticRevenue,
      rlRevenue: m.rlRevenue,
      staticMargin: m.staticMargin,
      rlMargin: m.rlMargin,
      avgActualPrice: m.actualPriceSum / m.count,
      avgRlPrice: m.rlPriceSum / m.count,
      count: m.count,
      cumulativeStaticRevenue: cumStatic,
      cumulativeRlRevenue: cumRl,
      cumulativeGap: cumRl - cumStatic,
    };
  });

  const hasActualPrices = backtestRows.some(r => r.actualPrice > 0);

  return {
    rows: backtestRows,
    totalStaticRevenue,
    totalRlRevenue,
    totalStaticMargin,
    totalRlMargin,
    revenueLift,
    marginLift,
    avgPriceChange,
    monthly,
    hasActualPrices,
  };
}
