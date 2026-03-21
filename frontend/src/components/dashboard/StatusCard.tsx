import type { ReactNode } from 'react';

interface StatusCardProps {
  label: string;
  value: string | number;
  status?: 'ok' | 'warn' | 'error' | 'neutral';
  icon?: ReactNode;
  onClick?: () => void;
}

const statusColors: Record<string, string> = {
  ok: 'border-green-500 bg-green-500/10',
  warn: 'border-yellow-500 bg-yellow-500/10',
  error: 'border-red-500 bg-red-500/10',
  neutral: 'border-gray-500 bg-gray-500/10',
};

const dotColors: Record<string, string> = {
  ok: 'bg-green-400',
  warn: 'bg-yellow-400',
  error: 'bg-red-400',
  neutral: 'bg-gray-400',
};

export function StatusCard({ label, value, status = 'neutral', icon, onClick }: StatusCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-colors hover:bg-gray-700/50 ${statusColors[status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotColors[status]}`} />
          {icon && <span className="text-gray-400">{icon}</span>}
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </button>
  );
}
