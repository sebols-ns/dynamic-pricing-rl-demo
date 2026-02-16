import { useState, useCallback, useEffect } from 'react';
import {
  Typography, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider, Badge,
} from '@northslopetech/altitude-ui';
import { CsvDataContext, useCsvDataProvider } from './hooks/useCsvData';
import { TrainedAgentContext } from './hooks/useTrainedAgent';
import { useRlTraining } from './hooks/useRlTraining';
import { DataExplorer } from './pages/DataExplorer';
import { RlTraining } from './pages/RlTraining';
import { PricingLab } from './pages/PricingLab';
import { Backtesting } from './pages/Backtesting';
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
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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
                padding: '16px 32px',
                backgroundColor: 'var(--color-base-white)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: '14px' }}>
                  {/* Northslope logo */}
                  <img
                    src={`${import.meta.env.BASE_URL}northslope-logo.png`}
                    alt="Northslope"
                    style={{
                      height: '28px',
                      filter: isDark ? 'invert(1)' : 'none',
                    }}
                  />
                  <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--color-subtle)' }} />
                  <Typography variant="heading-sm" as="h1" style={{ fontWeight: 600 }}>
                    Dynamic Pricing
                  </Typography>
                  <Badge variant="neutral">RL Demo</Badge>
                </div>
                <div className="flex items-center" style={{ gap: '8px' }}>
                  {/* Dark mode toggle */}
                  <button
                    onClick={() => setIsDark(d => !d)}
                    aria-label="Toggle dark mode"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '34px',
                      height: '34px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-subtle)',
                      backgroundColor: 'var(--color-base-white)',
                      color: 'var(--color-dark)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-gray)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-base-white)')}
                  >
                    {isDark ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    )}
                  </button>
                  {/* GitHub link */}
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
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-gray)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-base-white)')}
                  >
                    <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    Get the Code
                  </a>
                </div>
              </div>
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
                  <TabsTrigger value="backtesting">Backtesting</TabsTrigger>
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
                <TabsContent value="backtesting">
                  <Backtesting />
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
