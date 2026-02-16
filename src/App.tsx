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
              <div className="flex items-center" style={{ gap: '12px' }}>
                <Typography variant="heading-lg" as="h1">
                  RL Dynamic Pricing Demo
                </Typography>
                <Badge variant="neutral" style={{ marginLeft: '4px' }}>Interactive</Badge>
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
