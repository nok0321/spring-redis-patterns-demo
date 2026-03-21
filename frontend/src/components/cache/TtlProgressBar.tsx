interface TtlProgressBarProps {
  ttlMs: number;
  persistent: boolean;
  maxTtlSeconds?: number;
}

const DEFAULT_MAX_SECONDS = 3600; // 1時間をデフォルト基準値とする

export function TtlProgressBar({ ttlMs, persistent, maxTtlSeconds = DEFAULT_MAX_SECONDS }: TtlProgressBarProps) {
  if (persistent || ttlMs === -1) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-gray-700" />
        <span className="text-gray-400 text-xs">∞ 永続</span>
      </div>
    );
  }

  if (ttlMs === -2 || ttlMs < 0) {
    return <span className="text-gray-600 text-xs">—</span>;
  }

  const ttlSeconds = ttlMs / 1000;
  const ratio = Math.min(1, ttlSeconds / maxTtlSeconds);

  const isLow    = ratio < 0.1;
  const isMedium = ratio >= 0.1 && ratio < 0.5;

  const barColor = isLow ? 'bg-red-500' : isMedium ? 'bg-yellow-500' : 'bg-green-500';

  const formatTtl = (sec: number) => {
    if (sec < 60)   return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m${Math.round(sec % 60)}s`;
    return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${isLow ? 'animate-pulse' : ''}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${isLow ? 'text-red-400 animate-pulse' : isMedium ? 'text-yellow-400' : 'text-green-400'}`}>
        {formatTtl(ttlSeconds)}
      </span>
    </div>
  );
}
