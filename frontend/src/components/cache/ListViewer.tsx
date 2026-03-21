interface ListViewerProps {
  value: unknown[];
}

export function ListViewer({ value }: ListViewerProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{value.length} 要素</div>
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {value.map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-gray-600 font-mono text-xs w-8 shrink-0 text-right">{i}</span>
            <span className="font-mono text-green-300 text-xs break-all">
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
