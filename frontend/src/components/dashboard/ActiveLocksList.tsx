import type { LockStats } from '../../types/locks';

interface ActiveLocksListProps {
  locks: Record<string, LockStats> | undefined;
}

export function ActiveLocksList({ locks }: ActiveLocksListProps) {
  const entries = locks ? Object.entries(locks) : [];

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">アクティブロック</h3>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-sm">アクティブなロックはありません</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([key, stats]) => {
            const rate = stats.attempts > 0
              ? Math.round((stats.acquisitions / stats.attempts) * 100)
              : 0;
            return (
              <li key={key} className="text-sm">
                <div className="flex items-center justify-between mb-1">
                  <code className="text-gray-200 text-xs">{key}</code>
                  <span className="text-gray-400 text-xs">{rate}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${rate >= 90 ? 'bg-green-500' : rate >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
