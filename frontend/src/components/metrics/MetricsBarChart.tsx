import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface BarDataPoint {
  name: string;
  value: number;
}

interface Props {
  data: BarDataPoint[];
  color?: string;
  height?: number;
  unit?: string;
}

export function MetricsBarChart({ data, color = '#3B82F6', height = 200, unit = '' }: Props) {
  if (data.length === 0) {
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
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#9CA3AF', fontSize: 10 }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} unit={unit} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '6px',
          }}
          labelStyle={{ color: '#F9FAFB' }}
          itemStyle={{ color: '#D1FAE5' }}
          formatter={(value) => [`${typeof value === 'number' ? value : (value ?? '')}${unit}`, '成功率']}
        />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
