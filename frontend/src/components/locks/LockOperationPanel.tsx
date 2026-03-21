import { useState } from 'react';
import { locksApi } from '../../api/locks';
import { ResultViewer } from '../common/ResultViewer';
import type { LockType, LockOperation, FencedOperation } from '../../types/locks';

type AllOperation = LockOperation | FencedOperation;

const OPERATIONS: AllOperation[] = [
  'cache_read',
  'cache_update',
  'atomic_increment',
  'batch_read',
  'fenced_cache_read',
  'fenced_cache_update',
  'fenced_atomic_increment',
  'fenced_critical_section',
  'fenced_conditional_update',
];

const LOCK_TYPES: LockType[] = ['standard', 'fair', 'read', 'write', 'spin'];

const PLACEHOLDERS: Record<string, string> = {
  cache_read: '{"key":"session:user:1042","type":"string"}',
  cache_update: '{"myKey":"myValue"}',
  atomic_increment: '{"counterKey":"api:count","increment":1}',
  fenced_cache_read: '{"key":"session:user:1042","type":"string"}',
  fenced_cache_update: '{"myKey":"myValue"}',
  fenced_atomic_increment: '{"counterKey":"api:count","increment":1}',
  fenced_critical_section: '{}',
  fenced_conditional_update: '{"key":"myKey","expectedVersion":1}',
  batch_read: '{"keys":["key1","key2"]}',
};

export function LockOperationPanel() {
  const [lockKey, setLockKey] = useState('');
  const [operation, setOperation] = useState<AllOperation>('cache_read');
  const [lockType, setLockType] = useState<LockType>('standard');
  const [dataStr, setDataStr] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFenced = operation.startsWith('fenced_');

  const handleExecute = async () => {
    if (!lockKey.trim()) return;
    setIsExecuting(true);
    setError(null);
    setResult(null);

    let data: Record<string, unknown> = {};
    try {
      const trimmed = dataStr.trim();
      if (trimmed) {
        data = JSON.parse(trimmed) as Record<string, unknown>;
      }
    } catch {
      setError('データのJSON形式が不正です');
      setIsExecuting(false);
      return;
    }

    try {
      let res: unknown;
      if (isFenced) {
        res = await locksApi.acquireFenced({
          lockKey: lockKey.trim(),
          operation: operation as FencedOperation,
          data,
        });
      } else {
        res = await locksApi.execute({
          lockKey: lockKey.trim(),
          operation: operation as LockOperation,
          data,
        });
      }
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '実行失敗');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-semibold mb-3">ロック操作テスト</h3>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-gray-400 text-xs block mb-1">キー</label>
          <input
            type="text"
            value={lockKey}
            onChange={e => setLockKey(e.target.value)}
            placeholder="lock:order:123"
            className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">操作</label>
            <select
              value={operation}
              onChange={e => setOperation(e.target.value as AllOperation)}
              className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {OPERATIONS.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
          {!isFenced && (
            <div>
              <label className="text-gray-400 text-xs block mb-1">ロック種別</label>
              <select
                value={lockType}
                onChange={e => setLockType(e.target.value as LockType)}
                className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                {LOCK_TYPES.map(lt => (
                  <option key={lt} value={lt}>{lt}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="text-gray-400 text-xs block mb-1">データ (JSON)</label>
          <textarea
            value={dataStr}
            onChange={e => setDataStr(e.target.value)}
            placeholder={PLACEHOLDERS[operation] ?? '{}'}
            rows={3}
            className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
          />
        </div>
        <button
          onClick={handleExecute}
          disabled={isExecuting || !lockKey.trim()}
          className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {isExecuting ? '実行中...' : '実行'}
        </button>
        <ResultViewer data={result} error={error} />
      </div>
    </div>
  );
}
