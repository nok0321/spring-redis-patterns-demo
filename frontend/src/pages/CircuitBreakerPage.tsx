import { useState, useCallback } from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { healthApi } from '../api/health';
import { cacheApi } from '../api/cache';
import { CircuitBreakerStateDiagram } from '../components/dashboard/CircuitBreakerStateDiagram';
import type { CircuitBreakerState } from '../types/health';

const CB_NAME = 'cache-operations';

export function CircuitBreakerPage() {
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const fetcher = useCallback(() => healthApi.get(), []);
  const { data, isLoading } = usePolling({ fetcher, interval: 2000 });

  const cbMetrics = data?.circuitBreakers?.[CB_NAME];
  const state: CircuitBreakerState = cbMetrics?.state ?? 'CLOSED';
  const failureRate = cbMetrics?.failureRate ?? 0;
  const slowCallRate = cbMetrics?.slowCallRate ?? 0;
  const successCalls = cbMetrics?.numberOfSuccessfulCalls ?? 0;
  const failedCalls = cbMetrics?.numberOfFailedCalls ?? 0;

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleSimulation = async () => {
    setActionLoading(true);
    try {
      const next = !simulationEnabled;
      await cacheApi.simulateError(next);
      setSimulationEnabled(next);
      showMsg(`エラー注入 ${next ? 'ON' : 'OFF'}`, true);
    } catch {
      showMsg('操作に失敗しました', false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    setActionLoading(true);
    try {
      await cacheApi.resetCircuitBreaker();
      setSimulationEnabled(false);
      showMsg('サーキットブレーカーをリセットしました', true);
    } catch {
      showMsg('リセットに失敗しました', false);
    } finally {
      setActionLoading(false);
    }
  };

  const failureGaugeData = [{ name: '障害率', value: Math.min(failureRate, 100), fill: '#ef4444' }];
  const slowCallGaugeData = [{ name: 'スロー率', value: Math.min(slowCallRate, 100), fill: '#eab308' }];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Circuit Breaker ステートマシン</h1>
        <p className="text-gray-400 text-sm mt-1">
          サーキットブレーカーの状態をリアルタイムで監視。エラー注入で状態遷移をデモできます。
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded text-sm ${
          message.ok ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* State machine diagram */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-white font-semibold">状態遷移図</h2>
          {isLoading && !data ? (
            <div className="text-gray-400 text-sm text-center py-8">読み込み中...</div>
          ) : (
            <CircuitBreakerStateDiagram
              state={state}
              failureRate={failureRate}
              slowCallRate={slowCallRate}
            />
          )}
        </div>

        {/* Metrics & Controls */}
        <div className="space-y-4">
          {/* Gauge charts */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-white font-semibold mb-3">リアルタイム指標</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">障害率</div>
                <ResponsiveContainer width="100%" height={100}>
                  <RadialBarChart
                    cx="50%" cy="70%"
                    innerRadius="60%" outerRadius="90%"
                    startAngle={180} endAngle={0}
                    data={failureGaugeData}
                  >
                    <RadialBar dataKey="value" background={{ fill: '#374151' }} cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-xl font-bold text-red-300">{failureRate.toFixed(1)}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">スロー呼び出し率</div>
                <ResponsiveContainer width="100%" height={100}>
                  <RadialBarChart
                    cx="50%" cy="70%"
                    innerRadius="60%" outerRadius="90%"
                    startAngle={180} endAngle={0}
                    data={slowCallGaugeData}
                  >
                    <RadialBar dataKey="value" background={{ fill: '#374151' }} cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-xl font-bold text-yellow-300">{slowCallRate.toFixed(1)}%</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-center">
              <div className="bg-gray-900/60 rounded p-2">
                <div className="text-xs text-gray-400">成功呼び出し</div>
                <div className="text-green-300 font-mono font-bold">{successCalls}</div>
              </div>
              <div className="bg-gray-900/60 rounded p-2">
                <div className="text-xs text-gray-400">失敗呼び出し</div>
                <div className="text-red-300 font-mono font-bold">{failedCalls}</div>
              </div>
            </div>
          </div>

          {/* Control panel */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h2 className="text-white font-semibold">コントロールパネル</h2>

            <div className="bg-gray-900/60 rounded p-3 text-xs text-gray-400 space-y-1">
              <div>現在の状態:
                <span className={`ml-2 font-bold font-mono ${
                  state === 'CLOSED' ? 'text-green-300' :
                  state === 'OPEN'   ? 'text-red-300' : 'text-yellow-300'
                }`}>{state}</span>
              </div>
              <div>エラー注入:
                <span className={`ml-2 font-bold ${simulationEnabled ? 'text-red-300' : 'text-gray-400'}`}>
                  {simulationEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleSimulation}
              disabled={actionLoading}
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                simulationEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-red-700 hover:bg-red-600 text-white'
              }`}
            >
              {simulationEnabled ? '⏹ エラー注入 OFF' : '▶ エラー注入 ON'}
            </button>

            <button
              onClick={handleReset}
              disabled={actionLoading}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              ↺ サーキットブレーカー リセット
            </button>

            <p className="text-xs text-gray-500">
              エラー注入 ON にすると Redis 操作が意図的に失敗し、
              障害率が上昇してサーキットブレーカーが OPEN になります。
              リセットで CLOSED 状態に戻します。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
