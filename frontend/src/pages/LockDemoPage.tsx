import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, AlertTriangle, CheckCircle } from 'lucide-react';
import { locksApi } from '../api/locks';
import type { LockDemoModeResult, LockDemoEvent, DemoStep } from '../types/locks';
import { LockTimelineChart } from '../components/locks/LockTimelineChart';

// ----------------------------------------------------------------
// Step color / label
// ----------------------------------------------------------------
const STEP_STYLE: Record<DemoStep, { bg: string; text: string; label: string }> = {
  READ:           { bg: 'bg-blue-900/60',   text: 'text-blue-300',   label: 'READ' },
  WRITE:          { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'WRITE' },
  LOCK_WAITING:   { bg: 'bg-orange-900/60', text: 'text-orange-300', label: 'WAITING' },
  LOCK_ACQUIRED:  { bg: 'bg-green-900/60',  text: 'text-green-300',  label: 'ACQUIRED' },
  LOCK_RELEASED:  { bg: 'bg-gray-700/60',   text: 'text-gray-400',   label: 'RELEASED' },
};

const WORKER_COLORS = [
  'text-purple-300', 'text-pink-300', 'text-teal-300', 'text-indigo-300',
  'text-rose-300',   'text-cyan-300', 'text-lime-300', 'text-amber-300',
];

// ----------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------
function EventRow({ ev, isRace }: { ev: LockDemoEvent; isRace: boolean }) {
  const style = STEP_STYLE[ev.step] ?? { bg: 'bg-gray-800', text: 'text-gray-300', label: ev.step };
  const workerColor = WORKER_COLORS[(ev.workerId - 1) % WORKER_COLORS.length];

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${style.bg} ${isRace ? 'ring-1 ring-red-500' : ''}`}>
      <span className={`font-mono font-bold w-16 shrink-0 ${workerColor}`}>
        W{ev.workerId}
      </span>
      <span className={`font-mono w-20 shrink-0 ${style.text}`}>{style.label}</span>
      <span className="font-mono text-gray-400 w-12 shrink-0 text-right">
        {ev.value >= 0 ? ev.value : ''}
      </span>
      <span className="font-mono text-gray-600 ml-auto">{ev.relativeMs}ms</span>
      {isRace && <span title="競合発生" className="text-red-400 shrink-0">⚡</span>}
    </div>
  );
}

type TabType = 'timeline' | 'events';

function ResultPanel({ result, title, hasLock }: {
  result: LockDemoModeResult;
  title: string;
  hasLock: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabType>('timeline');

  // Find race conditions: multiple WRITEs at nearly the same relativeMs (within 20ms)
  const writes = result.events.filter(e => e.step === 'WRITE');
  const raceMs = new Set<number>();
  for (let i = 0; i < writes.length; i++) {
    for (let j = i + 1; j < writes.length; j++) {
      if (Math.abs(writes[i].relativeMs - writes[j].relativeMs) < 20) {
        raceMs.add(writes[i].relativeMs);
        raceMs.add(writes[j].relativeMs);
      }
    }
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${
      hasLock
        ? 'border-green-700 bg-gray-800/50'
        : result.correct ? 'border-gray-600 bg-gray-800/50' : 'border-red-700/60 bg-gray-800/50'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold ${hasLock ? 'text-green-300' : 'text-red-300'}`}>
          {title}
        </h3>
        {result.correct
          ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" />正確</span>
          : <span className="flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="w-3.5 h-3.5" />データ損失</span>
        }
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-900/60 rounded p-2">
          <div className="text-gray-400 text-xs">初期値</div>
          <div className="text-white font-mono font-bold">{result.initialValue}</div>
        </div>
        <div className="bg-gray-900/60 rounded p-2">
          <div className="text-gray-400 text-xs">期待値</div>
          <div className="text-blue-300 font-mono font-bold">{result.expectedFinal}</div>
        </div>
        <div className={`rounded p-2 ${result.correct ? 'bg-green-900/40' : 'bg-red-900/40'}`}>
          <div className="text-gray-400 text-xs">実際の値</div>
          <div className={`font-mono font-bold ${result.correct ? 'text-green-300' : 'text-red-300'}`}>
            {result.actualFinal}
          </div>
        </div>
      </div>

      {!result.correct && (
        <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-300">
          ⚡ 失われた更新: <strong>{result.lostUpdates}</strong> 件
          （{result.lostUpdates} ワーカーの書き込みが上書きされた）
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-700 pb-0">
        {(['timeline', 'events'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              activeTab === tab
                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'timeline' ? 'タイムライン' : 'イベントログ'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' ? (
        <LockTimelineChart
          events={result.events}
          title={`${title} — 経過時間 (ms)`}
        />
      ) : (
        <div>
          <div className="space-y-0.5 max-h-80 overflow-y-auto pr-1">
            {result.events.map((ev, idx) => {
              const isRace = ev.step === 'WRITE' && raceMs.has(ev.relativeMs);
              return <EventRow key={idx} ev={ev} isRace={isRace} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------
export function LockDemoPage() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState(4);
  const [initialValue, setInitialValue] = useState(10);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withoutLock, setWithoutLock] = useState<LockDemoModeResult | null>(null);
  const [withLock, setWithLock] = useState<LockDemoModeResult | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setWithoutLock(null);
    setWithLock(null);
    try {
      const res = await locksApi.runDemo({ workers, initialValue });
      setWithoutLock(res.withoutLock);
      setWithLock(res.withLock);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/locks')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          ロックモニター
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white">分散ロック デモ</h1>
        <p className="text-gray-400 text-sm mt-1">
          N 個のワーカーが同時に共有カウンタをデクリメントします。
          ロックなしでは「更新の消失（Lost Update）」が起き、ロックありでは正確に動作します。
        </p>
      </div>

      {/* Settings */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <h2 className="text-white font-semibold">設定</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="text-gray-300 text-sm block mb-1">
              ワーカー数: <span className="text-white font-bold">{workers}</span>
            </label>
            <input
              type="range" min={2} max={8} value={workers}
              onChange={e => setWorkers(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>2</span><span>8</span>
            </div>
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">
              初期カウンタ値: <span className="text-white font-bold">{initialValue}</span>
            </label>
            <input
              type="range" min={workers} max={50} value={initialValue}
              onChange={e => setInitialValue(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{workers}</span><span>50</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-700/50 rounded px-3 py-2 text-xs text-gray-400">
          各ワーカーはカウンタを <strong className="text-white">1</strong> ずつデクリメントします。
          期待される最終値: <strong className="text-blue-300">{initialValue} − {workers} = {initialValue - workers}</strong>
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors font-medium"
        >
          <Play className="w-4 h-4" />
          {running ? '実行中...' : 'デモを実行'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Results side-by-side */}
      {(withoutLock || withLock) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {withoutLock && (
            <ResultPanel
              result={withoutLock}
              title="ロックなし（競合あり）"
              hasLock={false}
            />
          )}
          {withLock && (
            <ResultPanel
              result={withLock}
              title="ロックあり（分散ロック）"
              hasLock
            />
          )}
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-gray-300 text-sm font-semibold mb-3">凡例</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.entries(STEP_STYLE) as [DemoStep, typeof STEP_STYLE[DemoStep]][]).map(([step, s]) => (
            <span key={step} className={`px-2 py-1 rounded font-mono ${s.bg} ${s.text}`}>
              {s.label}
            </span>
          ))}
          <span className="px-2 py-1 rounded bg-gray-800 text-red-400 ring-1 ring-red-500 font-mono">
            ⚡ 競合
          </span>
        </div>
      </div>
    </div>
  );
}
