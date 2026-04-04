import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DashboardPage }       from './pages/DashboardPage';
import { CacheExplorerPage }   from './pages/CacheExplorerPage';
import { CacheDetailPage }     from './pages/CacheDetailPage';
import { LockMonitorPage }     from './pages/LockMonitorPage';
import { TransferPage }        from './pages/TransferPage';
import { LockDemoPage }        from './pages/LockDemoPage';
import { MetricsPage }          from './pages/MetricsPage';
import { RedisVisualizerPage }  from './pages/RedisVisualizerPage';
import { CircuitBreakerPage }   from './pages/CircuitBreakerPage';
import { RateLimiterPage }      from './pages/RateLimiterPage';
import { PubSubPage }           from './pages/PubSubPage';
import { SagaTracerPage }       from './pages/SagaTracerPage';
import { RedisCliPage }         from './pages/RedisCliPage';

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AppShell>
        <ErrorBoundary>
        <Routes>
          <Route path="/"               element={<DashboardPage />} />
          <Route path="/visualizer"     element={<RedisVisualizerPage />} />
          <Route path="/cache"          element={<CacheExplorerPage />} />
          <Route path="/cache/:key"     element={<CacheDetailPage />} />
          <Route path="/locks"          element={<LockMonitorPage />} />
          <Route path="/locks/transfer" element={<TransferPage />} />
          <Route path="/locks/demo"     element={<LockDemoPage />} />
          <Route path="/metrics"          element={<MetricsPage />} />
          <Route path="/circuit-breaker" element={<CircuitBreakerPage />} />
          <Route path="/rate-limiter"    element={<RateLimiterPage />} />
          <Route path="/pubsub"          element={<PubSubPage />} />
          <Route path="/saga"            element={<SagaTracerPage />} />
          <Route path="/cli"             element={<RedisCliPage />} />
          <Route path="*"               element={<div className="p-8 text-center"><h2 className="text-xl font-bold mb-4">404 - ページが見つかりません</h2><a href="/" className="text-blue-400 hover:text-blue-300 underline">ホームに戻る</a></div>} />
        </Routes>
        </ErrorBoundary>
      </AppShell>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
