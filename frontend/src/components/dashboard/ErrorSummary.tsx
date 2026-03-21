import type { CacheMetrics } from '../../types/cache';
import type { CircuitBreakerMetrics } from '../../types/health';

interface ErrorSummaryProps {
  cacheMetrics: CacheMetrics | null;
  circuitBreakers: Record<string, CircuitBreakerMetrics> | undefined;
}

export function ErrorSummary({ cacheMetrics, circuitBreakers }: ErrorSummaryProps) {
  const fallbacks = cacheMetrics?.fallbacks ?? 0;
  const errors = cacheMetrics?.errors ?? 0;

  const cbEntries = circuitBreakers ? Object.entries(circuitBreakers) : [];
  const totalCbFailureRate = cbEntries.length > 0
    ? cbEntries.reduce((sum, [, cb]) => sum + cb.failureRate, 0) / cbEntries.length
    : 0;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">エラー・フォールバック</h3>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-gray-400">フォールバック</span>
          <span className={`font-mono ${fallbacks > 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
            {fallbacks} 件
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-gray-400">エラー</span>
          <span className={`font-mono ${errors > 0 ? 'text-red-400' : 'text-gray-300'}`}>
            {errors} 件
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-gray-400">CB失敗率</span>
          <span className={`font-mono ${totalCbFailureRate > 5 ? 'text-red-400' : totalCbFailureRate > 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
            {totalCbFailureRate.toFixed(1)}%
          </span>
        </li>
      </ul>
    </div>
  );
}
