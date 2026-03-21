import type { CacheMetrics } from '../../types/cache';
import { MetricsDonutChart } from './MetricsDonutChart';

interface Props {
  data: CacheMetrics | null;
  isLoading: boolean;
  trendData: Array<{ name: string; operations: number; hits: number }>;
}

const DONUT_COLORS = ['#10B981', '#F59E0B', '#EF4444'];

export function CacheMetricsPanel({ data, isLoading, trendData: _trendData }: Props) {
  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">キャッシュメトリクス</h2>
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  const donutData = [
    { name: 'Redisヒット', value: data?.redisHits ?? 0, color: DONUT_COLORS[0] },
    { name: 'フォールバック', value: data?.fallbacks ?? 0, color: DONUT_COLORS[1] },
    { name: 'エラー', value: data?.errors ?? 0, color: DONUT_COLORS[2] },
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-white font-semibold mb-4">キャッシュメトリクス</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">総操作数</div>
          <div className="text-white text-xl font-bold">
            {(data?.operations ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">Redisヒット率</div>
          <div className="text-green-400 text-xl font-bold">
            {(data?.hitRate ?? 0).toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">フォールバック</div>
          <div className="text-yellow-400 text-xl font-bold">
            {(data?.fallbacks ?? 0).toLocaleString()}件
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-gray-400 text-xs mb-1">エラー</div>
          <div className="text-red-400 text-xl font-bold">
            {(data?.errors ?? 0).toLocaleString()}件
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-gray-400 text-sm mb-2">操作の内訳</h3>
        <MetricsDonutChart data={donutData} height={220} />
      </div>
    </div>
  );
}
