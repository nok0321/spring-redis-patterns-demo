import type { CircuitBreakerMetrics } from '../../types/health';

interface Props {
  data: Record<string, CircuitBreakerMetrics> | undefined;
}

function StateBadge({ state }: { state: CircuitBreakerMetrics['state'] }) {
  if (state === 'CLOSED') {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        CLOSED
      </span>
    );
  }
  if (state === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        OPEN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-yellow-400 text-xs font-medium">
      <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
      HALF_OPEN
    </span>
  );
}

export function CircuitBreakerTable({ data }: Props) {
  const entries = Object.entries(data ?? {});

  if (entries.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4">CircuitBreakerデータなし</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-gray-400 font-medium py-2 px-3">名前</th>
            <th className="text-gray-400 font-medium py-2 px-3">状態</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">失敗率</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">遅コール率</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">成功</th>
            <th className="text-gray-400 font-medium py-2 px-3 text-right">失敗</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, metrics]) => {
            const rowClass =
              metrics.state === 'OPEN'
                ? 'bg-red-900/40'
                : metrics.state === 'HALF_OPEN'
                ? 'bg-yellow-900/40'
                : '';
            return (
              <tr key={name} className={`border-b border-gray-800 ${rowClass}`}>
                <td className="text-white py-2 px-3 font-mono text-xs">{name}</td>
                <td className="py-2 px-3">
                  <StateBadge state={metrics.state} />
                </td>
                <td className="text-gray-300 py-2 px-3 text-right">
                  {metrics.failureRate.toFixed(1)}%
                </td>
                <td className="text-gray-300 py-2 px-3 text-right">
                  {metrics.slowCallRate.toFixed(1)}%
                </td>
                <td className="text-green-400 py-2 px-3 text-right">
                  {metrics.numberOfSuccessfulCalls}
                </td>
                <td className="text-red-400 py-2 px-3 text-right">
                  {metrics.numberOfFailedCalls}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
