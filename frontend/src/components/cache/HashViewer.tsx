interface HashViewerProps {
  value: Record<string, unknown>;
}

export function HashViewer({ value }: HashViewerProps) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{entries.length} フィールド</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 text-left">
              <th className="pb-1 pr-4 text-gray-400 font-medium">フィールド</th>
              <th className="pb-1 text-gray-400 font-medium">値</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([field, val]) => (
              <tr key={field} className="border-b border-gray-700/40">
                <td className="py-1.5 pr-4 font-mono text-blue-300 whitespace-nowrap">{field}</td>
                <td className="py-1.5 font-mono text-green-300 break-all">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
