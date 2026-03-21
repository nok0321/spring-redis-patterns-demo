import type { CircuitBreakerState } from '../../types/health';

interface CircuitBreakerStateDiagramProps {
  state: CircuitBreakerState;
  failureRate: number;
  slowCallRate: number;
}

const STATES: CircuitBreakerState[] = ['CLOSED', 'OPEN', 'HALF_OPEN'];

const STATE_CONFIG: Record<CircuitBreakerState, {
  color: string; fill: string; label: string; desc: string;
}> = {
  CLOSED:    { color: '#22c55e', fill: '#14532d', label: 'CLOSED',    desc: '正常' },
  OPEN:      { color: '#ef4444', fill: '#7f1d1d', label: 'OPEN',      desc: '遮断中' },
  HALF_OPEN: { color: '#eab308', fill: '#713f12', label: 'HALF_OPEN', desc: 'テスト中' },
};

// 円の中心座標
const NODE_POS: Record<CircuitBreakerState, { cx: number; cy: number }> = {
  CLOSED:    { cx: 120, cy: 80 },
  OPEN:      { cx: 280, cy: 80 },
  HALF_OPEN: { cx: 200, cy: 210 },
};

const NODE_R = 46;

// 矢印の定義 [from, to, label, offset]
interface Arrow {
  from: CircuitBreakerState;
  to: CircuitBreakerState;
  label: string;
  labelDx: number;
  labelDy: number;
}

const ARROWS: Arrow[] = [
  { from: 'CLOSED',    to: 'OPEN',      label: '障害率超過',   labelDx:  0, labelDy: -8 },
  { from: 'OPEN',      to: 'HALF_OPEN', label: 'タイムアウト', labelDx: 18, labelDy:  0 },
  { from: 'HALF_OPEN', to: 'CLOSED',    label: '成功',         labelDx: -20, labelDy:  0 },
  { from: 'HALF_OPEN', to: 'OPEN',      label: '失敗',         labelDx: 20,  labelDy:  0 },
];

function getArrowPoints(from: CircuitBreakerState, to: CircuitBreakerState) {
  const f = NODE_POS[from];
  const t = NODE_POS[to];
  const dx = t.cx - f.cx;
  const dy = t.cy - f.cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: f.cx + ux * NODE_R,
    y1: f.cy + uy * NODE_R,
    x2: t.cx - ux * NODE_R,
    y2: t.cy - uy * NODE_R,
  };
}

export function CircuitBreakerStateDiagram({
  state,
  failureRate,
  slowCallRate,
}: CircuitBreakerStateDiagramProps) {
  return (
    <div className="space-y-3">
      {/* SVG state machine diagram */}
      <svg
        viewBox="0 0 400 310"
        className="w-full"
        style={{ maxHeight: 280 }}
        aria-label="Circuit Breaker ステートマシン"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Arrows */}
        {ARROWS.map((arrow, i) => {
          const pts = getArrowPoints(arrow.from, arrow.to);
          const midX = (pts.x1 + pts.x2) / 2 + arrow.labelDx;
          const midY = (pts.y1 + pts.y2) / 2 + arrow.labelDy;
          return (
            <g key={i}>
              <line
                x1={pts.x1} y1={pts.y1}
                x2={pts.x2} y2={pts.y2}
                stroke="#6b7280"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
              <text
                x={midX}
                y={midY}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
                fontFamily="sans-serif"
              >
                {arrow.label}
              </text>
            </g>
          );
        })}

        {/* State nodes */}
        {STATES.map(s => {
          const { cx, cy } = NODE_POS[s];
          const cfg = STATE_CONFIG[s];
          const isActive = s === state;
          return (
            <g key={s}>
              <circle
                cx={cx} cy={cy} r={NODE_R}
                fill={cfg.fill}
                stroke={cfg.color}
                strokeWidth={isActive ? 3 : 1.5}
                filter={isActive ? 'url(#glow)' : undefined}
              >
                {isActive && (
                  <animate
                    attributeName="stroke-width"
                    values="3;5;3"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              <text
                x={cx} y={cy - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill={cfg.color}
                fontFamily="monospace"
              >
                {cfg.label}
              </text>
              <text
                x={cx} y={cy + 10}
                textAnchor="middle"
                fontSize={10}
                fill={isActive ? '#ffffff' : '#9ca3af'}
                fontFamily="sans-serif"
              >
                {cfg.desc}
              </text>
              {isActive && (
                <text
                  x={cx} y={cy + 26}
                  textAnchor="middle"
                  fontSize={9}
                  fill={cfg.color}
                  fontFamily="sans-serif"
                >
                  ● 現在
                </text>
              )}
            </g>
          );
        })}

        {/* Metric labels */}
        <text x={200} y={292} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily="sans-serif">
          障害率: {failureRate.toFixed(1)}% スロー呼び出し率: {slowCallRate.toFixed(1)}%
        </text>
      </svg>

      {/* State badge */}
      <div className="flex justify-center">
        <span
          className="px-4 py-1.5 rounded-full text-sm font-bold font-mono"
          style={{
            color: STATE_CONFIG[state].color,
            backgroundColor: STATE_CONFIG[state].fill,
            border: `1px solid ${STATE_CONFIG[state].color}`,
          }}
        >
          {state}
        </span>
      </div>
    </div>
  );
}
