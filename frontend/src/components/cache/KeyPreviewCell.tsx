interface KeyPreviewCellProps {
  value: unknown;
}

export function KeyPreviewCell({ value }: KeyPreviewCellProps) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const truncated = raw.length > 50 ? raw.slice(0, 50) + '...' : raw;

  return (
    <code className="text-xs text-gray-300 bg-gray-700/50 px-1.5 py-0.5 rounded">
      {truncated}
    </code>
  );
}
