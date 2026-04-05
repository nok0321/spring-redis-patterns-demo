import { useState, useEffect, useRef, useCallback } from 'react';
import { cacheApi } from '../api/cache';

// ── types ────────────────────────────────────────────────────
type RedisType = 'STRING' | 'LIST' | 'SET' | 'ZSET' | 'HASH' | 'STREAM';

interface TypeMeta { label: string; icon: string; text: string; bg: string; border: string; bgSubtle: string }

const TYPE_META: Record<RedisType, TypeMeta> = {
  STRING: { label: 'STRING',     icon: 'S', text: 'text-redis-green',  bg: 'bg-redis-green',  border: 'border-redis-green',  bgSubtle: 'bg-redis-green/10' },
  LIST:   { label: 'LIST',       icon: 'L', text: 'text-redis-blue',   bg: 'bg-redis-blue',   border: 'border-redis-blue',   bgSubtle: 'bg-redis-blue/10' },
  SET:    { label: 'SET',        icon: '∅', text: 'text-redis-purple', bg: 'bg-redis-purple', border: 'border-redis-purple', bgSubtle: 'bg-redis-purple/10' },
  ZSET:   { label: 'SORTED SET', icon: 'Z', text: 'text-redis-amber',  bg: 'bg-redis-amber',  border: 'border-redis-amber',  bgSubtle: 'bg-redis-amber/10' },
  HASH:   { label: 'HASH',       icon: 'H', text: 'text-redis-pink',   bg: 'bg-redis-pink',   border: 'border-redis-pink',   bgSubtle: 'bg-redis-pink/10' },
  STREAM: { label: 'STREAM',     icon: '≋', text: 'text-redis-orange', bg: 'bg-redis-orange', border: 'border-redis-orange', bgSubtle: 'bg-redis-orange/10' },
};

const CMD_DOCS: Record<RedisType, string[]> = {
  STRING: ['GET key', 'SET key value [EX seconds]', 'INCR key', 'APPEND key value', 'STRLEN key'],
  LIST:   ['LPUSH key val', 'RPUSH key val', 'LPOP key', 'RPOP key', 'LRANGE key 0 -1', 'LLEN key'],
  SET:    ['SADD key member', 'SREM key member', 'SMEMBERS key', 'SISMEMBER key m', 'SUNION k1 k2'],
  ZSET:   ['ZADD key score member', 'ZRANGE key 0 -1', 'ZRANK key member', 'ZSCORE key member', 'ZREVRANGE key 0 -1'],
  HASH:   ['HSET key field val', 'HGET key field', 'HGETALL key', 'HDEL key field', 'HKEYS key'],
  STREAM: ['XADD key * field val', 'XRANGE key - +', 'XREAD COUNT 10 STREAMS key 0', 'XLEN key'],
};

const TYPE_DESCRIPTIONS: Record<RedisType, string> = {
  STRING: '文字列・JSON・カウンター',
  LIST:   'キュー・スタック・履歴',
  SET:    '重複なし集合・タグ',
  ZSET:   'スコア付き順位・ランキング',
  HASH:   'フィールド→値のマップ',
  STREAM: 'イベントログ・MQ',
};

interface KeyEntry { key: string; type: RedisType; value: unknown; ttl: number }

// ── type inference from raw value ──────────────────────────────
function inferType(value: unknown): RedisType {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null
        && 'm' in (value[0] as object) && 's' in (value[0] as object)) return 'ZSET';
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null
        && ('id' in (value[0] as object) && 'fields' in (value[0] as object))) return 'STREAM';
    return 'LIST';
  }
  if (value !== null && typeof value === 'object') return 'HASH';
  return 'STRING';
}

function byteSize(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

// ── sub-components ────────────────────────────────────────────
function Badge({ meta, children }: { meta: TypeMeta; children: React.ReactNode }) {
  return (
    <span className={`${meta.bgSubtle} ${meta.text} ${meta.border} border rounded px-1.5 py-px text-[11px] font-bold tracking-wide font-mono`}>
      {children}
    </span>
  );
}

function TTLBar({ ttl }: { ttl: number }) {
  if (ttl === -1) return <span className="text-redis-muted text-xs">∞</span>;
  const maxTTL = 3600;
  const pct = Math.max(0, Math.min(1, ttl / maxTTL));
  const colorClass = pct > 0.5 ? 'bg-redis-green' : pct > 0.2 ? 'bg-redis-amber' : 'bg-redis-red';
  const textClass = pct > 0.5 ? 'text-redis-green' : pct > 0.2 ? 'text-redis-amber' : 'text-redis-red';
  const label = ttl < 60 ? `${ttl}s` : ttl < 3600 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s` : `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-[60px] h-[5px] bg-redis-border rounded-sm overflow-hidden">
        <div className={`h-full rounded-sm ${colorClass}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={`${textClass} text-[11px] font-mono`}>{label}</span>
    </div>
  );
}

// ── value renderers ───────────────────────────────────────────
function StringValue({ v }: { v: unknown }) {
  const str = typeof v === 'string' ? v : JSON.stringify(v);
  let parsed: unknown = null;
  try { parsed = JSON.parse(str); } catch { /* not JSON */ }
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return (
      <div className="bg-redis-bg rounded-md p-2.5 text-xs font-mono leading-relaxed">
        <span className="text-redis-muted">{'{'}</span>
        {Object.entries(parsed as Record<string, unknown>).map(([k, val]) => (
          <div key={k} className="pl-4">
            <span className="text-redis-pink">&quot;{k}&quot;</span>
            <span className="text-redis-muted">: </span>
            <span className={typeof val === 'number' ? 'text-redis-orange' : 'text-redis-green'}>
              {typeof val === 'string' ? `"${val}"` : String(val)}
            </span>
          </div>
        ))}
        <span className="text-redis-muted">{'}'}</span>
      </div>
    );
  }
  return (
    <div className="bg-redis-bg rounded-md px-3 py-2 font-mono text-[13px] text-redis-green break-all">
      &quot;{str}&quot;
    </div>
  );
}

function ListValue({ v }: { v: unknown[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {v.map((item, i) => (
        <div key={i} className="flex items-center gap-2 bg-redis-bg rounded-[5px] px-2.5 py-1.5">
          <span className="text-redis-muted text-[11px] font-mono min-w-[22px] text-right">{i}</span>
          <div className="w-px h-4 bg-redis-border" />
          <span className="font-mono text-xs text-redis-blue">{String(item)}</span>
        </div>
      ))}
      <div className="text-[11px] text-redis-muted pt-0.5">{'← HEAD' + '\u00A0'.repeat(22) + 'TAIL →'}</div>
    </div>
  );
}

function HashValue({ v }: { v: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] bg-redis-bg rounded-md overflow-hidden font-mono text-xs">
      {Object.entries(v).map(([k, val], i) => (
        <div key={k} className="contents">
          <div className={`px-3 py-1.5 text-redis-pink ${i % 2 ? 'bg-redis-surface' : ''}`}>{k}</div>
          <div className={`px-3 py-1.5 text-redis-text ${i % 2 ? 'bg-redis-surface' : ''}`}>{String(val)}</div>
        </div>
      ))}
    </div>
  );
}

function ValuePane({ entry }: { entry: KeyEntry }) {
  const { type, value } = entry;
  if (type === 'LIST' && Array.isArray(value)) return <ListValue v={value} />;
  if (type === 'HASH' && typeof value === 'object' && value !== null && !Array.isArray(value))
    return <HashValue v={value as Record<string, unknown>} />;
  return <StringValue v={value} />;
}

// ── main component ────────────────────────────────────────────
export function RedisVisualizerPage() {
  const [entries, setEntries]     = useState<KeyEntry[]>([]);
  const [selected, setSelected]   = useState<string | null>(null);
  const [filterType, setFilter]   = useState<RedisType | 'ALL'>('ALL');
  const [search, setSearch]       = useState('');
  const [pattern, setPattern]     = useState('*');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cmd, setCmd]             = useState('');
  const [cmdOut, setCmdOut]       = useState<{ input: string; out: string; ts: string }[]>([]);
  const [tab, setTab]             = useState<'value' | 'commands' | 'info'>('value');
  const [isDeleting, setIsDeleting] = useState(false);
  const cmdRef = useRef<HTMLDivElement>(null);

  const loadKeys = useCallback(async (pat: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const searchRes = await cacheApi.searchKeys(pat, 200);
      const keys = searchRes.keys;
      if (keys.length === 0) {
        setEntries([]);
        return;
      }
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += 50) chunks.push(keys.slice(i, i + 50));

      const allEntries: KeyEntry[] = [];
      for (const chunk of chunks) {
        const res = await cacheApi.batchGet(chunk);
        for (const [key, value] of Object.entries(res.results)) {
          allEntries.push({ key, type: inferType(value), value, ttl: -1 });
        }
      }
      setEntries(allEntries);
      if (allEntries.length > 0 && !selected) {
        setSelected(allEntries[0].key);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setIsLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadKeys('*');
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps -- loadKeys depends on `selected` state; including it would re-fetch on every selection change

  const handleDelete = async (key: string) => {
    setIsDeleting(true);
    try {
      await cacheApi.delete(key);
      setEntries(prev => prev.filter(e => e.key !== key));
      if (selected === key) setSelected(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = entries.filter(e => {
    if (filterType !== 'ALL' && e.type !== filterType) return false;
    if (search && !e.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const entry = entries.find(e => e.key === selected) ?? null;
  const meta  = entry ? TYPE_META[entry.type] : null;

  const typeStats = (Object.keys(TYPE_META) as RedisType[]).map(t => ({
    type: t, count: entries.filter(e => e.type === t).length, meta: TYPE_META[t],
  })).filter(x => x.count > 0);

  function execCmd(ev: React.FormEvent) {
    ev.preventDefault();
    if (!cmd.trim()) return;
    setCmdOut(prev => [...prev, { input: cmd, out: `(ok) Simulated: ${cmd}`, ts: new Date().toLocaleTimeString() }]);
    setCmd('');
    setTimeout(() => { cmdRef.current?.scrollTo(0, 9999); }, 50);
  }

  const totalBytes = entries.reduce((a, e) => a + byteSize(e.value), 0);

  return (
    <div className="h-full bg-redis-bg text-redis-text font-mono flex flex-col">
      {/* toolbar */}
      <div className="bg-redis-surface border-b border-redis-border px-4 flex items-center gap-2.5 h-11 shrink-0">
        <span className="text-redis-red font-bold text-[13px] tracking-widest">REDIS</span>
        <span className="text-redis-dim text-xs">Visual Explorer</span>
        <div className="flex-1" />
        <form onSubmit={e => { e.preventDefault(); loadKeys(pattern); }} className="flex gap-1.5 items-center">
          <input
            value={pattern} onChange={e => setPattern(e.target.value)}
            placeholder="pattern: *"
            className="bg-redis-bg border border-redis-border rounded-[5px] px-2.5 py-1 text-redis-text text-xs outline-none w-40 font-mono"
          />
          <button type="submit" disabled={isLoading}
            className="bg-redis-green/10 border border-redis-green/30 text-redis-green rounded-[5px] px-3 py-1 text-[11px] cursor-pointer font-mono">
            {isLoading ? '...' : 'SCAN'}
          </button>
        </form>
        <div className="flex items-center gap-1.5">
          <div className="w-[7px] h-[7px] rounded-full bg-redis-green shadow-[0_0_5px_#3fb950]" />
          <span className="text-[11px] text-redis-dim">localhost:8080</span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-redis-red/10 border-b border-redis-red/25 text-redis-red text-xs">
          ⚠ {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── sidebar ── */}
        <div className="w-[300px] bg-redis-surface border-r border-redis-border flex flex-col overflow-hidden shrink-0">
          {/* type filter */}
          <div className="px-3 py-2 border-b border-redis-border flex gap-1.5 flex-wrap">
            <button onClick={() => setFilter('ALL')}
              className={`border rounded px-1.5 py-0.5 text-[11px] cursor-pointer font-mono ${
                filterType === 'ALL'
                  ? 'bg-redis-border border-redis-muted text-redis-text'
                  : 'bg-transparent border-redis-border text-redis-dim'
              }`}>ALL ({entries.length})</button>
            {typeStats.map(s => (
              <button key={s.type} onClick={() => setFilter(s.type)}
                className={`border rounded px-1.5 py-0.5 text-[11px] cursor-pointer font-mono ${
                  filterType === s.type
                    ? `${s.meta.bgSubtle} ${s.meta.border} ${s.meta.text}`
                    : 'bg-transparent border-redis-border text-redis-dim'
                }`}>{TYPE_META[s.type].icon} {s.count}</button>
            ))}
          </div>

          {/* search */}
          <div className="px-2.5 py-1.5 border-b border-redis-border">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  key filter..."
              className="w-full bg-redis-bg border border-redis-border rounded-[5px] px-2 py-1 text-redis-text text-xs outline-none box-border font-mono"
            />
          </div>

          {/* key list */}
          <div className="overflow-y-auto flex-1">
            {isLoading && (
              <div className="p-5 text-redis-dim text-xs text-center">Scanning...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-5 text-redis-muted text-xs text-center">
                {entries.length === 0 ? 'キーなし — まずキーをセットしてください' : 'フィルター結果なし'}
              </div>
            )}
            {filtered.map(e => {
              const m = TYPE_META[e.type];
              const active = e.key === selected;
              return (
                <div key={e.key} onClick={() => setSelected(e.key)}
                  className={`px-3 py-1.5 cursor-pointer transition-all duration-[120ms] border-l-[3px] ${
                    active
                      ? `${m.bgSubtle} ${m.border}`
                      : 'bg-transparent border-transparent'
                  }`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`${m.text} text-[10px] font-bold min-w-[12px]`}>{m.icon}</span>
                    <span className={`text-xs break-all flex-1 ${active ? 'text-redis-text' : 'text-redis-dim'}`}>{e.key}</span>
                    <button
                      onClick={ev => { ev.stopPropagation(); handleDelete(e.key); }}
                      disabled={isDeleting}
                      className="bg-transparent border-none text-redis-muted cursor-pointer text-sm px-0.5 leading-none"
                      title="削除"
                    >×</button>
                  </div>
                  <div className="pl-[18px]">
                    <TTLBar ttl={e.ttl} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer stats */}
          <div className="px-3 py-1.5 border-t border-redis-border text-[11px] text-redis-dim">
            <div className="flex justify-between">
              <span>Total keys</span><span className="text-redis-text">{entries.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory (est.)</span>
              <span className="text-redis-text">{(totalBytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>

        {/* ── detail panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {entry && meta ? (
            <>
              {/* key header */}
              <div className="bg-redis-surface border-b border-redis-border px-4 py-2.5 flex items-center gap-3 shrink-0">
                <Badge meta={meta}>{meta.label}</Badge>
                <span className="text-[13px] text-redis-text break-all">{entry.key}</span>
                <div className="ml-auto flex items-center gap-2.5">
                  <span className="text-[11px] text-redis-muted">TTL:</span>
                  <TTLBar ttl={entry.ttl} />
                  <span className="text-[11px] text-redis-muted">~{byteSize(entry.value)} bytes</span>
                </div>
              </div>

              {/* tabs */}
              <div className="flex border-b border-redis-border bg-redis-surface shrink-0">
                {(['value', 'commands', 'info'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-1.5 text-xs cursor-pointer bg-transparent border-none font-mono border-b-2 ${
                      tab === t
                        ? `${meta.text} ${meta.border}`
                        : 'text-redis-dim border-transparent'
                    }`}>{t.toUpperCase()}</button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-4">
                {tab === 'value' && (
                  <>
                    <div className="text-[11px] text-redis-muted mb-2.5">
                      {meta.label} — {
                        Array.isArray(entry.value) ? `${(entry.value as unknown[]).length} elements` :
                        typeof entry.value === 'object' && entry.value !== null ? `${Object.keys(entry.value).length} fields` :
                        `length: ${String(entry.value ?? '').length}`
                      }
                    </div>
                    <ValuePane entry={entry} />
                  </>
                )}

                {tab === 'commands' && (
                  <div>
                    <div className="text-[11px] text-redis-muted mb-3">よく使うコマンド — {meta.label}</div>
                    <div className="flex flex-col gap-1 mb-5">
                      {CMD_DOCS[entry.type].map((c, i) => (
                        <div key={i} onClick={() => setCmd(c)}
                          className="bg-redis-bg border border-redis-border rounded-[5px] px-3 py-1.5 font-mono text-xs text-redis-cyan cursor-pointer">
                          {c}
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-redis-muted mb-1.5">ターミナル (シミュレーション)</div>
                    <div ref={cmdRef} className="bg-redis-bg border border-redis-border rounded-md p-2.5 h-[140px] overflow-y-auto mb-2">
                      {cmdOut.length === 0 && <span className="text-redis-muted text-[11px]">上のコマンドをクリックして実行...</span>}
                      {cmdOut.map((o, i) => (
                        <div key={i} className="mb-1.5">
                          <div className="text-redis-green text-xs">127.0.0.1:6379&gt; {o.input}</div>
                          <div className="text-redis-dim text-xs pl-1">{o.out}</div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={execCmd} className="flex gap-2">
                      <span className="text-redis-green text-xs self-center">{'>'}</span>
                      <input
                        value={cmd} onChange={e => setCmd(e.target.value)}
                        placeholder="command..."
                        className="flex-1 bg-redis-bg border border-redis-border rounded px-2.5 py-1.5 text-redis-text text-xs outline-none font-mono"
                      />
                      <button type="submit"
                        className={`${meta.bgSubtle} ${meta.border} ${meta.text} border rounded px-3 py-1.5 cursor-pointer text-xs font-mono`}>
                        RUN
                      </button>
                    </form>
                  </div>
                )}

                {tab === 'info' && (
                  <div className="flex flex-col gap-1.5">
                    {([
                      ['Key',    entry.key],
                      ['Type',   entry.type],
                      ['TTL',    entry.ttl === -1 ? '∞ no expiry' : `${entry.ttl}s`],
                      ['Memory', `~${byteSize(entry.value)} bytes (estimated)`],
                      ['Inferred', `value type: ${entry.type}`],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="grid grid-cols-[140px_1fr] bg-redis-bg rounded-[5px] overflow-hidden">
                        <div className="px-3 py-1.5 text-redis-dim text-xs">{label}</div>
                        <div className="px-3 py-1.5 text-redis-text text-xs font-mono break-all">{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-redis-muted text-[13px]">
              {isLoading ? 'スキャン中...' : '← キーを選択してください'}
            </div>
          )}
        </div>

        {/* ── right panel: data structures ── */}
        <div className="w-[200px] bg-redis-surface border-l border-redis-border p-3 overflow-y-auto shrink-0">
          <div className="text-[11px] text-redis-muted mb-2.5 tracking-wider">DATA STRUCTURES</div>
          {(Object.entries(TYPE_META) as [RedisType, TypeMeta][]).map(([type, m]) => {
            const count = entries.filter(e => e.type === type).length;
            return (
              <div key={type}
                onClick={() => { setFilter(type); setSelected(entries.find(e => e.type === type)?.key ?? null); }}
                className={`mb-1.5 p-2 rounded-md border cursor-pointer transition-all duration-[120ms] ${
                  filterType === type
                    ? `${m.bgSubtle} ${m.border}`
                    : 'bg-redis-bg border-redis-border'
                }`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`${m.text} font-bold text-[13px]`}>{m.icon}</span>
                  <span className={`text-[10px] ${m.text} font-bold`}>{m.label}</span>
                  <span className="ml-auto text-[11px] text-redis-dim">{count}</span>
                </div>
                <div className="text-[10px] text-redis-muted leading-snug">
                  {TYPE_DESCRIPTIONS[type]}
                </div>
                {count > 0 && (
                  <div className={`mt-1 h-[3px] rounded-sm ${m.bg}/25 overflow-hidden`}>
                    <div className={`h-full ${m.bg}`}
                      style={{ width: `${Math.min(count / Math.max(entries.length, 1) * 100 * 3, 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
