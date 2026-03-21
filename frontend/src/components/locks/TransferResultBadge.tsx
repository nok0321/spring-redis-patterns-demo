interface Props {
  success: boolean;
}

export function TransferResultBadge({ success }: Props) {
  if (success) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300">
        成功
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-300">
      失敗
    </span>
  );
}
