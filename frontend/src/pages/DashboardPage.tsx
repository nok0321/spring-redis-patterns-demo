import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Activity, Percent, Hash, ShieldCheck } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { healthApi } from '../api/health';
import { cacheApi } from '../api/cache';
import { locksApi } from '../api/locks';
import { StatusCard } from '../components/dashboard/StatusCard';
import { OperationsChart } from '../components/dashboard/OperationsChart';
import { ActiveLocksList } from '../components/dashboard/ActiveLocksList';
import { ErrorSummary } from '../components/dashboard/ErrorSummary';

export function DashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const navigate = useNavigate();

  // usePolling が fetcherRef パターンで参照を安定化するため、
  // インライン関数を直接渡しても useEffect が再実行されない。
  const { data: health, refetch: refetchHealth } = usePolling({
    fetcher: () => healthApi.get(),
    interval: 10000,
    enabled: autoRefresh,
  });
  const { data: cache, refetch: refetchCache } = usePolling({
    fetcher: () => cacheApi.metrics(),
    interval: 15000,
    enabled: autoRefresh,
  });
  const { data: locks, refetch: refetchLocks } = usePolling({
    fetcher: () => locksApi.metrics(),
    interval: 15000,
    enabled: autoRefresh,
  });

  const handleRefreshAll = () => {
    refetchHealth();
    refetchCache();
    refetchLocks();
  };

  const redisStatus = health?.redis?.status ?? 'NOT_INITIALIZED';
  const redisStatusLabel = redisStatus === 'UP' ? 'UP' : redisStatus === 'DOWN' ? 'DOWN' : 'N/A';
  const redisCardStatus = redisStatus === 'UP' ? 'ok' as const : redisStatus === 'DOWN' ? 'error' as const : 'neutral' as const;

  const hitRate = cache?.hitRate ?? 0;
  const hitRateStatus = hitRate >= 70 ? 'ok' as const : hitRate >= 40 ? 'warn' as const : 'error' as const;

  const cbEntries = health?.circuitBreakers ? Object.entries(health.circuitBreakers) : [];
  const cbSummary = cbEntries.length > 0
    ? cbEntries.map(([, cb]) => cb.state).join(', ')
    : 'N/A';
  const hasCbOpen = cbEntries.some(([, cb]) => cb.state === 'OPEN');
  const hasCbHalfOpen = cbEntries.some(([, cb]) => cb.state === 'HALF_OPEN');
  const cbStatus = hasCbOpen ? 'error' as const : hasCbHalfOpen ? 'warn' as const : cbEntries.length > 0 ? 'ok' as const : 'neutral' as const;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">ダッシュボード</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            更新
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            自動更新 {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          label="Redis状態"
          value={redisStatusLabel}
          status={redisCardStatus}
          icon={<Activity className="h-4 w-4" />}
          onClick={() => navigate('/metrics')}
        />
        <StatusCard
          label="ヒット率"
          value={`${hitRate}%`}
          status={hitRateStatus}
          icon={<Percent className="h-4 w-4" />}
          onClick={() => navigate('/cache')}
        />
        <StatusCard
          label="総操作数"
          value={(cache?.operations ?? 0).toLocaleString()}
          status="neutral"
          icon={<Hash className="h-4 w-4" />}
          onClick={() => navigate('/metrics')}
        />
        <StatusCard
          label="CB状態"
          value={cbSummary}
          status={cbStatus}
          icon={<ShieldCheck className="h-4 w-4" />}
          onClick={() => navigate('/metrics')}
        />
      </div>

      <OperationsChart metrics={cache} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActiveLocksList locks={locks?.locks} />
        <ErrorSummary cacheMetrics={cache} circuitBreakers={health?.circuitBreakers} />
      </div>
    </div>
  );
}
