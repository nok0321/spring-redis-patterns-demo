import { useState, useEffect } from 'react';
import { cacheApi } from '../../api/cache';
import { HashViewer } from './HashViewer';
import { ListViewer } from './ListViewer';
import { SetViewer } from './SetViewer';
import { ZSetViewer } from './ZSetViewer';

type RedisDisplayType = 'STRING' | 'HASH' | 'MAP' | 'LIST' | 'SET' | 'SORTED_SET' | 'STREAM' | 'OBJECT' | string;

interface ValueViewerProps {
  value: unknown;
  /** キーが分かる場合は型チェックAPIを呼ぶ */
  cacheKey?: string;
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    STRING:     'bg-blue-900/40 text-blue-300 border-blue-800',
    OBJECT:     'bg-blue-900/40 text-blue-300 border-blue-800',
    HASH:       'bg-purple-900/40 text-purple-300 border-purple-800',
    MAP:        'bg-purple-900/40 text-purple-300 border-purple-800',
    LIST:       'bg-green-900/40 text-green-300 border-green-800',
    SET:        'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    SORTED_SET: 'bg-orange-900/40 text-orange-300 border-orange-800',
    STREAM:     'bg-red-900/40 text-red-300 border-red-800',
  };
  const cls = colors[type] ?? 'bg-gray-700 text-gray-300 border-gray-600';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono border ${cls}`}>{type}</span>
  );
}

export function ValueViewer({ value, cacheKey }: ValueViewerProps) {
  const [typedValue, setTypedValue] = useState<{ type: RedisDisplayType; value: unknown } | null>(null);
  const [fetchKey, setFetchKey] = useState<string | undefined>(undefined);

  // loading is derived: true when cacheKey changed but fetch hasn't completed yet
  const loading = !!cacheKey && fetchKey !== cacheKey;

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    cacheApi.getTyped(cacheKey)
      .then(res => { if (!cancelled) setTypedValue({ type: res.type, value: res.value }); })
      .catch(() => { /* fall back to raw value */ })
      .finally(() => { if (!cancelled) setFetchKey(cacheKey); });
    return () => { cancelled = true; };
  }, [cacheKey]);

  const displayType: RedisDisplayType = typedValue?.type ?? 'STRING';
  const displayValue = typedValue?.value ?? value;

  const renderValue = () => {
    if (loading) {
      return <div className="text-gray-500 text-xs animate-pulse">型情報を取得中...</div>;
    }

    switch (displayType) {
      case 'HASH':
      case 'MAP':
        if (displayValue && typeof displayValue === 'object' && !Array.isArray(displayValue)) {
          return <HashViewer value={displayValue as Record<string, unknown>} />;
        }
        break;
      case 'LIST':
        if (Array.isArray(displayValue)) {
          return <ListViewer value={displayValue} />;
        }
        break;
      case 'SET':
        if (Array.isArray(displayValue)) {
          return <SetViewer value={displayValue} />;
        }
        break;
      case 'SORTED_SET':
        if (Array.isArray(displayValue)) {
          return <ZSetViewer value={displayValue} />;
        }
        break;
    }

    // Fallback: raw JSON
    const formatted = typeof displayValue === 'string'
      ? displayValue
      : JSON.stringify(displayValue, null, 2);
    return (
      <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded overflow-auto max-h-96 font-mono">
        {formatted}
      </pre>
    );
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">値</h3>
        <TypeBadge type={displayType} />
      </div>
      {renderValue()}
    </div>
  );
}
