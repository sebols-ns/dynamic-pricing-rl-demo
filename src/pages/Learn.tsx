import { useState } from 'react';
import {
  Typography, Button, Badge,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@northslopetech/altitude-ui';

function Term({ term, definition }: { term: string; definition: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted cursor-help font-medium" style={{ color: 'var(--color-interactive)' }}>
            {term}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs text-sm">{definition}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tryItTab?: string;
  onNavigate?: (tab: string) => void;
  badge?: string;
}

function Section({ title, children, defaultOpen = false, tryItTab, onNavigate, badge }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--color-gray)' }}>
      <button
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center" style={{ gap: '8px' }}>
          <Typography variant="heading-sm">{title}</Typography>
          {badge && <Badge variant="neutral">{badge}</Badge>}
        </div>
        <span className="text-lg">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {children}
          {tryItTab && onNavigate && (
            <Button variant="link" onClick={() => onNavigate(tryItTab)} className="mt-2">
              Try it →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface LearnProps {
  onNavigate?: (tab: string) => void;
}

export function Learn({ onNavigate }: LearnProps) {
  return (
    <div className="p-6 space-y-4">
      <Typography variant="heading-lg">Learn</Typography>
      <Typography variant="body-md" style={{ color: 'var(--color-secondary)' }}>
        A comprehensive guide to this dynamic pricing demo — from the data and RL algorithm to
        explainability and production considerations. Hover over highlighted terms for quick definitions.
      </Typography>

      {/* ---- Project Overview ---- */}
      <Section title="Project Overview" defaultOpen>
        <Typography variant="body-sm">
          This application demonstrates <Term term="Reinforcement Learning (RL)" definition="A type of machine learning where an agent learns by interacting with an environment, receiving rewards for good actions and penalties for bad ones." /> applied
          to retail price optimization. An RL agent learns to set per-product prices that maximize
          a weighted combination of revenue, margin, and sales volume — adapting to market conditions
          like demand level, competitor pricing, and seasonality.
        </Typography>
        <Typography variant="body-sm">
          The demo has four interactive tabs:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li"><strong>Data Explorer</strong> — load and visualise the retail dataset</Typography>
          <Typography variant="body-sm" as="li"><strong>RL Training</strong> — train a Q-learning agent and watch it learn in real-time</Typography>
          <Typography variant="body-sm" as="li"><strong>Pricing Lab</strong> — compare the agent's recommendations against static and random baselines</Typography>
          <Typography variant="body-sm" as="li"><strong>Explainability</strong> — decompose pricing decisions with Shapley values</Typography>
        </ul>
        <Typography variant="body-sm">
          Built by <strong>Northslope Technologies</strong> to demonstrate how data-driven pricing can be
          powered by RL, with a clear path from proof-of-concept to production via platforms like Palantir Foundry.
        </Typography>
      </Section>

      {/* ---- The Dataset ---- */}
      <Section title="The Dataset" badge="Kaggle" onNavigate={onNavigate} tryItTab="data">
        <Typography variant="body-sm">
          The sample data comes from the <strong>Kaggle Retail Price Optimization</strong> dataset (CC0 Public Domain,
          by Suddharshan S). It contains <strong>607 rows</strong> of monthly product-level data from a Brazilian
          e-commerce platform, covering 19 products across multiple categories.
        </Typography>
        <Typography variant="body-sm">
          Each row represents a product's performance in a given month. Key columns used by the RL agent:
        </Typography>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
          {[
            ['qty', 'Units sold (demand signal)'],
            ['unit_price', 'Average selling price'],
            ['freight_price', 'Shipping cost (cost proxy)'],
            ['comp_1 / comp_2 / comp_3', 'Competitor prices'],
            ['lag_price', 'Previous period price'],
            ['month', 'Month of year (seasonality)'],
            ['product_score', 'Customer review score'],
            ['customers', 'Number of unique buyers'],
          ].map(([col, desc]) => (
            <Typography key={col} variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>{col}</code> — {desc}
            </Typography>
          ))}
        </div>
        <Typography variant="body-sm">
          Additional columns include product dimensions (<code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>product_weight_g</code>,
          <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}> volume</code>),
          time features (<code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>weekend</code>,
          <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}> holiday</code>),
          and competitor product scores (<code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>ps1/ps2/ps3</code>).
        </Typography>
      </Section>

      {/* ---- Data Pipeline ---- */}
      <Section title="Data Pipeline" badge="CSV → State → Q-Table → Price" onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          Raw CSV data flows through a multi-stage pipeline before reaching the RL agent:
        </Typography>
        <ol className="list-decimal list-inside space-y-2">
          <Typography variant="body-sm" as="li">
            <strong>Feature Extraction</strong> — The agent uses 4 key features: demand level (from <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>qty</code>),
            competitor price ratio (from <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>comp_1</code>),
            seasonality (from <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>month</code>),
            and historical price (from <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>lag_price</code>).
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>State Discretization</strong> — Continuous values are binned into discrete categories using quantile thresholds:
            demand (3 bins: low/medium/high), competitor price (3 bins), season (4 bins: winter/spring/summer/fall),
            historical price (3 bins). This creates <strong>3 × 3 × 4 × 3 = 108 unique states</strong>.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Q-Learning</strong> — The agent maintains a table of 108 states × 12 actions = <strong>1,296 Q-values</strong>,
            each representing the expected reward of choosing a particular price multiplier in a given market condition.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Pricing Decision</strong> — For any new observation, the pipeline discretizes the features into a state,
            looks up the best action (highest Q-value), and applies the corresponding price multiplier to the base price.
          </Typography>
        </ol>
        <Typography variant="body-sm">
          In production, a platform like <strong>Palantir Foundry</strong> would serve as the data integration layer —
          connecting live transactional feeds, competitor price scrapes, and market signals into the feature pipeline in real-time,
          replacing the static CSV with a continuously updating data mesh.
        </Typography>
      </Section>

      {/* ---- Q-Learning ---- */}
      <Section title="Q-Learning Algorithm" badge="108 states × 12 actions" onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          <Term term="Q-Learning" definition="A model-free RL algorithm that learns Q(s,a) — the expected reward of taking action a in state s, then following the optimal policy." /> is
          a model-free RL algorithm. It maintains a <Term term="Q-table" definition="A lookup table mapping every (state, action) pair to its expected reward. Updated incrementally during training." /> of
          expected rewards and updates them using the Bellman equation:
        </Typography>
        <Typography variant="body-sm">
          <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
            Q(s,a) ← Q(s,a) + α · [r + γ · max Q(s',a') − Q(s,a)]
          </code>
        </Typography>
        <Typography variant="body-sm">
          Key hyperparameters in this demo:
        </Typography>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
          {[
            ['α = 0.2 (learning rate)', 'How fast Q-values update with new experience'],
            ['γ = 0.0 (discount factor)', 'Zero — each pricing decision is independent (contextual bandit)'],
            ['ε: 1.0 → 0.01 (exploration)', 'Decays at 0.997× per episode — starts exploring, ends exploiting'],
            ['200 steps/episode', 'Each episode simulates 200 pricing decisions across different market states'],
            ['5,000 max episodes', 'Up to 1M total pricing decisions, with early stopping if converged'],
          ].map(([param, desc]) => (
            <Typography key={param} variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              <strong>{param}</strong> — {desc}
            </Typography>
          ))}
        </div>
        <Typography variant="body-sm">
          The Q-table initializes at zero. The agent starts fully random (ε = 1.0) and gradually shifts to
          exploitation as ε decays. Early stopping triggers when the rolling average reward hasn't improved
          for 300 episodes after ε falls below 0.05, typically converging around 1,500–2,000 episodes.
        </Typography>
      </Section>

      {/* ---- Demand Model Modes ---- */}
      <Section title="Simple vs Advanced Demand Models" badge="Key Decision">
        <Typography variant="body-sm">
          The demand model is the most important component in this pipeline — it defines the environment
          the RL agent trains against. A bad demand model means the agent optimises for a fictional market.
          The demo offers two approaches:
        </Typography>
        <ul className="list-disc list-inside space-y-2">
          <Typography variant="body-sm" as="li">
            <strong>Simple (Log-Linear)</strong> — A hand-coded elasticity formula: <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>Q = Q₀ × exp(−ε × ΔP/P₀)</code>.
            Fast, interpretable, and requires no training. But it makes strong assumptions: demand always decreases
            smoothly with price, the same curve shape applies everywhere, and there are no feature interactions.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Advanced (Gradient Boosted Trees)</strong> — A machine learning model trained directly on the dataset.
            It learns non-linear relationships between price, competitor pricing, seasonality, and other features to
            predict demand. More accurate but requires training time. Available for the Retail Price dataset.
          </Typography>
        </ul>
        <Typography variant="body-sm">
          The Store Inventory dataset includes a pre-computed <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>demand_forecast</code> column,
          so GBT training is not needed — the RL agent uses the dataset's own predictions as the demand baseline.
        </Typography>
      </Section>

      {/* ---- GBT Deep Dive ---- */}
      <Section title="How the GBT Demand Model Works" badge="LightGBM-style" onNavigate={onNavigate} tryItTab="demand-model">
        <Typography variant="body-sm">
          <Term term="Gradient Boosted Trees (GBT)" definition="An ensemble method that builds decision trees sequentially. Each new tree corrects the errors of previous trees, gradually improving prediction accuracy." /> is
          the same algorithm family behind <strong>LightGBM</strong>, <strong>XGBoost</strong>, and <strong>CatBoost</strong> —
          the most widely used ML models in industry for tabular data. Here's how our implementation works:
        </Typography>
        <Typography variant="heading-xs" style={{ marginTop: '8px' }}>Training process</Typography>
        <ol className="list-decimal list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>Start with the mean</strong> — The initial prediction for every row is simply the average quantity sold
            across the entire dataset. This is the "intercept".
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Compute residuals</strong> — For each row, calculate the error: <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>residual = actual − predicted</code>.
            These residuals are what the next tree will try to predict.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Build a decision tree on residuals</strong> — The tree finds the best feature and split point at each node
            to partition rows into groups with similar residuals. Uses histogram-based split finding (64 quantile bins per feature)
            for speed.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Update predictions</strong> — Add the tree's predictions (scaled by the learning rate) to the running total:
            <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>pred += 0.1 × tree(x)</code>
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Repeat</strong> — Each new tree corrects the remaining errors. After 2,000 trees, the ensemble captures
            complex non-linear patterns.
          </Typography>
        </ol>
        <Typography variant="heading-xs" style={{ marginTop: '8px' }}>Features used (10 total)</Typography>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
          {[
            ['unit_price', 'The price being charged — the key lever'],
            ['comp_1', 'Competitor price — market positioning'],
            ['month', 'Month of year — captures seasonality'],
            ['lag_price', 'Previous period price — price momentum'],
            ['holiday', 'Binary holiday flag — demand spikes'],
            ['product_score', 'Customer review score — quality signal'],
            ['freight_price', 'Shipping cost — cost proxy'],
            ['category', 'Product category (hash-encoded) — category-level demand'],
            ['discount', 'Discount applied — promotional effects'],
          ].map(([feat, desc]) => (
            <Typography key={feat} variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              <code style={{ background: 'var(--color-gray)', padding: '1px 4px', borderRadius: '3px' }}>{feat}</code> — {desc}
            </Typography>
          ))}
        </div>
        <Typography variant="heading-xs" style={{ marginTop: '8px' }}>Why GBT beats the formula</Typography>
        <Typography variant="body-sm">
          The log-linear model produces one smooth demand curve regardless of conditions. GBT learns <strong>different
          curves for different contexts</strong> — demand may respond differently to price in summer vs. winter, or when
          competitors are cheap vs. expensive. These non-linear interactions and context-dependent kinks are visible
          in the <strong>Elasticity Explorer</strong> chart.
        </Typography>
        <Typography variant="body-sm">
          This matters because the RL agent is only as good as its environment. If the demand model says "raising price
          always drops demand by the same amount", the agent learns a one-size-fits-all strategy. If the demand model
          captures that demand is price-insensitive in summer but elastic in winter, the agent learns to price higher
          in summer — which is the whole point of dynamic pricing.
        </Typography>
        <Typography variant="heading-xs" style={{ marginTop: '8px' }}>Hyperparameters</Typography>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
          {[
            ['2,000 trees', 'Enough for convergence on this dataset size'],
            ['Max depth = 5', 'Limits individual tree complexity to prevent overfitting'],
            ['Min samples per leaf = 20', 'Ensures each leaf has enough data to be meaningful'],
            ['Learning rate = 0.1', 'Each tree contributes 10% of its prediction — slower learning, better generalisation'],
            ['Subsample rate = 0.8', 'Each tree sees 80% of data — adds randomness, reduces overfitting'],
            ['64 histogram bins', 'Quantile-based binning for fast O(n) split finding'],
          ].map(([param, desc]) => (
            <Typography key={param} variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              <strong>{param}</strong> — {desc}
            </Typography>
          ))}
        </div>
      </Section>

      {/* ---- Demand Model ---- */}
      <Section title="Demand & Elasticity Model" badge="State-Dependent">
        <Typography variant="body-sm">
          The environment simulates market response using a <Term term="log-linear demand model" definition="Quantity demanded decreases exponentially with price: Q = Q₀ · exp(−ε · ΔP/P₀), where ε is price elasticity." />:
        </Typography>
        <Typography variant="body-sm">
          <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
            Q = Q₀ × exp(−ε × (P − P₀) / P₀)
          </code>
        </Typography>
        <Typography variant="body-sm">
          Where <strong>ε</strong> is the <Term term="price elasticity" definition="How sensitive demand is to price changes. ε > 1 means elastic (demand drops fast with price increases). ε < 1 means inelastic (customers tolerate higher prices)." />,
          which varies by market state. This is the key to the RL agent learning different strategies for different conditions:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>Low demand + cheap competitors + winter</strong> → very elastic (ε ≈ 2–3) → agent learns to price conservatively (0.80–1.00×)
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Medium conditions</strong> → moderate elasticity (ε ≈ 0.7–1.3) → agent prices at 1.10–1.30×
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>High demand + expensive competitors + summer</strong> → very inelastic (ε ≈ 0.2–0.4) → agent charges premium (1.50–1.60×)
          </Typography>
        </ul>
        <Typography variant="body-sm">
          The revenue-optimal price multiplier is approximately <strong>1/ε</strong>. Because ε varies across states,
          the Q-table learns a different pricing strategy for each market condition — this is the core advantage
          of RL over static pricing rules.
        </Typography>
      </Section>

      {/* ---- Exploration vs Exploitation ---- */}
      <Section title="Exploration vs. Exploitation" onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          The agent faces a fundamental dilemma: should it <Term term="explore" definition="Try random actions to discover potentially better strategies. Essential early in training." /> (try
          new prices) or <Term term="exploit" definition="Use the best known action (highest Q-value). Important once the agent has learned good strategies." /> (use
          what it knows)?
        </Typography>
        <Typography variant="body-sm">
          The <Term term="ε-greedy policy" definition="With probability ε, take a random action (explore). With probability 1-ε, take the best known action (exploit)." /> solves
          this by starting with high exploration (ε = 1.0) and gradually shifting to exploitation (ε → 0.01).
          With decay rate 0.997, the agent transitions through three phases:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li"><strong>Episodes 1–500</strong>: Mostly exploring (ε {'>'} 0.2). Tries many prices to map the reward landscape.</Typography>
          <Typography variant="body-sm" as="li"><strong>Episodes 500–1000</strong>: Transitioning. Increasingly favours learned strategies but still experiments.</Typography>
          <Typography variant="body-sm" as="li"><strong>Episodes 1000+</strong>: Exploiting (ε {'<'} 0.05). Locks in on the best-known price for each state.</Typography>
        </ul>
        <Typography variant="body-sm">
          Early stopping monitors the rolling average reward after the agent enters exploitation phase.
          If no improvement is seen for 300 consecutive episodes, training converges — typically around episode 1,500–2,000.
        </Typography>
      </Section>

      {/* ---- Reward Function ---- */}
      <Section title="Multi-Objective Reward" onNavigate={onNavigate} tryItTab="pricing-lab">
        <Typography variant="body-sm">
          Real-world pricing balances multiple competing objectives. The reward function combines three
          normalized metrics with configurable weights:
        </Typography>
        <Typography variant="body-sm">
          <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
            R = 0.4 × norm(revenue) + 0.4 × norm(margin) + 0.2 × min(1.0, norm(volume))
          </code>
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>Revenue (40%)</strong> — price × quantity. Rewards pricing that generates top-line income.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Margin (40%)</strong> — (price − cost) × quantity. Rewards profitable pricing above freight costs.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Volume (20%, capped)</strong> — units sold, capped at baseline. Penalizes losing customers but
            doesn't reward chasing volume through discounts.
          </Typography>
        </ul>
        <Typography variant="body-sm">
          Each metric is normalized to [0, 1] using precomputed ranges from the data, giving the agent a
          consistent reward gradient regardless of the product's absolute price level.
        </Typography>
      </Section>

      {/* ---- RL vs Static vs Random ---- */}
      <Section title="RL vs. Static vs. Random Pricing" onNavigate={onNavigate} tryItTab="pricing-lab">
        <Typography variant="body-sm">
          The Pricing Lab compares three strategies across market conditions:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>RL Agent</strong> — picks the optimal price multiplier (0.80× to 1.60×) for each specific state.
            Its advantage is <strong>adaptation</strong> — different conditions get different prices.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Static (1.00×)</strong> — always charges the base price. A reasonable default, but ignores market dynamics.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Random</strong> — uniformly random price multiplier. Represents the expected outcome of uninformed pricing.
          </Typography>
        </ul>
        <Typography variant="body-sm">
          For any <em>individual</em> state, static pricing may perform similarly to the RL agent — for example,
          when the optimal price happens to be near 1.00×. The RL agent's real advantage appears in the
          <strong> aggregate across all 108 states</strong>, where it consistently outperforms static pricing on both
          revenue and margin by adapting to each condition.
        </Typography>
      </Section>

      {/* ---- Explainability ---- */}
      <Section title="SHAP & Explainability" onNavigate={onNavigate} tryItTab="explainability">
        <Typography variant="body-sm">
          <Term term="Shapley values" definition="From cooperative game theory — fairly distribute a 'payout' (the pricing decision) among 'players' (features) based on their average marginal contribution across all possible feature orderings." /> provide
          a principled way to explain <em>why</em> the agent recommends a specific price. Each of the
          4 features receives a contribution value showing how it pushes the price above or below the baseline.
        </Typography>
        <Typography variant="body-sm">
          With 4 features, we compute <strong>exact</strong> Shapley values by evaluating all 2⁴ = 16
          feature coalitions. The value function uses a softmax-weighted expected price from the Q-table,
          which provides a continuous signal even when multiple states share the same argmax action.
        </Typography>
        <Typography variant="body-sm">
          The <strong>waterfall chart</strong> visualizes the decomposition: starting from a baseline price (median market conditions),
          each feature's contribution is shown as a positive (green) or negative (red) bar, summing exactly to the final
          recommended price. The <strong>data lineage</strong> diagram traces the full path from raw CSV columns through
          feature extraction and the Q-table to the pricing output.
        </Typography>
      </Section>

      {/* ---- Action Space ---- */}
      <Section title="Action Space: 12 Price Multipliers" badge="0.80× to 1.60×">
        <Typography variant="body-sm">
          The agent chooses from 12 discrete price multipliers applied to the product's base price:
        </Typography>
        <Typography variant="body-sm">
          <code className="text-sm px-2 py-1 rounded block" style={{ background: 'var(--color-gray)' }}>
            [0.80, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.30, 1.40, 1.50, 1.60]
          </code>
        </Typography>
        <Typography variant="body-sm">
          This range allows both discounting (down to 20% off) and premium pricing (up to 60% above base).
          The non-uniform spacing provides finer granularity near 1.00× where small changes matter most,
          and broader steps at the extremes. For a product with a base price of $60, this translates
          to a pricing range of $48 to $96.
        </Typography>
      </Section>

      {/* ---- Production Path ---- */}
      <Section title="From Demo to Production" badge="Foundry">
        <Typography variant="body-sm">
          This demo uses tabular Q-learning with 1,296 Q-values — ideal for understanding the principles.
          In production, several enhancements would be needed:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>Deep Q-Networks (DQN)</strong> — Replace the Q-table with a neural network to handle continuous,
            high-dimensional state spaces (hundreds of features, millions of products).
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Continuous actions</strong> — Instead of 12 discrete multipliers, use policy gradient methods
            (e.g., PPO, SAC) for continuous price optimization.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Real-time data integration</strong> — A platform like <strong>Palantir Foundry</strong> serves as the
            data mesh, connecting live transactional feeds, competitor price scrapes, inventory levels, and market
            signals into the feature pipeline. This replaces the static CSV with a continuously updating data source.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Safety constraints</strong> — Production systems need price floors/ceilings, rate-of-change limits,
            human-in-the-loop approval for large adjustments, and A/B testing frameworks.
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Multi-product interactions</strong> — Real retailers must consider cross-product elasticity,
            bundle pricing, and cannibalization effects.
          </Typography>
        </ul>
        <Typography variant="body-sm">
          The principles demonstrated here — state-dependent pricing, reward shaping, and Shapley explainability —
          extend directly to these production-scale systems.
        </Typography>
      </Section>

      {/* ---- Glossary ---- */}
      <Section title="Glossary">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {[
            ['Agent', 'The decision-maker that learns from experience — the pricing algorithm'],
            ['Environment', 'The simulated market with demand, competition, and seasonality'],
            ['State', 'A discretized snapshot of market conditions (108 possible states)'],
            ['Action', 'A price multiplier chosen from 12 options (0.80× to 1.60×)'],
            ['Reward', 'Weighted score of revenue + margin + volume after a pricing decision'],
            ['Q-value', 'Expected reward of taking an action in a given state'],
            ['Epsilon (ε)', 'Probability of random exploration; decays from 1.0 to 0.01'],
            ['Learning rate (α)', 'How quickly Q-values update; set to 0.2'],
            ['Discount factor (γ)', 'Weight on future rewards; set to 0.0 (contextual bandit)'],
            ['Elasticity (ε)', 'Price sensitivity of demand; varies 0.2–2.6 across states'],
            ['Shapley value', 'Each feature\'s fair contribution to the pricing decision'],
            ['Convergence', 'When the agent stops improving — early stopping detects this'],
          ].map(([term, def]) => (
            <Typography key={term} variant="body-xs" style={{ color: 'var(--color-secondary)' }}>
              <strong>{term}</strong> — {def}
            </Typography>
          ))}
        </div>
      </Section>
    </div>
  );
}
