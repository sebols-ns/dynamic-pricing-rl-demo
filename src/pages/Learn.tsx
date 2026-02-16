import { useState } from 'react';
import {
  Typography, Button,
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
}

function Section({ title, children, defaultOpen = false, tryItTab, onNavigate }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--color-gray)' }}>
      <button
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Typography variant="heading-sm">{title}</Typography>
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
        Understand the core concepts behind reinforcement learning for dynamic pricing.
        Hover over highlighted terms for quick definitions.
      </Typography>

      <Section title="What is Reinforcement Learning?" defaultOpen onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          <Term term="Reinforcement Learning (RL)" definition="A type of machine learning where an agent learns by interacting with an environment, receiving rewards for good actions and penalties for bad ones." /> is
          a paradigm where an <Term term="agent" definition="The decision-maker that learns from experience — in our case, the pricing algorithm." /> learns
          to make decisions by interacting with an <Term term="environment" definition="The world the agent operates in. Here, it's the market with demand, competition, and seasonality." />.
          Unlike supervised learning (which needs labeled examples), RL learns from <Term term="rewards" definition="Numerical feedback signals that tell the agent how good its action was." /> —
          trial and error. The agent's goal is to maximize cumulative reward over time.
        </Typography>
        <Typography variant="body-sm">
          In dynamic pricing, the agent observes market conditions (demand, competitor prices, season) and
          decides what price to set. It receives feedback based on revenue, margin, and sales volume.
        </Typography>
      </Section>

      <Section title="Q-Learning Explained" onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          <Term term="Q-Learning" definition="A model-free RL algorithm that learns Q(s,a) — the expected cumulative reward of taking action a in state s, then following the optimal policy." /> is
          one of the simplest and most intuitive RL algorithms. It maintains a table of
          <Term term="Q-values" definition="Q(s,a) estimates how good it is to take action a in state s. Higher Q-values mean better expected outcomes." />,
          one for each state-action pair.
        </Typography>
        <Typography variant="body-sm">
          The update rule is: <code className="text-sm px-1 py-0.5 rounded" style={{ background: 'var(--color-gray)' }}>
          Q(s,a) ← Q(s,a) + α [r + γ max Q(s',a') - Q(s,a)]</code>
        </Typography>
        <Typography variant="body-sm">
          Where <Term term="α (learning rate)" definition="Controls how much new information overrides old. α=0.1 means 10% update per step." /> controls
          learning speed, <Term term="γ (discount factor)" definition="How much the agent cares about future rewards vs immediate rewards. γ=0.95 means future rewards are nearly as valuable." /> balances
          immediate vs. future rewards, and <strong>r</strong> is the reward received.
        </Typography>
        <Typography variant="body-sm">
          In this demo, the Q-table has <strong>500 states × 10 actions = 5,000 entries</strong>. Each state encodes
          demand level (5 bins), competitor price (5 bins), season (4 bins), and historical price (5 bins).
        </Typography>
      </Section>

      <Section title="Exploration vs. Exploitation" onNavigate={onNavigate} tryItTab="training">
        <Typography variant="body-sm">
          The agent faces a fundamental dilemma: should it <Term term="explore" definition="Try random actions to discover potentially better strategies. Essential early in training." /> (try
          new things) or <Term term="exploit" definition="Use the best known action. Important once the agent has learned good strategies." /> (use
          what it knows)?
        </Typography>
        <Typography variant="body-sm">
          The <Term term="ε-greedy policy" definition="With probability ε, take a random action (explore). With probability 1-ε, take the best known action (exploit)." /> solves
          this by starting with high exploration (ε ≈ 1.0) and gradually shifting to exploitation (ε → 0.01).
          Watch the ε-decay curve in the Training tab to see this in action.
        </Typography>
        <Typography variant="body-sm">
          Early in training, the agent tries many different prices to map out the landscape. As it learns
          which prices work best for each market condition, it increasingly sticks with proven strategies.
        </Typography>
      </Section>

      <Section title="Multi-Objective Pricing" onNavigate={onNavigate} tryItTab="pricing-lab">
        <Typography variant="body-sm">
          Real-world pricing isn't just about maximizing one metric. Businesses balance multiple competing objectives:
        </Typography>
        <ul className="list-disc list-inside space-y-1">
          <Typography variant="body-sm" as="li">
            <strong>Revenue</strong> — total income (price × quantity)
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Margin</strong> — profit per unit × quantity
          </Typography>
          <Typography variant="body-sm" as="li">
            <strong>Volume</strong> — units sold (market share)
          </Typography>
        </ul>
        <Typography variant="body-sm">
          The reward function combines these with adjustable weights:
          <code className="text-sm px-1 py-0.5 rounded ml-1" style={{ background: 'var(--color-gray)' }}>
            R = w₁·revenue + w₂·margin + w₃·volume
          </code>
        </Typography>
        <Typography variant="body-sm">
          Try the Pricing Lab to see how changing weights shifts the agent's strategy — more revenue weight
          pushes toward higher prices, while volume weight encourages competitive pricing.
        </Typography>
      </Section>

      <Section title="From Q-Tables to Deep RL">
        <Typography variant="body-sm">
          This demo uses <Term term="tabular Q-learning" definition="Stores Q-values in a table. Works well for small, discrete state spaces (like our 500-state pricing model)." /> with
          500 discrete states. In production, state spaces are often continuous and high-dimensional
          (hundreds of features, millions of products).
        </Typography>
        <Typography variant="body-sm">
          <Term term="Deep Q-Networks (DQN)" definition="Replace the Q-table with a neural network that approximates Q(s,a). Scales to continuous, high-dimensional state spaces." /> replace
          the Q-table with a neural network, enabling RL to handle continuous states and massive action spaces.
          Extensions like <strong>Double DQN</strong>, <strong>Dueling DQN</strong>, and <strong>Prioritized Experience Replay</strong> further
          improve stability and sample efficiency.
        </Typography>
        <Typography variant="body-sm">
          The WJARR paper (Adewole et al., 2025) discusses how these deep RL methods apply to real-world
          retail pricing at scale, where the principles demonstrated here extend to millions of SKUs.
        </Typography>
      </Section>

      <Section title="SHAP & Explainability" onNavigate={onNavigate} tryItTab="explainability">
        <Typography variant="body-sm">
          <Term term="Shapley values" definition="From game theory — fairly distribute a 'payout' (the price difference) among 'players' (features) based on their marginal contributions." /> come
          from cooperative game theory and provide a principled way to explain model predictions.
          For each feature, the Shapley value measures its average marginal contribution across all
          possible feature orderings.
        </Typography>
        <Typography variant="body-sm">
          With 4 features, we compute <strong>exact</strong> Shapley values by evaluating all 2⁴ = 16
          feature coalitions (runs in microseconds). This shows precisely how much each market condition
          (demand, competition, season, historical price) contributes to pushing the price up or down.
        </Typography>
        <Typography variant="body-sm">
          The waterfall chart visualizes this decomposition: starting from a baseline (average conditions) price,
          each feature's contribution is shown as a positive (green) or negative (red) bar, building up to the
          final recommended price.
        </Typography>
      </Section>
    </div>
  );
}
