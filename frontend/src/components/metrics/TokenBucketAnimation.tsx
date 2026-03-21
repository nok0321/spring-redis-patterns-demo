interface TokenBucketAnimationProps {
  availablePermissions: number;
  maxPermissions: number;
  waitingThreads: number;
}

export function TokenBucketAnimation({
  availablePermissions,
  maxPermissions,
  waitingThreads,
}: TokenBucketAnimationProps) {
  const ratio = maxPermissions > 0
    ? Math.max(0, Math.min(1, availablePermissions / maxPermissions))
    : 0;

  const fillColor =
    ratio > 0.5 ? '#22c55e' :
    ratio > 0.2 ? '#eab308' : '#ef4444';

  const waterHeight = Math.round(ratio * 120);
  const bucketH = 140;
  const bucketW = 120;
  const padX = 10;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* SVG Bucket */}
      <svg width={bucketW + 40} height={bucketH + 40} viewBox={`0 0 ${bucketW + 40} ${bucketH + 40}`}>
        <defs>
          <clipPath id="bucket-clip">
            <rect x={20 + padX} y={20} width={bucketW - padX * 2} height={bucketH} rx={4} />
          </clipPath>
        </defs>
        {/* Bucket outline */}
        <rect
          x={20} y={20} width={bucketW} height={bucketH}
          fill="none" stroke="#4b5563" strokeWidth={2} rx={6}
        />
        {/* Water fill */}
        <rect
          x={20 + padX}
          y={20 + (bucketH - waterHeight)}
          width={bucketW - padX * 2}
          height={waterHeight}
          fill={fillColor}
          opacity={0.7}
          clipPath="url(#bucket-clip)"
          style={{ transition: 'height 0.5s ease, y 0.5s ease' }}
        />
        {/* Token count */}
        <text
          x={20 + bucketW / 2}
          y={20 + bucketH / 2 + 4}
          textAnchor="middle"
          fontSize={20}
          fontWeight="bold"
          fill="white"
          fontFamily="monospace"
        >
          {Math.max(0, availablePermissions)}
        </text>
        <text
          x={20 + bucketW / 2}
          y={20 + bucketH / 2 + 22}
          textAnchor="middle"
          fontSize={10}
          fill="#d1d5db"
          fontFamily="sans-serif"
        >
          / {maxPermissions}
        </text>
        {/* Label */}
        <text
          x={20 + bucketW / 2}
          y={20 + bucketH + 20}
          textAnchor="middle"
          fontSize={11}
          fill="#9ca3af"
          fontFamily="sans-serif"
        >
          トークン残量
        </text>
      </svg>

      {/* Waiting threads */}
      {waitingThreads > 0 && (
        <div className="flex items-center gap-2 text-xs text-yellow-300">
          <span className="animate-pulse">⏳</span>
          <span>{waitingThreads} スレッドが待機中</span>
        </div>
      )}

      {/* Fill level bar */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>残量</span>
          <span>{(ratio * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{ width: `${ratio * 100}%`, backgroundColor: fillColor }}
          />
        </div>
      </div>
    </div>
  );
}
