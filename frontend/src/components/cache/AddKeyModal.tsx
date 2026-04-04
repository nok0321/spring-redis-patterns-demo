import { useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface AddKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (key: string, value: unknown, ttl?: number) => Promise<void>;
}

export function AddKeyModal({ isOpen, onClose, onAdd }: AddKeyModalProps) {
  const containerRef = useFocusTrap(isOpen, onClose);
  const [key, setKey] = useState('');
  const [rawValue, setRawValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!key.trim()) {
      setError('キーは必須です');
      return;
    }
    if (!rawValue.trim()) {
      setError('値は必須です');
      return;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(rawValue);
    } catch {
      parsedValue = rawValue;
    }

    const ttlNum = ttl ? Number(ttl) : undefined;
    if (ttl && (isNaN(ttlNum as number) || (ttlNum as number) < 0)) {
      setError('TTLは0以上の数値を入力してください');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onAdd(key.trim(), parsedValue, ttlNum);
      setKey('');
      setRawValue('');
      setTtl('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="addkey-dialog-title">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 id="addkey-dialog-title" className="text-white font-semibold">新規キー追加</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="addkey-key" className="block text-xs text-gray-400 mb-1">キー</label>
            <input
              id="addkey-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="session:user:1042"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="addkey-value" className="block text-xs text-gray-400 mb-1">値</label>
            <textarea
              id="addkey-value"
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              placeholder='{"userId": 1042, "name": "asdf"}'
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label htmlFor="addkey-ttl" className="block text-xs text-gray-400 mb-1">TTL（秒）</label>
            <input
              id="addkey-ttl"
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="省略時はサーバーデフォルト"
              min={0}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? '追加中...' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
