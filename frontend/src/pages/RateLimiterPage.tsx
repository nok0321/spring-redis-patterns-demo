import { useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { rateLimiterApi } from '../api/rateLimiter';
import { TokenBucketAnimation } from '../components/metrics/TokenBucketAnimation';
import type { FloodResult } from '../types/rateLimiter';

export function RateLimiterPage() {
  const [workers, setWorkers] = useState(5);
  const [burstCount, setBurstCount] = useState(3);
  const [floodLoading, setFloodLoading] = useState(false);
  const [floodResult, setFloodResult] = useState<FloodResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => rateLimiterApi.getStatus(), []);
  const { data: status } = usePolling({ fetcher, interval: 1000 });

  const maxPermissions = status?.limitForPeriod ?? 10;
  const available = status?.availablePermissions ?? 0;
  const waiting = status?.numberOfWaitingThreads ?? 0;

  const handleFlood = async () => {
    setFloodLoading(true);
    setError(null);
    try {
      const result = await rateLimiterApi.flood(workers, burstCount);
      setFloodResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setFloodLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Rate Limiter バケツアニメーション</h1>
        <p className="text-gray-400 text-sm mt-1">
          トークンバケットアルゴリズムの動作を可視化。大量リクエストのシミュレーションができます。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bucket visualization */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-white font-semibold">トークンバケット</h2>
          <TokenBucketAnimation
            availablePermissions={available}
            maxPermissions={maxPermissions}
            waitingThreads={waiting}
          />
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="bg-gray-900/60 rounded p-2">
              <div className="text-gray-400">最大トークン数</div>
              <div className="text-white font-mono font-bold">{maxPermissions}</div>
            </div>
            <div className="bg-gray-900/60 rounded p-2">
              <div className="text-gray-400">補充周期</div>
              <div className="text-blue-300 font-mono font-bold">
                {status ? `${status.cyclePeriodMs}ms` : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Controls & Results */}
        <div className="space-y-4">
          {/* Flood controls */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-4">
            <h2 className="text-white font-semibold">フラッド実行</h2>

            <div>
              <label className="text-gray-300 text-sm block mb-1">
                ワーカー数: <span className="text-white font-bold">{workers}</span>
              </label>
              <input
                type="range" min={1} max={20} value={workers}
                onChange={e => setWorkers(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span><span>20</span>
              </div>
            </div>

            <div>
              <label className="text-gray-300 text-sm block mb-1">
                バースト数 (ワーカーあたり): <span className="text-white font-bold">{burstCount}</span>
              </label>
              <input
                type="range" min={1} max={20} value={burstCount}
                onChange={e => setBurstCount(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span><span>20</span>
              </div>
            </div>

            <div className="bg-gray-700/50 rounded px-3 py-2 text-xs text-gray-400">
              合計リクエスト数: <span className="text-white font-bold">{workers * burstCount}</span>
              （最大許可: <span className="text-green-300 font-bold">{maxPermissions}</span>）
            </div>

            <button
              onClick={handleFlood}
              disabled={floodLoading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              {floodLoading ? '実行中...' : '🌊 フラッド実行'}
            </button>
          </div>

          {/* Results */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {floodResult && (
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <h3 className="text-white font-semibold">実行結果</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-900/60 rounded p-2">
                  <div className="text-xs text-gray-400">総リクエスト</div>
                  <div className="text-white font-mono font-bold">{floodResult.requested}</div>
                </div>
                <div className="bg-green-900/40 rounded p-2">
                  <div className="text-xs text-gray-400">許可</div>
                  <div className="text-green-300 font-mono font-bold">{floodResult.permitted}</div>
                </div>
                <div className="bg-red-900/40 rounded p-2">
                  <div className="text-xs text-gray-400">拒否</div>
                  <div className="text-red-300 font-mono font-bold">{floodResult.rejected}</div>
                </div>
              </div>

              {/* Event timeline */}
              <div>
                <div className="text-xs text-gray-500 mb-2">イベントログ（最新50件）</div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                  {floodResult.events.slice(-50).map((ev, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2 py-0.5 rounded text-xs ${
                      ev.permitted ? 'bg-green-900/30' : 'bg-red-900/30'
                    }`}>
                      <span className="font-mono text-gray-400 w-12 shrink-0">W{ev.workerId}</span>
                      <span className={`w-12 shrink-0 ${ev.permitted ? 'text-green-300' : 'text-red-300'}`}>
                        {ev.permitted ? '✓ 許可' : '✗ 拒否'}
                      </span>
                      <span className="text-gray-600 ml-auto">{ev.relativeMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
