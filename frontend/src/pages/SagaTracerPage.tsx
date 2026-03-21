import { useState } from 'react';
import { transactionApi } from '../api/transaction';
import { SagaFlowDiagram } from '../components/locks/SagaFlowDiagram';
import type { SagaResult } from '../types/transaction';

export function SagaTracerPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SagaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (withFail: boolean) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = withFail
        ? await transactionApi.runSagaFail()
        : await transactionApi.runSaga();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const overallColors = {
    SUCCESS:     'text-green-300 bg-green-900/30 border-green-700',
    FAILED:      'text-red-300 bg-red-900/30 border-red-700',
    COMPENSATED: 'text-orange-300 bg-orange-900/30 border-orange-700',
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Saga パターン実行トレーサー</h1>
        <p className="text-gray-400 text-sm mt-1">
          分散トランザクションの Saga パターンを可視化。失敗時の補償ロールバックをアニメーションで確認できます。
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => run(false)}
          disabled={loading}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ▶ 通常実行
        </button>
        <button
          onClick={() => run(true)}
          disabled={loading}
          className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ⚡ 失敗 → 補償実行
        </button>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm animate-pulse">実行中...</div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Flow diagram */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">実行フロー</h2>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${overallColors[result.overallStatus]}`}>
                {result.overallStatus}
              </span>
            </div>
            <SagaFlowDiagram
              steps={result.steps}
              compensationSteps={result.compensationSteps}
            />
          </div>

          {/* Explanation */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <h3 className="text-white font-semibold text-sm">Saga パターンとは</h3>
              <div className="text-xs text-gray-400 space-y-2">
                <p>
                  マイクロサービス間の長期トランザクションを、
                  ローカルトランザクションのシーケンスに分割します。
                </p>
                <p>
                  各ステップが成功すれば次へ進み、失敗した場合は
                  それまでのステップを逆順に「補償」します。
                </p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <h3 className="text-white font-semibold text-sm">凡例</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-900/50 border border-green-700 text-green-300 flex items-center justify-center font-bold text-xs">✓</span>
                  <span className="text-gray-300">成功ステップ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-900/50 border border-red-700 text-red-300 flex items-center justify-center font-bold text-xs">✗</span>
                  <span className="text-gray-300">失敗ステップ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-900/50 border border-orange-700 text-orange-300 flex items-center justify-center font-bold text-xs">↩</span>
                  <span className="text-gray-300">補償ステップ（ロールバック）</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
