import { useState, useCallback } from 'react';
import {
  Typography, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider, Badge,
} from '@northslopetech/altitude-ui';
import { CsvDataContext, useCsvDataProvider } from './hooks/useCsvData';
import { TrainedAgentContext } from './hooks/useTrainedAgent';
import { useRlTraining } from './hooks/useRlTraining';
import { DataExplorer } from './pages/DataExplorer';
import { RlTraining } from './pages/RlTraining';
import { PricingLab } from './pages/PricingLab';
import { Explainability } from './pages/Explainability';
import { Learn } from './pages/Learn';
import type { QLearningAgent } from './engine/q-learning';
import type { PricingEnvironment } from './engine/environment';

function App() {
  const csvData = useCsvDataProvider();
  const training = useRlTraining();
  const [activeTab, setActiveTab] = useState('data');
  const [trainedAgent, setTrainedAgent] = useState<QLearningAgent | null>(null);
  const [trainedEnv, setTrainedEnv] = useState<PricingEnvironment | null>(null);
  const [trainedProductId, setTrainedProductId] = useState('');
  const [trainedEpisode, setTrainedEpisode] = useState(0);

  const setTrained = useCallback((agent: QLearningAgent, env: PricingEnvironment, productId: string, episode: number) => {
    setTrainedAgent(agent);
    setTrainedEnv(env);
    setTrainedProductId(productId);
    setTrainedEpisode(episode);
  }, []);

  const trainedCtx = {
    agent: trainedAgent,
    env: trainedEnv,
    productId: trainedProductId,
    isTrained: trainedAgent !== null && trainedEpisode > 0,
    episode: trainedEpisode,
    setTrained,
  };

  return (
    <TooltipProvider>
      <CsvDataContext.Provider value={csvData}>
        <TrainedAgentContext.Provider value={trainedCtx}>
          <div
            className="min-h-screen"
            style={{ backgroundColor: 'var(--color-light)', color: 'var(--color-dark)' }}
          >
            {/* Header */}
            <header
              style={{
                borderBottom: '1px solid var(--color-subtle)',
                padding: '20px 32px',
                backgroundColor: 'var(--color-base-white)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: '12px' }}>
                  <Typography variant="heading-lg" as="h1">
                    RL Dynamic Pricing Demo
                  </Typography>
                  <Badge variant="neutral" style={{ marginLeft: '4px' }}>Interactive</Badge>
                </div>
                <a
                  href="https://github.com/sebols-ns/dynamic-pricing-rl-demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-subtle)',
                    backgroundColor: 'var(--color-base-white)',
                    color: 'var(--color-dark)',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-light)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-base-white)')}
                >
                  <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                  </svg>
                  Get the Code
                </a>
              </div>
              <Typography
                variant="body-sm"
                style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
              >
                Northslope Technologies — Powered by Q-Learning
              </Typography>
            </header>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div
                style={{
                  borderBottom: '1px solid var(--color-subtle)',
                  padding: '0 32px',
                  backgroundColor: 'var(--color-base-white)',
                }}
              >
                <TabsList>
                  <TabsTrigger value="data">Data Explorer</TabsTrigger>
                  <TabsTrigger value="training">RL Training</TabsTrigger>
                  <TabsTrigger value="pricing-lab">Pricing Lab</TabsTrigger>
                  <TabsTrigger value="explainability">Explainability</TabsTrigger>
                  <TabsTrigger value="learn">Learn</TabsTrigger>
                </TabsList>
              </div>

              <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 32px' }}>
                <TabsContent value="data">
                  <DataExplorer />
                </TabsContent>
                <TabsContent value="training">
                  <RlTraining training={training} />
                </TabsContent>
                <TabsContent value="pricing-lab">
                  <PricingLab />
                </TabsContent>
                <TabsContent value="explainability">
                  <Explainability />
                </TabsContent>
                <TabsContent value="learn">
                  <Learn onNavigate={setActiveTab} />
                </TabsContent>
              </main>
            </Tabs>
          </div>
        </TrainedAgentContext.Provider>
      </CsvDataContext.Provider>
    </TooltipProvider>
  );
}

export default App;
