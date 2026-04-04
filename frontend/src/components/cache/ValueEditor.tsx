import { useState } from 'react';

interface ValueEditorProps {
  initialValue: unknown;
  onSave: (parsed: unknown) => Promise<void>;
  onCancel: () => void;
}

export function ValueEditor({ initialValue, onSave, onCancel }: ValueEditorProps) {
  const serialized = typeof initialValue === 'string'
    ? initialValue
    : JSON.stringify(initialValue, null, 2);
  const [raw, setRaw] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // JSON としてパースできない場合はプレーン文字列として保存
      parsed = raw;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">値を編集</h3>
      <textarea
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError(null);
        }}
        rows={12}
        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-green-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && (
        <p className="text-red-400 text-xs mt-1">{error}</p>
      )}
      <div className="flex gap-2 justify-end mt-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-300 hover:text-white"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 transition-colors"
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
