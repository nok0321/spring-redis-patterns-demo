interface BatchActionBarProps {
  selectedCount: number;
  onBatchDelete: () => void;
  onBatchWarmup: () => void;
  isProcessing: boolean;
}

export function BatchActionBar({ selectedCount, onBatchDelete, onBatchWarmup, isProcessing }: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-4 py-2">
      <span className="text-sm text-gray-300">
        選択中: <span className="font-semibold text-white">{selectedCount}件</span>
      </span>
      <button
        onClick={onBatchDelete}
        disabled={isProcessing}
        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 transition-colors"
      >
        一括削除
      </button>
      <button
        onClick={onBatchWarmup}
        disabled={isProcessing}
        className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50 transition-colors"
      >
        一括ウォームアップ
      </button>
    </div>
  );
}
