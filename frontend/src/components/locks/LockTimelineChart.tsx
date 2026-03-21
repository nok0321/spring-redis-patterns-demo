import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { LockDemoEvent, DemoStep } from '../../types/locks';

// ----------------------------------------------------------------
// Color / label mappings  (TODO.md 指定値)
// ----------------------------------------------------------------
const STEP_COLORS: Record<DemoStep, string> = {
  LOCK_WAITING:  '#eab308',
  LOCK_ACQUIRED: '#22c55e',
  READ:          '#3b82f6',
  WRITE:         '#f97316',
  LOCK_RELEASED: '#6b7280',
};

const STEP_LABELS: Record<DemoStep, string> = {
  READ:          'READ',
  WRITE:         'WRITE',
  LOCK_WAITING:  'WAITING',
  LOCK_ACQUIRED: 'ACQUIRED',
  LOCK_RELEASED: 'RELEASED',
};

// ----------------------------------------------------------------
// Internal types
// ----------------------------------------------------------------
interface Segment {
  startMs: number;
  durationMs: number;
  step: DemoStep;
  value: number;
  relativeMs: number;
}

interface TimelineRow {
  name: string;
  /** ダミーの total 値（BarChart の dataKey として必要） */
  total: number;
  segments: Segment[];
}

// ----------------------------------------------------------------
// Data transformation
// ----------------------------------------------------------------
function buildTimelineData(events: LockDemoEvent[], tailMs = 30): TimelineRow[] {
  const byWorker = new Map<number, LockDemoEvent[]>();
  for (const ev of events) {
    if (!byWorker.has(ev.workerId)) byWorker.set(ev.workerId, []);
    byWorker.get(ev.workerId)!.push(ev);
  }
  for (const evs of byWorker.values()) {
    evs.sort((a, b) => a.relativeMs - b.relativeMs);
  }

  const maxMs = Math.max(...events.map(e => e.relativeMs), 0);
  const total = maxMs + tailMs;

  const rows: TimelineRow[] = [];
  for (const [wid, evs] of [...byWorker.entries()].sort((a, b) => a[0] - b[0])) {
    const segments: Segment[] = evs.map((ev, i) => {
      const nextMs = i + 1 < evs.length ? evs[i + 1].relativeMs : ev.relativeMs + tailMs;
      return {
        startMs:    ev.relativeMs,
        durationMs: Math.max(5, nextMs - ev.relativeMs),
        step:       ev.step,
        value:      ev.value,
        relativeMs: ev.relativeMs,
      };
    });
    rows.push({ name: `W${wid}`, total, segments });
  }
  return rows;
}

// ----------------------------------------------------------------
// Custom Bar shape — renders colored segments inside each row
// ----------------------------------------------------------------
function TimelineBarShape(props: Record<string, unknown>) {
  const { x, y, width, height, payload } = props as {
    x: number; y: number; width: number; height: number;
    payload: TimelineRow;
  };
  if (!payload?.segments || (width as number) <= 0) return null;

  const total = payload.total || 1;
  const w = width as number;
  const h = height as number;

  return (
    <g>
      {/* Track background */}
      <rect x={x} y={y + 2} width={w} height={h - 4} fill="#1f2937" rx={3} />
      {payload.segments.map((seg, i) => {
        const segX = x + (seg.startMs / total) * w;
        const segW = Math.min(
          Math.max(4, (seg.durationMs / total) * w),
          w - (segX - x),
        );
        return (
          <rect
            key={i}
            x={segX}
            y={y + 2}
            width={segW}
            height={h - 4}
            fill={STEP_COLORS[seg.step]}
            rx={2}
          />
        );
      })}
    </g>
  );
}

// ----------------------------------------------------------------
// Custom Tooltip
// ----------------------------------------------------------------
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload: TimelineRow }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg p-2 text-xs shadow-lg max-w-xs">
      <div className="font-bold text-white mb-1 font-mono">{label}</div>
      {row.segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: STEP_COLORS[seg.step] }}
          />
          <span className="text-gray-200 w-20 shrink-0">{STEP_LABELS[seg.step]}</span>
          <span className="text-gray-500">{seg.relativeMs}ms</span>
          {seg.value >= 0 && (
            <span className="text-blue-300 ml-auto">val={seg.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Public component
// ----------------------------------------------------------------
export interface LockTimelineChartProps {
  events: LockDemoEvent[];
  title: string;
}

export function LockTimelineChart({ events, title }: LockTimelineChartProps) {
  if (events.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-500 text-sm">
        イベントデータなし
      </div>
    );
  }

  const data = buildTimelineData(events);
  const maxMs = Math.max(...events.map(e => e.relativeMs), 0);
  const domainMax = maxMs + 30;
  const tickMs = maxMs <= 100 ? 10 : maxMs <= 500 ? 50 : 100;
  const tickCount = Math.min(8, Math.floor(domainMax / tickMs) + 1);
  const chartHeight = data.length * 52 + 48;

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{title}</div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            dataKey="total"
            domain={[0, domainMax]}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={(v: number) => `${v}ms`}
            tickCount={tickCount}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#d1d5db', fontSize: 12, fontFamily: 'monospace' }}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="total"
            shape={<TimelineBarShape />}
            isAnimationActive={true}
            animationBegin={0}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.entries(STEP_COLORS) as [DemoStep, string][]).map(([step, color]) => (
          <span key={step} className="flex items-center gap-1 text-gray-400">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            {STEP_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}
