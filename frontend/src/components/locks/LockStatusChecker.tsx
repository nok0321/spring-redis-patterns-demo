import { useState } from 'react';
import { locksApi } from '../../api/locks';
import type { LockStatusResponse } from '../../types/locks';

export function LockStatusChecker() {
  const [lockKey, setLockKey] = useState('');
  const [result, setResult] = useState<LockStatusResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!lockKey.trim()) return;
    setIsChecking(true);
    setError(null);
    try {
      const res = await locksApi.status(lockKey.trim());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認失敗');
      setResult(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-semibold mb-3">ロック状態確認</h3>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-gray-400 text-xs block mb-1">キー</label>
          <input
            type="text"
            value={lockKey}
            onChange={e => setLockKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCheck()}
            placeholder="lock:order:123"
            className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleCheck}
          disabled={isChecking || !lockKey.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {isChecking ? '確認中...' : '確認'}
        </button>
        {error && (
          <div className="text-red-400 text-sm bg-red-950 rounded p-2">{error}</div>
        )}
        {result && (
          <div className="bg-gray-900 rounded p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">locked:</span>
              <span className={result.locked ? 'text-red-400' : 'text-green-400'}>
                {String(result.locked)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">canAcquire:</span>
              <span className={!result.locked ? 'text-green-400' : 'text-red-400'}>
                {String(!result.locked)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
