import dayjs from 'dayjs';

interface KeyInfoPanelProps {
  keyName: string;
  found: boolean;
  fetchedAt: Date;
}

export function KeyInfoPanel({ keyName, found, fetchedAt }: KeyInfoPanelProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">情報</h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-400">キー</dt>
        <dd className="text-white font-mono text-xs break-all">{keyName}</dd>
        <dt className="text-gray-400">取得時刻</dt>
        <dd className="text-gray-200">{dayjs(fetchedAt).format('YYYY-MM-DD HH:mm:ss')}</dd>
        <dt className="text-gray-400">found</dt>
        <dd>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${found ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {String(found)}
          </span>
        </dd>
      </dl>
    </div>
  );
}
