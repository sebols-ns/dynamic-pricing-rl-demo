import { useState, useEffect, useMemo } from 'react';
import {
  Typography, Button, Badge,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
  LineChart, Line, Legend,
  BarChart as RechartsBarChart, Bar,
} from 'recharts';
import { useCsvData } from '../hooks/useCsvData';
import { useDemandModel } from '../hooks/useDemandModel';
import { useGbrtTraining } from '../hooks/useGbrtTraining';
import { TreeVisualization } from '../components/TreeVisualization';
import { mean } from '../utils/math';
import { generatePDP, FEATURE_NAMES, type PDPResult } from '../engine/gbrt';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

const PDP_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706'];

const SWEEP_OPTIONS = FEATURE_NAMES.filter(f => f !== 'category');
const CONDITION_OPTIONS = ['none', ...FEATURE_NAMES.filter(f => f !== 'category')];

const FEATURE_LABELS: Record<string, string> = {
  unit_price: 'Price',
  comp_1: 'Competitor Price',
  month: 'Month',
  lag_price: 'Lag Price',
  holiday: 'Holiday',
  weekday: 'Weekday',
  product_score: 'Product Score',
  freight_price: 'Freight',
  discount: 'Discount',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid var(--color-subtle)',
  fontSize: '12px',
  backgroundColor: 'var(--color-base-white)',
  cursor: 'pointer',
};

interface DemandModelProps {
  gbrtTraining: ReturnType<typeof useGbrtTraining>;
  onComplete?: () => void;
}

export function DemandModel({ gbrtTraining, onComplete }: DemandModelProps) {
  const { rows, products, isLoaded, datasetName } = useCsvData();
  const { mode, setMode } = useDemandModel();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [speed, setSpeed] = useState(10);
  const [pdpSweep, setPdpSweep] = useState('unit_price');
  const [pdpCondition, setPdpCondition] = useState('none');
  const [showOverfitExplainer, setShowOverfitExplainer] = useState(false);

  const isStoreInventory = datasetName === 'store_inventory';
  const gbtAvailable = !isStoreInventory;

  // Force back to simple when switching to a dataset that doesn't support GBT
  useEffect(() => {
    if (isStoreInventory && mode === 'advanced') {
      setMode('simple');
    }
  }, [isStoreInventory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize training when switching to advanced mode
  useEffect(() => {
    if (mode === 'advanced' && isLoaded && rows.length > 0) {
      gbrtTraining.initialize(rows);
    }
  }, [mode, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    gbrtTraining.setSpeed(speed);
  }, [speed, gbrtTraining]);

  // Default product selection
  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  // Simple mode auto-completes immediately
  useEffect(() => {
    if (mode === 'simple') {
      onComplete?.();
    }
  }, [mode, onComplete]);

  // Combined demand curve: GBT predictions + log-linear overlay for comparison
  const comparisonCurveData = useMemo(() => {
    if (!gbrtTraining.demandCurveData.length || rows.length === 0) return [];
    const basePrice = mean(rows.map(r => r.unit_price));
    const baseQty = mean(rows.map(r => r.qty));
    const elasticity = 0.7;

    return gbrtTraining.demandCurveData.map(pt => {
      const ratio = pt.price / basePrice;
      const logLinearQty = baseQty * Math.exp(-elasticity * (ratio - 1));
      return {
        price: pt.price,
        gbt: pt.qty,
        logLinear: Math.round(logLinearQty * 10) / 10,
      };
    });
  }, [gbrtTraining.demandCurveData, rows]);

  // Subsample scatter data for render performance
  const scatterData = useMemo(() => {
    if (!gbrtTraining.predictions || !gbrtTraining.actuals) return [];
    const preds = gbrtTraining.predictions;
    const actuals = gbrtTraining.actuals;
    const n = preds.length;
    const maxPoints = 2000;
    const step = n > maxPoints ? Math.floor(n / maxPoints) : 1;
    const points: { actual: number; predicted: number }[] = [];
    for (let i = 0; i < n; i += step) {
      points.push({
        actual: Math.round(actuals[i] * 10) / 10,
        predicted: Math.round(preds[i] * 10) / 10,
      });
    }
    return points;
  }, [gbrtTraining.predictions, gbrtTraining.actuals]);

  // Feature importance data for bar chart
  const featureImportanceData = useMemo(() => {
    if (gbrtTraining.featureImportance.length === 0) return [];
    return gbrtTraining.featureNames
      .map((name, i) => ({
        name,
        importance: Math.round(gbrtTraining.featureImportance[i] * 1000) / 10,
      }))
      .sort((a, b) => b.importance - a.importance);
  }, [gbrtTraining.featureImportance, gbrtTraining.featureNames]);

  // Interactive PDP data
  const pdpData: PDPResult | null = useMemo(() => {
    if (!gbrtTraining.model || gbrtTraining.model.trees.length === 0 || rows.length === 0) return null;
    return generatePDP(
      gbrtTraining.model,
      rows,
      pdpSweep,
      pdpCondition === 'none' ? null : pdpCondition,
    );
  }, [gbrtTraining.model, gbrtTraining.model?.trees.length, rows, pdpSweep, pdpCondition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flatten PDP lines into recharts-friendly format
  const pdpChartData = useMemo(() => {
    if (!pdpData || pdpData.lines.length === 0) return [];
    const firstLine = pdpData.lines[0];
    return firstLine.points.map((pt, i) => {
      const row: Record<string, number> = { x: pt.x };
      for (const line of pdpData.lines) {
        row[line.label] = line.points[i]?.y ?? 0;
      }
      return row;
    });
  }, [pdpData]);

  const progress = gbrtTraining.totalTrees > 0
    ? Math.round((gbrtTraining.currentTree / gbrtTraining.totalTrees) * 100)
    : 0;

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg">Demand Model</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginTop: '16px' }}>
          Please load data in the Data step first.
        </Typography>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 0' }}>
      <Typography variant="heading-lg" style={{ marginBottom: '8px' }}>Demand Model</Typography>
      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
        Choose how demand responds to price changes. This model powers the RL agent's environment.
      </Typography>

      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          <button
            onClick={() => { setMode('simple'); setShowOverfitExplainer(false); }}
            style={{
              padding: '10px 24px',
              borderRadius: gbtAvailable ? '8px 0 0 8px' : '8px',
              border: '1px solid var(--color-subtle)',
              borderRight: gbtAvailable ? 'none' : undefined,
              fontSize: '14px',
              fontWeight: mode === 'simple' ? 700 : 400,
              backgroundColor: mode === 'simple' ? 'var(--color-interactive)' : 'var(--color-base-white)',
              color: mode === 'simple' ? 'white' : 'var(--color-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isStoreInventory ? 'Dataset Forecast' : 'Simple (Log-Linear)'}
          </button>
          {gbtAvailable && (
            <button
              onClick={() => setMode('advanced')}
              style={{
                padding: '10px 24px',
                borderRadius: '0 8px 8px 0',
                border: '1px solid var(--color-subtle)',
                fontSize: '14px',
                fontWeight: mode === 'advanced' ? 700 : 400,
                backgroundColor: mode === 'advanced' ? 'var(--color-interactive)' : 'var(--color-base-white)',
                color: mode === 'advanced' ? 'white' : 'var(--color-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Advanced (Gradient Boosted Trees)
            </button>
          )}
        </div>
        {isStoreInventory && (
          <span style={{ fontSize: '12px', color: 'var(--color-secondary)' }}>
            This dataset includes a pre-computed demand forecast — GBT training is not needed.
          </span>
        )}
      </div>

      {/* Simple mode */}
      {mode === 'simple' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>
              {isStoreInventory ? 'Dataset Demand Forecast + Elasticity' : 'Log-Linear Elasticity Model'}
            </Typography>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
              {isStoreInventory
                ? 'This dataset includes a pre-computed demand forecast for each row. The RL agent uses this forecast as the base demand, then applies an elasticity formula to model how demand responds to price changes.'
                : 'Demand is simulated using a hand-coded elasticity formula. This is an assumption, not learned from data.'}
            </Typography>
            <Typography variant="body-sm">
              <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
                {isStoreInventory
                  ? 'Q = demand_forecast × exp(-elasticity × (P - P_base) / P_base)'
                  : 'Q = Q_base × exp(-elasticity × (P - P_base) / P_base)'}
              </code>
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginTop: '12px' }}>
              {isStoreInventory
                ? 'The demand forecast from the dataset provides a per-row baseline quantity. The elasticity formula then adjusts this based on the agent\'s pricing decisions. Elasticity varies by market state (competitor price, season, inventory level).'
                : 'Elasticity varies by market state (demand level, competitor price, season). Higher elasticity means customers are more price-sensitive. The base elasticity is 0.7, modulated by state-dependent factors ranging from 0.2 to 4.0.'}
            </Typography>
          </div>

          {/* Static demand curve visualization */}
          <div style={cardStyle}>
            <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
              Demand Response Curve (Illustrative)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={Array.from({ length: 20 }, (_, i) => {
                  const ratio = 0.5 + (i / 19) * 1.5;
                  const elasticity = 0.7;
                  const qty = 100 * Math.exp(-elasticity * (ratio - 1));
                  return { price: `${(ratio * 100).toFixed(0)}%`, qty: Math.round(qty) };
                })}
                margin={{ top: 8, right: 16, left: 8, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                <XAxis dataKey="price" tick={{ fontSize: 11 }} label={{ value: 'Price (% of base)', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'Predicted Qty', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="qty" stroke="var(--color-interactive)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Advanced mode */}
      {mode === 'advanced' && (
        <div>
          {/* Explainer */}
          <div style={{ ...cardStyle, backgroundColor: 'var(--color-info-subtle)', borderColor: 'var(--color-blue-200)', marginBottom: '24px' }}>
            <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>Gradient Boosted Trees (GBT)</Typography>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
              Builds decision trees iteratively, each correcting the errors of the previous ones. The model learns
              demand patterns directly from the data — including non-linear price sensitivity, seasonal effects,
              and feature interactions that a simple formula can't capture.
            </Typography>
            <div className="flex flex-wrap" style={{ gap: '8px', marginTop: '12px' }}>
              <Badge variant="neutral">{rows.length.toLocaleString()} rows</Badge>
              <Badge variant="neutral">10 features</Badge>
              <Badge variant="neutral">{gbrtTraining.totalTrees} trees</Badge>
              {gbrtTraining.trainSize > 0 && (
                <Badge variant="primary">{gbrtTraining.trainSize} train / {gbrtTraining.testSize} test (80/20 split)</Badge>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end" style={{ gap: '16px', marginBottom: '24px' }}>
            <div className="flex" style={{ gap: '8px' }}>
              {!gbrtTraining.isRunning ? (
                <Button onClick={gbrtTraining.play} disabled={gbrtTraining.isComplete}>
                  {gbrtTraining.currentTree === 0 ? 'Train' : 'Resume'}
                </Button>
              ) : (
                <Button onClick={gbrtTraining.pause} variant="outline">Pause</Button>
              )}
              <Button onClick={() => { gbrtTraining.reset(); setShowOverfitExplainer(false); }} variant="ghost">
                Reset
              </Button>
            </div>

            <div>
              <Typography variant="label-sm-bold" style={{ marginBottom: '6px' }}>Speed: {speed}x</Typography>
              <input
                type="range"
                min={1}
                max={10}
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                style={{ width: '120px' }}
              />
            </div>

            <div className="flex flex-wrap" style={{ gap: '6px' }}>
              {gbrtTraining.earlyStopped ? (
                <button
                  onClick={() => setShowOverfitExplainer(v => !v)}
                  style={{
                    padding: '4px 14px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: '#fbbf24',
                    color: '#78350f',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Early stopped at tree {gbrtTraining.currentTree}
                  <span style={{ fontSize: '11px' }}>{showOverfitExplainer ? '▲' : '▼'}</span>
                </button>
              ) : gbrtTraining.isComplete ? (
                <Badge variant="success">Complete</Badge>
              ) : null}
              {gbrtTraining.currentTree > 0 && (
                <>
                  <Badge variant="primary">Test R² = {gbrtTraining.testR2.toFixed(3)}</Badge>
                  <Badge variant="neutral">Train R² = {gbrtTraining.trainR2.toFixed(3)}</Badge>
                </>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {(gbrtTraining.isRunning || gbrtTraining.currentTree > 0) && (
            <div style={{ marginBottom: '24px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
                <Typography variant="label-sm-bold">
                  {gbrtTraining.isRunning ? 'Training...'
                    : gbrtTraining.earlyStopped ? 'Early stopped (test R² plateaued)'
                    : gbrtTraining.isComplete ? 'Complete'
                    : 'Paused'}
                </Typography>
                <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>
                  Tree {gbrtTraining.currentTree} / {gbrtTraining.totalTrees} ({progress}%)
                </Typography>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--color-neutral-200)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    borderRadius: '3px',
                    backgroundColor: gbrtTraining.earlyStopped ? '#fbbf24' : gbrtTraining.isComplete ? 'var(--color-success)' : 'var(--color-interactive)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Overfitting explainer — shown when early stopped button is clicked */}
          {showOverfitExplainer && gbrtTraining.earlyStopped && (
            <div style={{
              ...cardStyle,
              borderColor: '#fbbf24',
              borderWidth: '2px',
              marginBottom: '24px',
              padding: '28px',
            }}>
              <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>
                Why did training stop?
              </Typography>
              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
                The model <strong>overfit</strong> — it memorised the training data instead of learning generalisable
                patterns. You can see this in the chart below: training accuracy (grey) keeps climbing while
                test accuracy (green) peaks early and then declines. The model is fitting noise, not signal.
              </Typography>

              {/* Inline R² chart */}
              <div style={{ marginBottom: '20px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={gbrtTraining.r2History} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                    <XAxis dataKey="tree" tick={{ fontSize: 11 }} label={{ value: 'Trees', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => v.toFixed(2)}
                      label={{ value: 'R²', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }}
                    />
                    <RechartsTooltip formatter={((v: number) => v.toFixed(4)) as any} />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="train" name="Train R²" stroke="var(--color-neutral-400)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="test" name="Test R²" stroke="var(--color-success)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <Typography variant="heading-xs" style={{ marginBottom: '8px' }}>
                This is a data problem, not a model problem
              </Typography>
              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
                With only <strong>{rows.length} rows</strong>, there isn't enough data for a machine learning model to learn
                demand patterns that generalise to unseen conditions. The model has more capacity than the data can
                support — it finds patterns in the training set that are just noise.
              </Typography>
              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
                This is exactly why the <strong>data integration layer matters</strong>. With 600 rows, the fancy model
                can't help you. With 60,000 rows from a live data pipeline — connecting transactional feeds, competitor
                price scrapes, and market signals — the same GBT model would learn robust, generalisable demand curves
                that a hand-coded formula could never match.
              </Typography>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '20px',
              }}>
                <div style={{
                  padding: '14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-gray)',
                  textAlign: 'center',
                }}>
                  <Typography variant="heading-lg" style={{ marginBottom: '4px' }}>{rows.length}</Typography>
                  <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
                    rows in this dataset
                  </Typography>
                  <Typography variant="body-xs" style={{ color: '#dc2626', fontWeight: 600, marginTop: '4px' }}>
                    Not enough for ML
                  </Typography>
                </div>
                <div style={{
                  padding: '14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-gray)',
                  textAlign: 'center',
                }}>
                  <Typography variant="heading-lg" style={{ marginBottom: '4px' }}>60,000+</Typography>
                  <Typography variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
                    rows from a live pipeline
                  </Typography>
                  <Typography variant="body-xs" style={{ color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                    GBT shines here
                  </Typography>
                </div>
              </div>

              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
                For this demo, the <strong>log-linear model</strong> is the right choice — it doesn't need to learn from
                data because the elasticity formula is hand-coded. It works well on any dataset size and gives the RL
                agent a reasonable environment to train against.
              </Typography>

              <Button onClick={() => { setMode('simple'); setShowOverfitExplainer(false); }}>
                Use Log-Linear Model Instead
              </Button>
            </div>
          )}

          {/* Charts: 2-column grid */}
          {gbrtTraining.currentTree > 0 && !showOverfitExplainer && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '24px',
              marginBottom: '24px',
            }}>
              {/* Accuracy scatter: actual vs predicted */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                  <Typography variant="label-md-bold">Actual vs Predicted (Train Set)</Typography>
                  <Badge variant="primary">Train R² = {gbrtTraining.trainR2.toFixed(3)}</Badge>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                    <XAxis type="number" dataKey="actual" name="Actual" tick={{ fontSize: 11 }} label={{ value: 'Actual Qty', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis type="number" dataKey="predicted" name="Predicted" tick={{ fontSize: 11 }} label={{ value: 'Predicted Qty', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                    <RechartsTooltip />
                    <Scatter data={scatterData} fill="var(--color-interactive)" fillOpacity={0.3} r={2} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Demand curve comparison: GBT vs Log-Linear */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                  <Typography variant="label-md-bold">Demand Curve Comparison</Typography>
                </div>
                <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
                  GBT learned from data vs the hand-coded log-linear formula. Differences show where the simple model's assumptions break down.
                </Typography>
                <div className="flex items-center" style={{ gap: '16px', marginBottom: '8px', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 16, height: 3, backgroundColor: 'var(--color-interactive)', display: 'inline-block', borderRadius: 1 }} /> GBT Model
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 16, height: 3, backgroundColor: 'var(--color-neutral-400)', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed' }} /> Log-Linear
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={comparisonCurveData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                    <XAxis dataKey="price" tick={{ fontSize: 11 }} label={{ value: 'Price ($)', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: 'Predicted Qty', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="gbt" name="GBT Model" stroke="var(--color-interactive)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="logLinear" name="Log-Linear" stroke="var(--color-neutral-400)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* R² over time: train vs test */}
              <div style={cardStyle}>
                <Typography variant="label-md-bold" style={{ marginBottom: '4px' }}>R² Over Training</Typography>
                <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
                  Train vs test (holdout) accuracy. A growing gap between the lines indicates overfitting.
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={gbrtTraining.r2History} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                    <XAxis dataKey="tree" tick={{ fontSize: 11 }} label={{ value: 'Trees', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => v.toFixed(2)}
                      label={{ value: 'R²', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }}
                    />
                    <RechartsTooltip formatter={((v: number) => v.toFixed(4)) as any} />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="train" name="Train R²" stroke="var(--color-neutral-400)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="test" name="Test R²" stroke="var(--color-success)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Interactive Partial Dependence Plot */}
              {pdpData && pdpData.lines.length > 0 && (
                <div style={cardStyle}>
                  <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                    <Typography variant="label-md-bold">Elasticity Explorer</Typography>
                  </div>
                  <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginBottom: '12px' }}>
                    How predicted demand changes as you sweep one feature. Toggle conditions to compare elasticity across market states.
                  </Typography>
                  <div className="flex items-center flex-wrap" style={{ gap: '12px', marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Sweep:
                      <select
                        value={pdpSweep}
                        onChange={e => setPdpSweep(e.target.value)}
                        style={selectStyle}
                      >
                        {SWEEP_OPTIONS.map(f => (
                          <option key={f} value={f}>{FEATURE_LABELS[f] || f}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Compare by:
                      <select
                        value={pdpCondition}
                        onChange={e => setPdpCondition(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="none">None (single curve)</option>
                        {CONDITION_OPTIONS.filter(f => f !== 'none' && f !== pdpSweep).map(f => (
                          <option key={f} value={f}>{FEATURE_LABELS[f] || f}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={pdpChartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                      <XAxis
                        dataKey="x"
                        tick={{ fontSize: 11 }}
                        label={{ value: FEATURE_LABELS[pdpSweep] || pdpSweep, position: 'insideBottom', offset: -12, fontSize: 12 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Predicted Qty', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }}
                      />
                      <RechartsTooltip />
                      {pdpData.lines.length > 1 && (
                        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} />
                      )}
                      {pdpData.lines.map((line, i) => (
                        <Line
                          key={line.label}
                          type="monotone"
                          dataKey={line.label}
                          name={line.label}
                          stroke={PDP_COLORS[i % PDP_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Tree visualization */}
          {gbrtTraining.model && gbrtTraining.model.trees.length > 0 && !showOverfitExplainer && (
            <div style={{ ...cardStyle, marginBottom: '24px' }}>
              <Typography variant="label-md-bold" style={{ marginBottom: '8px' }}>
                Latest Decision Tree
              </Typography>
              <TreeVisualization
                tree={gbrtTraining.model.trees[gbrtTraining.model.trees.length - 1]}
                featureNames={gbrtTraining.featureNames}
                treeIndex={gbrtTraining.model.trees.length - 1}
              />
            </div>
          )}

          {/* Feature importance (full width) */}
          {featureImportanceData.length > 0 && !showOverfitExplainer && (
            <div style={cardStyle}>
              <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
                Feature Importance (Split Gain)
              </Typography>
              <ResponsiveContainer width="100%" height={Math.max(200, featureImportanceData.length * 32)}>
                <RechartsBarChart data={featureImportanceData} layout="vertical" margin={{ top: 8, right: 16, left: 100, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Importance (%)', position: 'insideBottom', offset: -4, fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <RechartsTooltip formatter={((v: number) => `${v.toFixed(1)}%`) as any} />
                  <Bar dataKey="importance" fill="var(--color-interactive)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
