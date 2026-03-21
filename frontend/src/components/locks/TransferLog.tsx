import dayjs from 'dayjs';
import type { TransferResponse } from '../../types/locks';
import { TransferResultBadge } from './TransferResultBadge';

interface Props {
  logs: TransferResponse[];
}

export function TransferLog({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4">
        送金ログはまだありません
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log, idx) => (
        <div
          key={`${log.transferId}-${idx}`}
          className="flex items-center gap-3 bg-gray-800 rounded px-3 py-2 text-sm"
        >
          <span className="text-gray-400 text-xs font-mono">
            {dayjs(log.timestamp).format('HH:mm:ss')}
          </span>
          <span className="text-gray-300 font-mono text-xs">
            {log.transferId.slice(0, 8)}
          </span>
          <TransferResultBadge success={log.success} />
          <span className="text-white ml-auto">
            {log.amount.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
