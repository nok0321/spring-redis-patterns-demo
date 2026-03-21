import type { LockMetricsResponse } from '../../types/locks';
import { MetricsBarChart } from './MetricsBarChart';

interface Props {
  data: LockMetricsResponse | null;
  isLoading: boolean;
}

export function LockMetricsPanel({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">ロックメトリクス</h2>
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  const entries = Object.entries(data?.locks ?? {});

  const totalAttempts = entries.reduce((sum, [, s]) => sum + s.attempts, 0);
  const totalAcquisitions = entries.reduce((sum, [, s]) => sum + s.acquisitions, 0);
  const totalTimeouts = entries.reduce((sum, [, s]) => sum + s.timeouts, 0);
  const totalOpSuccesses = entries.reduce((sum, [, s]) => sum + s.operationSuccesses, 0);
  const totalOps = entries.reduce(
    (sum, [, s]) => sum + s.operationSuccesses + s.operationFailures,
    0
  );

  const overallAcqRate =
    totalAttempts > 0 ? (totalAcquisitions / totalAttempts) * 100 : 0;
  const overallOpRate = totalOps > 0 ? (totalOpSuccesses / totalOps) * 100 : 0;

  const barData = entries
    .map(([key, stats]) => ({
      name: key.length > 20 ? `...${key.slice(-17)}` : key,
      value:
        stats.attempts > 0
          ? parseFloat(((stats.acquisitions / stats.attempts) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-white font-semibold mb-4">ロックメトリクス</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">総ロック試行</div>
          <div className="text-white text-xl font-bold">
            {totalAttempts.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">取得成功率</div>
          <div className="text-green-400 text-xl font-bold">
            {overallAcqRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">タイムアウト</div>
          <div className="text-yellow-400 text-xl font-bold">
            {totalTimeouts.toLocaleString()}件
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">操作成功率</div>
          <div className="text-blue-400 text-xl font-bold">
            {overallOpRate.toFixed(1)}%
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-gray-400 text-sm mb-2">ロック別取得成功率（上位10件）</h3>
        <MetricsBarChart data={barData} color="#3B82F6" height={220} unit="%" />
      </div>
    </div>
  );
}
