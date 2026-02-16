# Dynamic Pricing RL Demo

Interactive reinforcement learning demo for retail price optimization. A Q-learning agent learns state-dependent pricing strategies from historical retail data, adapting to demand, competitor pricing, and seasonality.

**Live demo:** [sebols-ns.github.io/dynamic-pricing-rl-demo](https://sebols-ns.github.io/dynamic-pricing-rl-demo/)

Built by [Northslope Technologies](https://northslope.tech).

## What It Does

- **Data Explorer** — Load and visualise the Kaggle Retail Price Optimization dataset (607 rows, 19 products)
- **RL Training** — Train a tabular Q-learning agent in real-time with live reward and revenue charts
- **Pricing Lab** — Compare the RL agent against static (1.00x) and random baselines across market conditions
- **Explainability** — Decompose pricing decisions with exact Shapley values and a waterfall chart
- **Learn** — Comprehensive guide to the algorithm, data pipeline, and production considerations

## How It Works

The agent discretises market conditions into **108 states** (3 demand bins x 3 competitor bins x 4 seasons x 3 historical price bins) and chooses from **12 price multipliers** (0.80x to 1.60x). A state-dependent elasticity model ensures different conditions have different optimal prices:

| Market Condition | Elasticity | Agent Learns |
|---|---|---|
| Low demand, cheap competitors, winter | High (~2.0+) | Conservative pricing (0.80-1.00x) |
| Medium conditions | Moderate (~1.0) | Moderate premium (1.10-1.30x) |
| High demand, expensive competitors, summer | Low (~0.2) | Premium pricing (1.50-1.60x) |

The reward function combines normalised revenue (40%), margin (40%), and volume (20%, capped) to balance profitability with market share.

## Quick Start

```bash
git clone https://github.com/sebols-ns/dynamic-pricing-rl-demo.git
cd dynamic-pricing-rl-demo
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Requirements

- Node.js 18+
- npm 9+

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
  engine/
    environment.ts   # Pricing environment with state-dependent elasticity
    q-learning.ts    # Tabular Q-learning agent
    reward.ts        # Multi-objective reward function
    explainer.ts     # Exact Shapley value computation
  hooks/
    useCsvData.ts    # CSV data loading and parsing
    useRlTraining.ts # Training loop with early stopping
    useTrainedAgent.ts # Shared trained model context
  pages/
    DataExplorer.tsx # Data upload and visualisation
    RlTraining.tsx   # Training UI with live charts
    PricingLab.tsx   # What-if comparison tool
    Explainability.tsx # Shapley decomposition
    Learn.tsx        # Educational guide
  components/
    QTableHeatmap.tsx  # Q-table visualisation
    WaterfallChart.tsx # SHAP waterfall chart
    DataLineage.tsx    # Data flow diagram
    MetricCard.tsx     # KPI card component
  types/
    rl.ts            # RL types, constants, and hyperparameters
    data.ts          # Data types
  utils/
    math.ts          # Utility functions (quantile bins, argmax, etc.)
public/
  retail_price.csv   # Sample Kaggle dataset
```

## Tech Stack

- **React 19** + TypeScript
- **Vite** for bundling
- **Tailwind CSS** + [Altitude UI](https://www.npmjs.com/package/@northslopetech/altitude-ui) component library
- **Recharts** for data visualisation
- **PapaParse** for CSV parsing
- **TanStack Table** for data tables

## Data

Sample data from the [Kaggle Retail Price Optimization](https://www.kaggle.com/datasets/suddharshan/retail-price-optimization) dataset (CC0 Public Domain). You can also upload your own CSV with matching columns.

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the workflow in `.github/workflows/deploy.yml`.

To deploy your own fork:
1. Fork this repo
2. Go to Settings > Pages > Source > select "GitHub Actions"
3. Push to `main` — the site will build and deploy automatically

## Licence

MIT
