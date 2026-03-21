import { usePolling } from '../../hooks/usePolling';
import { locksApi } from '../../api/locks';

export function LockMetricsTable() {
  const { data, isLoading, error } = usePolling({
    fetcher: locksApi.metrics,
    interval: 15000,
  });

  if (isLoading) {
    return <div className="text-gray-400 text-sm p-4">読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-400 text-sm p-4">{error}</div>;
  }

  const entries = Object.entries(data?.locks ?? {});

  if (entries.length === 0) {
    return <div className="text-gray-500 text-sm p-4">ロックメトリクスなし</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-gray-400 font-medium py-2 px-3">ロックキー</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">試行</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">取得</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">タイムアウト</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">成功率</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, stats]) => {
            const rate = stats.attempts > 0
              ? (stats.acquisitions / stats.attempts) * 100
              : 0;
            const rowClass =
              rate < 70 ? 'bg-red-900/40' :
              rate < 90 ? 'bg-yellow-900/40' :
              '';
            return (
              <tr key={key} className={`border-b border-gray-800 ${rowClass}`}>
                <td className="text-white py-2 px-3 font-mono text-xs">{key}</td>
                <td className="text-gray-300 py-2 px-3 text-right">{stats.attempts}</td>
                <td className="text-gray-300 py-2 px-3 text-right">{stats.acquisitions}</td>
                <td className="text-gray-300 py-2 px-3 text-right">{stats.timeouts}</td>
                <td className="py-2 px-3 text-right font-semibold">
                  <span className={
                    rate < 70 ? 'text-red-400' :
                    rate < 90 ? 'text-yellow-400' :
                    'text-green-400'
                  }>
                    {rate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
