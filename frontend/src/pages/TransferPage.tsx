import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TransferForm } from '../components/locks/TransferForm';
import { TransferLog } from '../components/locks/TransferLog';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/common/ToastContainer';
import type { TransferResponse } from '../types/locks';

export function TransferPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<TransferResponse[]>([]);
  const { toasts, addToast } = useToast();

  const handleTransferComplete = (response: TransferResponse) => {
    setLogs(prev => [response, ...prev].slice(0, 20));
    if (response.success) {
      addToast(`送金成功: ¥${response.amount.toLocaleString()}`, 'success');
    }
  };

  const handleError = (message: string) => {
    addToast(message, 'error');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/locks')}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          ロックモニター
        </button>
        <h1 className="text-2xl font-bold text-white">
          送金デモ（分散ロック + トランザクション）
        </h1>
      </div>

      <TransferForm
        onTransferComplete={handleTransferComplete}
        onError={handleError}
      />

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-semibold mb-4">実行ログ</h2>
        <TransferLog logs={logs} />
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
