import { useState } from 'react';
import { locksApi } from '../../api/locks';
import type { TransferResponse } from '../../types/locks';

interface Props {
  onTransferComplete: (response: TransferResponse) => void;
  onError: (message: string) => void;
}

export function TransferForm({ onTransferComplete, onError }: Props) {
  const [fromKey, setFromKey] = useState('balance:account:A');
  const [toKey, setToKey] = useState('balance:account:B');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (!fromKey.trim() || !toKey.trim()) {
      setValidationError('送金元キーと送金先キーは必須です');
      return false;
    }
    if (fromKey.trim() === toKey.trim()) {
      setValidationError('送金元キーと送金先キーが同じです');
      return false;
    }
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setValidationError('金額は0より大きい値を入力してください');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await locksApi.transfer({
        fromKey: fromKey.trim(),
        toKey: toKey.trim(),
        amount: Number(amount),
      });
      onTransferComplete(res);
      if (!res.success) {
        onError('送金失敗');
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : '送金実行エラー');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div>
        <label className="text-gray-400 text-xs block mb-1">送金元キー</label>
        <input
          type="text"
          value={fromKey}
          onChange={e => setFromKey(e.target.value)}
          className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-gray-400 text-xs block mb-1">送金先キー</label>
        <input
          type="text"
          value={toKey}
          onChange={e => setToKey(e.target.value)}
          className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-gray-400 text-xs block mb-1">送金額</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="1000.00"
          step="0.01"
          min="0.01"
          className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>
      {validationError && (
        <div className="text-red-400 text-sm bg-red-950 rounded p-2">{validationError}</div>
      )}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
      >
        {isSubmitting ? '送金中...' : '送金実行'}
      </button>
    </div>
  );
}
