interface Props {
  data: unknown;
  isLoading?: boolean;
  error?: string | null;
  maxHeight?: string;
}

export function ResultViewer({ data, isLoading, error, maxHeight = '300px' }: Props) {
  if (isLoading) {
    return <div className="text-gray-400 text-sm p-3">読み込み中...</div>;
  }
  if (error) {
    return <div className="text-red-400 text-sm p-3 bg-red-950 rounded">{error}</div>;
  }
  if (data === null || data === undefined) {
    return <div className="text-gray-500 text-sm p-3">データなし</div>;
  }
  return (
    <pre
      className="bg-gray-900 text-green-300 text-xs p-3 rounded overflow-auto"
      style={{ maxHeight }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
