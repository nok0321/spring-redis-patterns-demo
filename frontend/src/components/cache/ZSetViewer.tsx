interface ZSetViewerProps {
  value: unknown[];
}

export function ZSetViewer({ value }: ZSetViewerProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{value.length} メンバー（スコア降順）</div>
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {value.map((item, i) => {
          const isObj = typeof item === 'object' && item !== null;
          const display = isObj ? JSON.stringify(item) : String(item);
          return (
            <div key={i} className="flex gap-3 items-center">
              <span className="text-yellow-400 font-mono text-xs w-6 shrink-0 text-right">{i + 1}</span>
              <span className="font-mono text-green-300 text-xs break-all flex-1">{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
