import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cacheApi } from '../api/cache';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/common/ToastContainer';
import { DeleteConfirmDialog } from '../components/common/DeleteConfirmDialog';
import { KeySearchBar } from '../components/cache/KeySearchBar';
import { KeyTable } from '../components/cache/KeyTable';
import { BatchActionBar } from '../components/cache/BatchActionBar';
import { AddKeyModal } from '../components/cache/AddKeyModal';

export function CacheExplorerPage() {
  const [pattern, setPattern] = useState('');
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const { toasts, addToast } = useToast();
  const navigate = useNavigate();

  const fetchByPattern = useCallback(async (pat: string) => {
    setIsSearching(true);
    try {
      const searchRes = await cacheApi.searchKeys(pat, 200);
      if (searchRes.keys.length === 0) {
        setResults({});
        return;
      }
      const allResults: Record<string, unknown> = {};
      const chunks: string[][] = [];
      for (let i = 0; i < searchRes.keys.length; i += 50) {
        chunks.push(searchRes.keys.slice(i, i + 50));
      }
      for (const chunk of chunks) {
        const res = await cacheApi.batchGet(chunk);
        Object.assign(allResults, res.results);
      }
      setResults(allResults);
      setSelectedKeys(new Set());
    } catch (e) {
      addToast(e instanceof Error ? e.message : '読み込み失敗', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [addToast]);

  // Auto-load all keys on mount
  useEffect(() => {
    fetchByPattern('*');
  }, [fetchByPattern]);

  const handleSearch = async () => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      // Empty pattern: reload all keys
      await fetchByPattern('*');
      return;
    }
    // If it looks like a pattern (has * or ?), use searchKeys
    if (trimmed.includes('*') || trimmed.includes('?')) {
      await fetchByPattern(trimmed);
      return;
    }
    // Otherwise: treat as comma-separated exact key names
    setIsSearching(true);
    try {
      const keys = trimmed.split(',').map(k => k.trim()).filter(Boolean);
      const res = await cacheApi.batchGet(keys);
      setResults(res.results);
      setSelectedKeys(new Set());
    } catch (e) {
      addToast(e instanceof Error ? e.message : '検索失敗', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    const allKeys = Object.keys(results);
    const allSelected = allKeys.every(k => selectedKeys.has(k));
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await cacheApi.delete(deleteTarget);
      const next = { ...results };
      delete next[deleteTarget];
      setResults(next);
      setSelectedKeys(prev => {
        const s = new Set(prev);
        s.delete(deleteTarget);
        return s;
      });
      addToast(`${deleteTarget} を削除しました`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : '削除失敗', 'error');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleBatchDelete = async () => {
    setIsBatchProcessing(true);
    const keys = [...selectedKeys];
    const results2 = await Promise.allSettled(keys.map(key => cacheApi.delete(key)));
    const succeeded: string[] = [];
    results2.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        succeeded.push(keys[i]);
      } else {
        addToast(`${keys[i]} の削除失敗: ${result.reason instanceof Error ? result.reason.message : '不明'}`, 'error');
      }
    });
    if (succeeded.length > 0) {
      setResults(prev => {
        const next = { ...prev };
        succeeded.forEach(key => delete next[key]);
        return next;
      });
    }
    setSelectedKeys(new Set());
    setIsBatchProcessing(false);
    if (succeeded.length > 0) addToast(`${succeeded.length}件を削除しました`, 'success');
  };

  const handleBatchWarmup = async () => {
    setIsBatchProcessing(true);
    try {
      await cacheApi.warmup([...selectedKeys]);
      addToast('ウォームアップを実行しました', 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'ウォームアップ失敗', 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleAddKey = async (key: string, value: unknown, ttl?: number) => {
    await cacheApi.set(key, { value, ttl });
    addToast(`${key} を追加しました`, 'success');
    await fetchByPattern('*');
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">キャッシュエクスプローラー</h1>
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規追加
        </button>
      </div>

      <KeySearchBar
        pattern={pattern}
        onPatternChange={setPattern}
        onSearch={handleSearch}
        isSearching={isSearching}
      />

      <BatchActionBar
        selectedCount={selectedKeys.size}
        onBatchDelete={handleBatchDelete}
        onBatchWarmup={handleBatchWarmup}
        isProcessing={isBatchProcessing}
      />

      <KeyTable
        results={results}
        selectedKeys={selectedKeys}
        onToggleSelect={handleToggleSelect}
        onToggleAll={handleToggleAll}
        onDetail={(key) => navigate('/cache/' + encodeURIComponent(key))}
        onDelete={(key) => setDeleteTarget(key)}
      />

      <DeleteConfirmDialog
        isOpen={deleteTarget !== null}
        target={deleteTarget ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={isDeleting}
      />

      <AddKeyModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddKey}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
