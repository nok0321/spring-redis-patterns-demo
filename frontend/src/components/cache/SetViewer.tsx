interface SetViewerProps {
  value: unknown[];
}

export function SetViewer({ value }: SetViewerProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{value.length} メンバー</div>
      <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
        {value.map((item, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-full text-xs font-mono bg-blue-900/40 text-blue-300 border border-blue-800"
          >
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    </div>
  );
}
