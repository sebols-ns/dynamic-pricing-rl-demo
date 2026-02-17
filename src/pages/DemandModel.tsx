import { useState, useEffect, useMemo } from 'react';
import {
  Typography, Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
  LineChart, Line,
  BarChart as RechartsBarChart, Bar,
} from 'recharts';
import { useCsvData } from '../hooks/useCsvData';
import { useDemandModel } from '../hooks/useDemandModel';
import { useGbrtTraining } from '../hooks/useGbrtTraining';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: 'var(--color-base-white)',
};

interface DemandModelProps {
  gbrtTraining: ReturnType<typeof useGbrtTraining>;
  onComplete?: () => void;
}

export function DemandModel({ gbrtTraining, onComplete }: DemandModelProps) {
  const { rows, products, isLoaded } = useCsvData();
  const { mode, setMode } = useDemandModel();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [speed, setSpeed] = useState(1);
  const [showTransition, setShowTransition] = useState(false);

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

  // Generate product-specific demand curve
  const productDemandCurve = useMemo(() => {
    if (!gbrtTraining.model || !selectedProduct) return gbrtTraining.demandCurveData;
    // Use the general demand curve data (based on all rows) as default
    return gbrtTraining.demandCurveData;
  }, [gbrtTraining.model, gbrtTraining.demandCurveData, selectedProduct]);

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

  // Trigger completion callback
  useEffect(() => {
    if (gbrtTraining.isComplete && mode === 'advanced') {
      setShowTransition(true);
      const timer = setTimeout(() => {
        setShowTransition(false);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gbrtTraining.isComplete, mode, onComplete]);

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
      <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
        <button
          onClick={() => setMode('simple')}
          style={{
            padding: '10px 24px',
            borderRadius: '8px 0 0 8px',
            border: '1px solid var(--color-subtle)',
            borderRight: 'none',
            fontSize: '14px',
            fontWeight: mode === 'simple' ? 700 : 400,
            backgroundColor: mode === 'simple' ? 'var(--color-interactive)' : 'var(--color-base-white)',
            color: mode === 'simple' ? 'white' : 'var(--color-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Simple (Log-Linear)
        </button>
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
      </div>

      {/* Simple mode */}
      {mode === 'simple' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <Typography variant="heading-sm" style={{ marginBottom: '12px' }}>Log-Linear Elasticity Model</Typography>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
              Demand is simulated using a hand-coded elasticity formula. This is an assumption, not learned from data.
            </Typography>
            <Typography variant="body-sm">
              <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
                Q = Q_base x exp(-elasticity x (P - P_base) / P_base)
              </code>
            </Typography>
            <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginTop: '12px' }}>
              Elasticity varies by market state (demand level, competitor price, season). Higher elasticity means
              customers are more price-sensitive. The base elasticity is 0.7, modulated by state-dependent factors
              ranging from 0.2 to 4.0.
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
            <div className="flex" style={{ gap: '8px', marginTop: '12px' }}>
              <Badge variant="neutral">{rows.length.toLocaleString()} rows</Badge>
              <Badge variant="neutral">10 features</Badge>
              <Badge variant="neutral">{gbrtTraining.totalTrees} trees</Badge>
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
              <Button onClick={gbrtTraining.stepOnce} variant="outline" disabled={gbrtTraining.isRunning || gbrtTraining.isComplete}>
                Step
              </Button>
              <Button onClick={gbrtTraining.reset} variant="ghost">
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

            <div>
              {gbrtTraining.isComplete ? (
                <Badge variant="success">Training Complete (R² = {gbrtTraining.trainR2.toFixed(3)})</Badge>
              ) : gbrtTraining.currentTree > 0 ? (
                <Badge variant="primary">R² = {gbrtTraining.trainR2.toFixed(3)}</Badge>
              ) : null}
            </div>
          </div>

          {/* Progress Bar */}
          {(gbrtTraining.isRunning || gbrtTraining.currentTree > 0) && (
            <div style={{ marginBottom: '24px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
                <Typography variant="label-sm-bold">
                  {gbrtTraining.isRunning ? 'Training...' : gbrtTraining.isComplete ? 'Complete' : 'Paused'}
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
                    backgroundColor: gbrtTraining.isComplete ? 'var(--color-success)' : 'var(--color-interactive)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Transition message */}
          {showTransition && (
            <div style={{
              ...cardStyle,
              backgroundColor: 'var(--color-success-subtle)',
              borderColor: 'var(--color-green-200)',
              textAlign: 'center',
              padding: '24px',
              marginBottom: '24px',
            }}>
              <Typography variant="heading-sm">Demand model ready</Typography>
              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginTop: '4px' }}>
                Now training pricing agent with the learned demand model...
              </Typography>
            </div>
          )}

          {/* Charts: 2-column grid */}
          {gbrtTraining.currentTree > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '24px',
              marginBottom: '24px',
            }}>
              {/* Accuracy scatter: actual vs predicted */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                  <Typography variant="label-md-bold">Actual vs Predicted Qty</Typography>
                  <Badge variant="primary">R² = {gbrtTraining.trainR2.toFixed(3)}</Badge>
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

              {/* Demand curve */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                  <Typography variant="label-md-bold">Learned Demand Curve</Typography>
                  {products.length > 0 && (
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger width="fit">
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.slice(0, 20).map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={productDemandCurve} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" />
                    <XAxis dataKey="price" tick={{ fontSize: 11 }} label={{ value: 'Price ($)', position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: 'Predicted Qty', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="qty" stroke="var(--color-interactive)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Feature importance (full width) */}
          {featureImportanceData.length > 0 && (
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
