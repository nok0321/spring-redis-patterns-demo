import { useCallback } from 'react';
import dayjs from 'dayjs';
import { RefreshCw, Download } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { cacheApi } from '../api/cache';
import { locksApi } from '../api/locks';
import { healthApi } from '../api/health';
import { CacheMetricsPanel } from '../components/metrics/CacheMetricsPanel';
import { LockMetricsPanel } from '../components/metrics/LockMetricsPanel';
import { CircuitBreakerTable } from '../components/metrics/CircuitBreakerTable';

export function MetricsPage() {
  const {
    data: cache,
    isLoading: cacheLoading,
    refetch: refetchCache,
  } = usePolling({ fetcher: cacheApi.metrics, interval: 15000 });

  const {
    data: locks,
    isLoading: locksLoading,
    refetch: refetchLocks,
  } = usePolling({ fetcher: locksApi.metrics, interval: 15000 });

  const {
    data: health,
    refetch: refetchHealth,
  } = usePolling({ fetcher: healthApi.get, interval: 15000 });

  const handleRefresh = useCallback(() => {
    refetchCache();
    refetchLocks();
    refetchHealth();
  }, [refetchCache, refetchLocks, refetchHealth]);

  const handleExportCsv = useCallback(() => {
    const rows: string[][] = [['種別', 'キー', '値']];

    rows.push(['cache', 'operations', String(cache?.operations ?? 0)]);
    rows.push(['cache', 'redisHits', String(cache?.redisHits ?? 0)]);
    rows.push(['cache', 'fallbacks', String(cache?.fallbacks ?? 0)]);
    rows.push(['cache', 'errors', String(cache?.errors ?? 0)]);
    rows.push(['cache', 'hitRate', String(cache?.hitRate ?? 0)]);

    const lockEntries = Object.entries(locks?.locks ?? {});
    for (const [lockKey, stats] of lockEntries) {
      rows.push(['lock_attempts', lockKey, String(stats.attempts)]);
      rows.push(['lock_acquisitions', lockKey, String(stats.acquisitions)]);
      rows.push(['lock_timeouts', lockKey, String(stats.timeouts)]);
      rows.push(['lock_releases', lockKey, String(stats.releases)]);
      rows.push(['lock_opSuccesses', lockKey, String(stats.operationSuccesses)]);
      rows.push(['lock_opFailures', lockKey, String(stats.operationFailures)]);
    }

    const cbEntries = Object.entries(health?.circuitBreakers ?? {});
    for (const [cbName, metrics] of cbEntries) {
      rows.push(['cb_state', cbName, metrics.state]);
      rows.push(['cb_failureRate', cbName, String(metrics.failureRate)]);
      rows.push(['cb_slowCallRate', cbName, String(metrics.slowCallRate)]);
      rows.push(['cb_successfulCalls', cbName, String(metrics.numberOfSuccessfulCalls)]);
      rows.push(['cb_failedCalls', cbName, String(metrics.numberOfFailedCalls)]);
    }

    const csvContent = rows
      .map(r => r.map(cell => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redis-metrics-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cache, locks, health]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">メトリクス</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV出力
          </button>
        </div>
      </div>

      <CacheMetricsPanel
        data={cache}
        isLoading={cacheLoading}
        trendData={[]}
      />

      <LockMetricsPanel
        data={locks}
        isLoading={locksLoading}
      />

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">CircuitBreaker 状態</h2>
        <CircuitBreakerTable data={health?.circuitBreakers} />
      </div>
    </div>
  );
}
