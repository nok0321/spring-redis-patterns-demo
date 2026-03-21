import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LockStatusChecker } from '../components/locks/LockStatusChecker';
import { LockOperationPanel } from '../components/locks/LockOperationPanel';
import { LockMetricsTable } from '../components/locks/LockMetricsTable';

export function LockMonitorPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ロックモニター</h1>
        <button
          onClick={() => navigate('/locks/demo')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition-colors"
        >
          分散ロックデモ
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LockStatusChecker />
        <LockOperationPanel />
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">ロックメトリクス</h2>
        <LockMetricsTable />
      </div>
    </div>
  );
}
