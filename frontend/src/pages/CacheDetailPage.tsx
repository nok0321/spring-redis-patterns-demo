import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { cacheApi } from '../api/cache';
import type { CacheGetResponse } from '../types/cache';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/common/ToastContainer';
import { DeleteConfirmDialog } from '../components/common/DeleteConfirmDialog';
import { KeyInfoPanel } from '../components/cache/KeyInfoPanel';
import { ValueViewer } from '../components/cache/ValueViewer';
import { ValueEditor } from '../components/cache/ValueEditor';

export function CacheDetailPage() {
  const { key } = useParams<{ key: string }>();
  const decodedKey = decodeURIComponent(key ?? '');
  const navigate = useNavigate();
  const { toasts, addToast } = useToast();

  const [entry, setEntry] = useState<CacheGetResponse | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!decodedKey) return;
    setIsLoading(true);
    cacheApi.get(decodedKey)
      .then((res) => {
        setEntry(res);
        setFetchedAt(new Date());
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '取得失敗');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [decodedKey]);

  const handleSave = async (parsed: unknown) => {
    await cacheApi.set(decodedKey, { value: parsed });
    const refreshed = await cacheApi.get(decodedKey);
    setEntry(refreshed);
    setFetchedAt(new Date());
    setIsEditing(false);
    addToast('保存しました', 'success');
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await cacheApi.delete(decodedKey);
      addToast(`${decodedKey} を削除しました`, 'success');
      navigate('/cache');
    } catch (e) {
      addToast(e instanceof Error ? e.message : '削除失敗', 'error');
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-gray-400">読み込み中...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => navigate('/cache')}
          className="mt-4 text-sm text-blue-400 hover:text-blue-300"
        >
          キャッシュ一覧に戻る
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/cache')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          キャッシュ一覧
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white font-mono break-all">{decodedKey}</h1>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <Pencil className="h-4 w-4" />
              編集
            </button>
          )}
          <button
            onClick={() => setIsDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            削除
          </button>
        </div>
      </div>

      {entry && (
        <KeyInfoPanel
          keyName={entry.key}
          found={entry.found}
          fetchedAt={fetchedAt}
        />
      )}

      {entry && !isEditing && (
        <ValueViewer value={entry.value} cacheKey={decodedKey} />
      )}

      {entry && isEditing && (
        <ValueEditor
          initialValue={entry.value}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      )}

      <DeleteConfirmDialog
        isOpen={isDeleteOpen}
        target={decodedKey}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
        isDeleting={isDeleting}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
