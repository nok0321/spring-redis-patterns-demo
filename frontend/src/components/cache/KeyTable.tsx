import { KeyPreviewCell } from './KeyPreviewCell';
import { TtlProgressBar } from './TtlProgressBar';
import { cacheApi } from '../../api/cache';
import { usePolling } from '../../hooks/usePolling';

interface TtlInfo {
  ttlMs: number;
  persistent: boolean;
}

interface KeyTableProps {
  results: Record<string, unknown>;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  onToggleAll: () => void;
  onDetail: (key: string) => void;
  onDelete: (key: string) => void;
}

export function KeyTable({
  results,
  selectedKeys,
  onToggleSelect,
  onToggleAll,
  onDetail,
  onDelete,
}: KeyTableProps) {
  const entries = Object.entries(results);
  const keys = Object.keys(results);

  const { data: ttlData } = usePolling<{ results: Record<string, TtlInfo> }>({
    fetcher: () => cacheApi.getTtlBatch(keys),
    interval: 10_000,
    enabled: keys.length > 0,
  });

  const ttlMap = ttlData?.results ?? {};

  if (entries.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center">
        キーをカンマ区切りで入力して検索してください
      </div>
    );
  }

  const allSelected = entries.length > 0 && entries.every(([k]) => selectedKeys.has(k));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-left">
            <th className="pb-2 pr-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="rounded border-gray-600"
              />
            </th>
            <th className="pb-2 pr-3 text-gray-400 font-medium">キー</th>
            <th className="pb-2 pr-3 text-gray-400 font-medium">値プレビュー</th>
            <th className="pb-2 pr-3 text-gray-400 font-medium">TTL</th>
            <th className="pb-2 text-gray-400 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => {
            const ttl = ttlMap[key];
            return (
              <tr key={key} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(key)}
                    onChange={() => onToggleSelect(key)}
                    className="rounded border-gray-600"
                  />
                </td>
                <td className="py-2 pr-3">
                  <code className="text-blue-300 text-xs">{key}</code>
                </td>
                <td className="py-2 pr-3">
                  <KeyPreviewCell value={value} />
                </td>
                <td className="py-2 pr-3">
                  {ttl ? (
                    <TtlProgressBar ttlMs={ttl.ttlMs} persistent={ttl.persistent} />
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onDetail(key)}
                      className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                    >
                      詳細
                    </button>
                    <button
                      onClick={() => onDelete(key)}
                      className="px-2 py-1 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
