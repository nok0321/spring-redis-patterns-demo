import { useState, useEffect, useRef } from 'react';
import { pubsubApi } from '../api/pubsub';
import type { PubSubMessage } from '../types/pubsub';

export function PubSubPage() {
  const [topic, setTopic] = useState('test');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<PubSubMessage[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const esRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // SSE 接続
  useEffect(() => {
    const es = pubsubApi.createEventSource();
    esRef.current = es;

    es.onopen = () => setSseStatus('connected');

    es.onmessage = (e) => {
      setSseStatus('connected');
      try {
        const data: PubSubMessage = JSON.parse(e.data);
        setMessages(prev => [...prev.slice(-49), data]);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      } catch { /* ignore parse error */ }
    };

    es.onerror = () => {
      // EventSource は自動再接続するが、接続切断中であることをユーザーに通知する
      setSseStatus(es.readyState === EventSource.CONNECTING ? 'connecting' : 'error');
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  // 新メッセージ来たらスクロール
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handlePublish = async () => {
    if (!message.trim()) return;
    setPublishing(true);
    setError(null);
    try {
      await pubsubApi.publish(topic, message);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setPublishing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePublish();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pub/Sub メッセージングビジュアライザー</h1>
        <p className="text-gray-400 text-sm mt-1">
          Redis RTopic を使ったリアルタイム Pub/Sub。メッセージを発行して受信を確認できます。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Publisher */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Publisher
          </h2>

          <div>
            <label className="text-gray-300 text-xs block mb-1">トピック</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="test"
            />
          </div>

          <div>
            <label className="text-gray-300 text-xs block mb-1">メッセージ</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="送信するメッセージを入力 (Enter で送信)"
            />
          </div>

          {error && (
            <div className="text-red-300 text-xs bg-red-900/30 border border-red-700 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={publishing || !message.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {publishing ? '送信中...' : '▶ パブリッシュ'}
          </button>

          {/* Flow diagram */}
          <div className="bg-gray-900/60 rounded p-3">
            <div className="text-xs text-gray-500 mb-2">メッセージフロー</div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="bg-blue-900/60 text-blue-300 px-2 py-1 rounded border border-blue-700">Publisher</span>
              <span className="text-gray-500">→</span>
              <span className="bg-red-900/60 text-red-300 px-2 py-1 rounded border border-red-700">Redis</span>
              <span className="text-gray-500">→</span>
              <span className={`bg-green-900/60 text-green-300 px-2 py-1 rounded border border-green-700 transition-all duration-300 ${flash ? 'ring-2 ring-green-400' : ''}`}>
                Subscriber
              </span>
            </div>
          </div>
        </div>

        {/* Subscriber */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${sseStatus === 'connected' ? 'bg-green-400' : sseStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'} ${flash ? 'animate-ping' : ''}`} />
              Subscriber
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{messages.length} 件</span>
              <button
                onClick={() => setMessages([])}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                クリア
              </button>
            </div>
          </div>

          <div
            ref={listRef}
            className="h-80 overflow-y-auto space-y-1.5 pr-1"
          >
            {messages.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">
                まだメッセージはありません
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={`${msg.topic}-${msg.timestamp}-${i}`}
                  className="bg-gray-900/60 rounded px-3 py-2 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-blue-300 font-mono font-bold">{msg.topic}</span>
                    <span className="text-gray-600">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-white break-all">{msg.message}</div>
                </div>
              ))
            )}
          </div>

          <div className="text-xs text-gray-600">
            {sseStatus === 'connected' && 'SSE (Server-Sent Events) でリアルタイム受信中'}
            {sseStatus === 'connecting' && <span className="text-yellow-400">SSE 接続中...</span>}
            {sseStatus === 'error' && <span className="text-red-400">SSE 接続エラー。自動再接続を試みています。</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
