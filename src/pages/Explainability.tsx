import { useState, useMemo, useEffect } from 'react';
import {
  Typography, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';
import { WaterfallChart } from '../components/WaterfallChart';
import { DataLineage } from '../components/DataLineage';
import { PricingEnvironment } from '../engine/environment';
import { QLearningAgent } from '../engine/q-learning';
import { computeShapleyValues } from '../engine/explainer';
import type { State } from '../types/rl';

export function Explainability() {
  const { rows, products, isLoaded } = useCsvData();
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [agent, setAgent] = useState<QLearningAgent | null>(null);
  const [env, setEnv] = useState<PricingEnvironment | null>(null);
  const [demandBin, setDemandBin] = useState(3);
  const [compBin, setCompBin] = useState(4);
  const [seasonBin, setSeasonBin] = useState(2);
  const [lagBin, setLagBin] = useState(2);

  useEffect(() => {
    if (isLoaded && products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0].id);
    }
  }, [isLoaded, products, selectedProduct]);

  // Train agent
  useEffect(() => {
    if (!selectedProduct || !isLoaded) return;
    const productRows = rows.filter(r => r.product_id === selectedProduct);
    if (productRows.length === 0) return;

    const weights = { revenue: 0.4, margin: 0.4, volume: 0.2 };
    const newEnv = new PricingEnvironment({ productRows, weights });
    const newAgent = new QLearningAgent({ episodes: 300 });
    for (let ep = 0; ep < 300; ep++) {
      newAgent.runEpisode(newEnv);
    }
    setEnv(newEnv);
    setAgent(newAgent);
  }, [selectedProduct, isLoaded, rows]);

  const state: State = useMemo(() => ({
    demandBin,
    competitorPriceBin: compBin,
    seasonBin,
    lagPriceBin: lagBin,
  }), [demandBin, compBin, seasonBin, lagBin]);

  const shapResult = useMemo(() => {
    if (!agent || !env) return null;
    return computeShapleyValues(state, agent, env);
  }, [agent, env, state]);

  // Generate plain-English explanation
  const explanation = useMemo(() => {
    if (!shapResult) return '';
    const sorted = [...shapResult.shapValues].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const parts = sorted.map(sv => {
      const direction = sv.value >= 0 ? 'increases' : 'decreases';
      return `**${sv.label}** ${direction} the price by $${Math.abs(sv.value).toFixed(2)}`;
    });
    return `Starting from a baseline price of **$${shapResult.basePrice.toFixed(2)}**, ${parts.join(', ')}, resulting in a recommended price of **$${shapResult.finalPrice.toFixed(2)}**.`;
  }, [shapResult]);

  if (!isLoaded) {
    return (
      <div className="p-6">
        <Typography variant="heading-lg">Explainability</Typography>
        <Typography variant="body-md" className="mt-4" style={{ color: 'var(--color-secondary)' }}>
          Please load data in the Data Explorer tab first.
        </Typography>
      </div>
    );
  }

  const demandLabels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  const compLabels = ['Much Lower', 'Lower', 'Similar', 'Higher', 'Much Higher'];
  const seasonLabels = ['Winter', 'Spring', 'Summer', 'Fall'];
  const lagLabels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Typography variant="heading-lg">Explainability</Typography>
        <Badge variant="primary">Exact Shapley Values (2⁴ = 16 coalitions)</Badge>
      </div>

      <Typography variant="body-md" style={{ color: 'var(--color-secondary)' }}>
        Understand why the agent recommends a specific price. Shapley values decompose the contribution
        of each market feature to the final pricing decision.
      </Typography>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-56">
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

        <div>
          <Typography variant="label-sm" className="mb-1">Demand: {demandLabels[demandBin]}</Typography>
          <input type="range" min={0} max={4} step={1} value={demandBin}
            onChange={e => setDemandBin(Number(e.target.value))} className="w-32" />
        </div>

        <div>
          <Typography variant="label-sm" className="mb-1">Competitor: {compLabels[compBin]}</Typography>
          <input type="range" min={0} max={4} step={1} value={compBin}
            onChange={e => setCompBin(Number(e.target.value))} className="w-32" />
        </div>

        <div>
          <Typography variant="label-sm" className="mb-1">Season: {seasonLabels[seasonBin]}</Typography>
          <input type="range" min={0} max={3} step={1} value={seasonBin}
            onChange={e => setSeasonBin(Number(e.target.value))} className="w-32" />
        </div>

        <div>
          <Typography variant="label-sm" className="mb-1">Hist. Price: {lagLabels[lagBin]}</Typography>
          <input type="range" min={0} max={4} step={1} value={lagBin}
            onChange={e => setLagBin(Number(e.target.value))} className="w-32" />
        </div>
      </div>

      {/* SHAP Waterfall */}
      {shapResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-gray)' }}>
            <WaterfallChart
              shapValues={shapResult.shapValues}
              basePrice={shapResult.basePrice}
              finalPrice={shapResult.finalPrice}
            />
          </div>

          {/* Decision Breakdown */}
          <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: 'var(--color-gray)' }}>
            <Typography variant="heading-sm">Decision Breakdown</Typography>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
              {explanation.split('**').map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
              )}
            </Typography>

            <div className="space-y-2 mt-4">
              {shapResult.shapValues
                .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                .map(sv => (
                  <div key={sv.feature} className="flex items-center justify-between">
                    <Typography variant="label-sm">{sv.label}</Typography>
                    <Badge variant={sv.value >= 0 ? 'success' : 'error'}>
                      {sv.value >= 0 ? '+' : ''}{sv.value.toFixed(2)}
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Data Lineage */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-gray)' }}>
        <DataLineage />
      </div>
    </div>
  );
}
