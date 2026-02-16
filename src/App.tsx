import { useState } from 'react';
import {
  Typography, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider,
} from '@northslopetech/altitude-ui';
import { CsvDataContext, useCsvDataProvider } from './hooks/useCsvData';
import { DataExplorer } from './pages/DataExplorer';
import { RlTraining } from './pages/RlTraining';
import { PricingLab } from './pages/PricingLab';
import { Explainability } from './pages/Explainability';
import { Learn } from './pages/Learn';

function App() {
  const csvData = useCsvDataProvider();
  const [activeTab, setActiveTab] = useState('data');

  return (
    <TooltipProvider>
      <CsvDataContext.Provider value={csvData}>
        <div className="min-h-screen" style={{ background: 'var(--color-light)' }}>
          {/* Header */}
          <header className="border-b px-6 py-4" style={{ borderColor: 'var(--color-gray)' }}>
            <div className="flex items-center gap-3">
              <Typography variant="heading-lg" as="h1">
                RL Dynamic Pricing Demo
              </Typography>
              <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
                NorthSlope Technologies
              </Typography>
            </div>
          </header>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b px-6" style={{ borderColor: 'var(--color-gray)' }}>
              <TabsList>
                <TabsTrigger value="data">Data Explorer</TabsTrigger>
                <TabsTrigger value="training">RL Training</TabsTrigger>
                <TabsTrigger value="pricing-lab">Pricing Lab</TabsTrigger>
                <TabsTrigger value="explainability">Explainability</TabsTrigger>
                <TabsTrigger value="learn">Learn</TabsTrigger>
              </TabsList>
            </div>

            <main className="max-w-7xl mx-auto">
              <TabsContent value="data">
                <DataExplorer />
              </TabsContent>
              <TabsContent value="training">
                <RlTraining />
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
      </CsvDataContext.Provider>
    </TooltipProvider>
  );
}

export default App;
