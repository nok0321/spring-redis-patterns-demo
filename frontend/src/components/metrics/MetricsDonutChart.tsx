import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface SliceData {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: SliceData[];
  height?: number;
}

export function MetricsDonutChart({ data, height = 200 }: Props) {
  const filtered = data.filter(d => d.value > 0);

  if (filtered.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-500 text-sm"
        style={{ height }}
      >
        データなし
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filtered}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {filtered.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '6px',
          }}
          itemStyle={{ color: '#D1FAE5' }}
        />
        <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
