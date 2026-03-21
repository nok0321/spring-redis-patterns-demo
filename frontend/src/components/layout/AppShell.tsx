import { useState, useCallback, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Database, Lock, BarChart2, Settings, X, Eye,
  ShieldAlert, Gauge, Radio, GitBranch, Terminal,
} from 'lucide-react';
import { usePolling } from '../../hooks/usePolling';
import { healthApi } from '../../api/health';
import { getBaseUrl, setBaseUrl } from '../../api/client';

const navItems = [
  { to: '/',               icon: LayoutDashboard, label: 'ダッシュボード' },
  { to: '/visualizer',     icon: Eye,             label: 'ビジュアライザー' },
  { to: '/cache',          icon: Database,        label: 'キャッシュ' },
  { to: '/locks',          icon: Lock,            label: 'ロック' },
  { to: '/metrics',        icon: BarChart2,       label: 'メトリクス' },
  { to: '/circuit-breaker',icon: ShieldAlert,     label: 'Circuit Breaker' },
  { to: '/rate-limiter',   icon: Gauge,           label: 'Rate Limiter' },
  { to: '/pubsub',         icon: Radio,           label: 'Pub/Sub' },
  { to: '/saga',           icon: GitBranch,       label: 'Saga' },
  { to: '/cli',            icon: Terminal,        label: 'Redis CLI' },
] as const;

function ConnectionBadge() {
  const fetcher = useCallback(() => healthApi.get(), []);
  const { data, isLoading } = usePolling({
    fetcher,
    interval: 10_000,
  });

  if (isLoading) {
    return <span className="text-gray-400 text-xs flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400" /> 確認中</span>;
  }

  const isUp = data?.status === 'UP';
  return (
    <span className={`text-xs flex items-center gap-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${isUp ? 'bg-green-400' : 'bg-red-400'}`} />
      {isUp ? '接続中' : '切断'}
    </span>
  );
}

function BaseUrlModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [url, setUrl] = useState(getBaseUrl());
  const [urlError, setUrlError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = url.trim();
    if (trimmed) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setUrlError('http または https の URL を入力してください');
          return;
        }
      } catch {
        setUrlError('有効な URL を入力してください (例: http://localhost:8080)');
        return;
      }
    }
    setUrlError(null);
    setBaseUrl(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">接続設定</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <label className="block text-sm text-gray-300 mb-2">ベースURL</label>
        <input
          type="text"
          value={url}
          onChange={e => { setUrl(e.target.value); setUrlError(null); }}
          placeholder="http://localhost:8080"
          className={`w-full bg-gray-900 text-white border rounded px-3 py-2 text-sm mb-1 focus:outline-none focus:border-blue-500 ${urlError ? 'border-red-500' : 'border-gray-700'}`}
        />
        {urlError && <p className="text-red-400 text-xs mb-3">{urlError}</p>}
        {!urlError && <div className="mb-3" />}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">キャンセル</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded">保存</button>
        </div>
      </div>
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-white font-bold text-lg">Redis Dashboard</h1>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-end px-4 gap-4">
          <ConnectionBadge />
          <button
            onClick={() => setModalOpen(true)}
            className="text-gray-400 hover:text-white"
            title="接続設定"
          >
            <Settings size={18} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <BaseUrlModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
