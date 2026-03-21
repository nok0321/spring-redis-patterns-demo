import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { CacheMetrics } from '../../types/cache';

interface ChartDataPoint {
  time: string;
  operations: number;
  hits: number;
}

interface OperationsChartProps {
  metrics: CacheMetrics | null;
}

const MAX_POINTS = 60;

export function OperationsChart({ metrics }: OperationsChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);

  useEffect(() => {
    if (!metrics) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const point: ChartDataPoint = {
      time,
      operations: metrics.operations,
      hits: metrics.redisHits,
    };
    // Use queueMicrotask to avoid synchronous setState in effect body
    queueMicrotask(() => {
      setData(prev => {
        const next = [...prev, point];
        return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
      });
    });
  }, [metrics]);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">キャッシュ操作数</h3>
        <div className="text-gray-500 text-sm h-48 flex items-center justify-center">
          データを収集中...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">キャッシュ操作数</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="time" stroke="#9CA3AF" fontSize={10} />
          <YAxis stroke="#9CA3AF" fontSize={10} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#9CA3AF' }}
          />
          <Legend />
          <Line type="monotone" dataKey="operations" stroke="#3B82F6" name="総操作数" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="hits" stroke="#10B981" name="Redisヒット" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
