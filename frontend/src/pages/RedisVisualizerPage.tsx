import { useState, useEffect, useRef, useCallback } from 'react';
import { cacheApi } from '../api/cache';

// ── color palette ──────────────────────────────────────────────
const C = {
  bg:      '#0d1117',
  surface: '#161b22',
  border:  '#30363d',
  muted:   '#484f58',
  text:    '#e6edf3',
  dim:     '#8b949e',
  green:   '#3fb950',
  cyan:    '#39d0d0',
  amber:   '#d29922',
  red:     '#f85149',
  purple:  '#a371f7',
  blue:    '#58a6ff',
  pink:    '#f778ba',
  orange:  '#ffa657',
};

type RedisType = 'STRING' | 'LIST' | 'SET' | 'ZSET' | 'HASH' | 'STREAM';

const TYPE_META: Record<RedisType, { label: string; color: string; icon: string }> = {
  STRING: { label: 'STRING',     color: C.green,  icon: 'S' },
  LIST:   { label: 'LIST',       color: C.blue,   icon: 'L' },
  SET:    { label: 'SET',        color: C.purple, icon: '∅' },
  ZSET:   { label: 'SORTED SET', color: C.amber,  icon: 'Z' },
  HASH:   { label: 'HASH',       color: C.pink,   icon: 'H' },
  STREAM: { label: 'STREAM',     color: C.orange, icon: '≋' },
};

const CMD_DOCS: Record<RedisType, string[]> = {
  STRING: ['GET key', 'SET key value [EX seconds]', 'INCR key', 'APPEND key value', 'STRLEN key'],
  LIST:   ['LPUSH key val', 'RPUSH key val', 'LPOP key', 'RPOP key', 'LRANGE key 0 -1', 'LLEN key'],
  SET:    ['SADD key member', 'SREM key member', 'SMEMBERS key', 'SISMEMBER key m', 'SUNION k1 k2'],
  ZSET:   ['ZADD key score member', 'ZRANGE key 0 -1', 'ZRANK key member', 'ZSCORE key member', 'ZREVRANGE key 0 -1'],
  HASH:   ['HSET key field val', 'HGET key field', 'HGETALL key', 'HDEL key field', 'HKEYS key'],
  STREAM: ['XADD key * field val', 'XRANGE key - +', 'XREAD COUNT 10 STREAMS key 0', 'XLEN key'],
};

interface KeyEntry {
  key: string;
  type: RedisType;
  value: unknown;
  ttl: number;
}

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
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.05em', fontFamily: 'monospace',
    }}>{children}</span>
  );
}

function TTLBar({ ttl }: { ttl: number }) {
  if (ttl === -1) return <span style={{ color: C.muted, fontSize: 12 }}>∞</span>;
  const maxTTL = 3600;
  const pct = Math.max(0, Math.min(1, ttl / maxTTL));
  const col = pct > 0.5 ? C.green : pct > 0.2 ? C.amber : C.red;
  const label = ttl < 60 ? `${ttl}s` : ttl < 3600 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s` : `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: col, borderRadius: 3 }} />
      </div>
      <span style={{ color: col, fontSize: 11, fontFamily: 'monospace' }}>{label}</span>
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
      <div style={{ background: C.bg, borderRadius: 6, padding: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.7 }}>
        <span style={{ color: C.muted }}>{'{'}</span>
        {Object.entries(parsed as Record<string, unknown>).map(([k, val]) => (
          <div key={k} style={{ paddingLeft: 16 }}>
            <span style={{ color: C.pink }}>"{k}"</span>
            <span style={{ color: C.muted }}>: </span>
            <span style={{ color: typeof val === 'number' ? C.orange : C.green }}>
              {typeof val === 'string' ? `"${val}"` : String(val)}
            </span>
          </div>
        ))}
        <span style={{ color: C.muted }}>{'}'}</span>
      </div>
    );
  }
  return (
    <div style={{ background: C.bg, borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace', fontSize: 13, color: C.green, wordBreak: 'break-all' }}>
      "{str}"
    </div>
  );
}

function ListValue({ v }: { v: unknown[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {v.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 5, padding: '5px 10px' }}>
          <span style={{ color: C.muted, fontSize: 11, fontFamily: 'monospace', minWidth: 22, textAlign: 'right' }}>{i}</span>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.blue }}>{String(item)}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: C.muted, paddingTop: 2 }}>← HEAD &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; TAIL →</div>
    </div>
  );
}

function HashValue({ v }: { v: Record<string, unknown> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '3px 0', background: C.bg, borderRadius: 6, overflow: 'hidden', fontFamily: 'monospace', fontSize: 12 }}>
      {Object.entries(v).map(([k, val], i) => (
        <><div key={k + '_k'} style={{ padding: '5px 12px', background: i % 2 ? C.surface : 'transparent', color: C.pink }}>{k}</div>
          <div key={k + '_v'} style={{ padding: '5px 12px', background: i % 2 ? C.surface : 'transparent', color: C.text }}>{String(val)}</div></>
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
      // Batch fetch values for up to 50 keys at once
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += 50) chunks.push(keys.slice(i, i + 50));

      const allEntries: KeyEntry[] = [];
      for (const chunk of chunks) {
        const res = await cacheApi.batchGet(chunk);
        for (const [key, value] of Object.entries(res.results)) {
          allEntries.push({ key, type: inferType(value), value, ttl: -1 });
        }
        // Keys with no value (Redisson internal / non-STRING type keys) are silently skipped
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
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

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
    type: t, count: entries.filter(e => e.type === t).length, color: TYPE_META[t].color,
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
    <div style={{
      height: '100%', background: C.bg, color: C.text,
      fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* toolbar */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, height: 44,
        flexShrink: 0,
      }}>
        <span style={{ color: C.red, fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}>REDIS</span>
        <span style={{ color: C.dim, fontSize: 12 }}>Visual Explorer</span>
        <div style={{ flex: 1 }} />
        <form onSubmit={e => { e.preventDefault(); loadKeys(pattern); }}
          style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={pattern} onChange={e => setPattern(e.target.value)}
            placeholder="pattern: *"
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 10px', color: C.text, fontSize: 12, outline: 'none', width: 160, fontFamily: 'monospace' }}
          />
          <button type="submit" disabled={isLoading} style={{
            background: C.green + '22', border: `1px solid ${C.green}55`, color: C.green,
            borderRadius: 5, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
          }}>{isLoading ? '...' : 'SCAN'}</button>
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
          <span style={{ fontSize: 11, color: C.dim }}>localhost:8080</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 16px', background: C.red + '22', borderBottom: `1px solid ${C.red}44`, color: C.red, fontSize: 12 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── sidebar ── */}
        <div style={{ width: 300, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* type filter */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button onClick={() => setFilter('ALL')} style={{
              background: filterType === 'ALL' ? C.border : 'transparent',
              border: `1px solid ${filterType === 'ALL' ? C.muted : C.border}`,
              color: filterType === 'ALL' ? C.text : C.dim,
              borderRadius: 4, padding: '2px 7px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
            }}>ALL ({entries.length})</button>
            {typeStats.map(s => (
              <button key={s.type} onClick={() => setFilter(s.type)} style={{
                background: filterType === s.type ? s.color + '22' : 'transparent',
                border: `1px solid ${filterType === s.type ? s.color : C.border}`,
                color: filterType === s.type ? s.color : C.dim,
                borderRadius: 4, padding: '2px 7px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
              }}>{TYPE_META[s.type].icon} {s.count}</button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  key filter..."
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 8px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
          </div>

          {/* key list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading && (
              <div style={{ padding: 20, color: C.dim, fontSize: 12, textAlign: 'center' }}>Scanning...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div style={{ padding: 20, color: C.muted, fontSize: 12, textAlign: 'center' }}>
                {entries.length === 0 ? 'キーなし — まずキーをセットしてください' : 'フィルター結果なし'}
              </div>
            )}
            {filtered.map(e => {
              const m = TYPE_META[e.type];
              const active = e.key === selected;
              return (
                <div key={e.key} onClick={() => setSelected(e.key)} style={{
                  padding: '7px 12px', cursor: 'pointer',
                  background: active ? m.color + '18' : 'transparent',
                  borderLeft: `3px solid ${active ? m.color : 'transparent'}`,
                  transition: 'all 0.12s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: m.color, fontSize: 10, fontWeight: 700, minWidth: 12 }}>{m.icon}</span>
                    <span style={{ fontSize: 12, color: active ? C.text : C.dim, wordBreak: 'break-all', flex: 1 }}>{e.key}</span>
                    <button
                      onClick={ev => { ev.stopPropagation(); handleDelete(e.key); }}
                      disabled={isDeleting}
                      style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                      title="削除"
                    >×</button>
                  </div>
                  <div style={{ paddingLeft: 18 }}>
                    <TTLBar ttl={e.ttl} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer stats */}
          <div style={{ padding: '7px 12px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.dim }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total keys</span><span style={{ color: C.text }}>{entries.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Memory (est.)</span>
              <span style={{ color: C.text }}>{(totalBytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>

        {/* ── detail panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {entry && meta ? (
            <>
              {/* key header */}
              <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <Badge color={meta.color}>{meta.label}</Badge>
                <span style={{ fontSize: 13, color: C.text, wordBreak: 'break-all' }}>{entry.key}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>TTL:</span>
                  <TTLBar ttl={entry.ttl} />
                  <span style={{ fontSize: 11, color: C.muted }}>~{byteSize(entry.value)} bytes</span>
                </div>
              </div>

              {/* tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                {(['value', 'commands', 'info'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '7px 16px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: 'none',
                    borderBottom: tab === t ? `2px solid ${meta.color}` : '2px solid transparent',
                    color: tab === t ? meta.color : C.dim, fontFamily: 'monospace',
                  }}>{t.toUpperCase()}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
                {tab === 'value' && (
                  <>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
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
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>よく使うコマンド — {meta.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
                      {CMD_DOCS[entry.type].map((c, i) => (
                        <div key={i} onClick={() => setCmd(c)} style={{
                          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
                          padding: '7px 12px', fontFamily: 'monospace', fontSize: 12, color: C.cyan, cursor: 'pointer',
                        }}>{c}</div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>ターミナル (シミュレーション)</div>
                    <div ref={cmdRef} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, height: 140, overflowY: 'auto', marginBottom: 8 }}>
                      {cmdOut.length === 0 && <span style={{ color: C.muted, fontSize: 11 }}>上のコマンドをクリックして実行...</span>}
                      {cmdOut.map((o, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ color: C.green, fontSize: 12 }}>127.0.0.1:6379&gt; {o.input}</div>
                          <div style={{ color: C.dim, fontSize: 12, paddingLeft: 4 }}>{o.out}</div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={execCmd} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: C.green, fontSize: 12, alignSelf: 'center' }}>{'>'}</span>
                      <input
                        value={cmd} onChange={e => setCmd(e.target.value)}
                        placeholder="command..."
                        style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 10px', color: C.text, fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
                      />
                      <button type="submit" style={{ background: meta.color + '22', border: `1px solid ${meta.color}55`, color: meta.color, borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace' }}>RUN</button>
                    </form>
                  </div>
                )}

                {tab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      ['Key',    entry.key],
                      ['Type',   entry.type],
                      ['TTL',    entry.ttl === -1 ? '∞ no expiry' : `${entry.ttl}s`],
                      ['Memory', `~${byteSize(entry.value)} bytes (estimated)`],
                      ['Inferred', `value type: ${entry.type}`],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ padding: '7px 12px', color: C.dim, fontSize: 12 }}>{label}</div>
                        <div style={{ padding: '7px 12px', color: C.text, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
              {isLoading ? 'スキャン中...' : '← キーを選択してください'}
            </div>
          )}
        </div>

        {/* ── right panel: data structures ── */}
        <div style={{ width: 200, background: C.surface, borderLeft: `1px solid ${C.border}`, padding: 12, overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: '0.08em' }}>DATA STRUCTURES</div>
          {(Object.entries(TYPE_META) as [RedisType, typeof TYPE_META[RedisType]][]).map(([type, m]) => {
            const count = entries.filter(e => e.type === type).length;
            return (
              <div key={type} onClick={() => { setFilter(type); setSelected(entries.find(e => e.type === type)?.key ?? null); }}
                style={{
                  marginBottom: 7, padding: '8px 9px', borderRadius: 6,
                  background: filterType === type ? m.color + '18' : C.bg,
                  border: `1px solid ${filterType === type ? m.color : C.border}`,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ color: m.color, fontWeight: 700, fontSize: 13 }}>{m.icon}</span>
                  <span style={{ fontSize: 10, color: m.color, fontWeight: 700 }}>{m.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>{count}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
                  {type === 'STRING' && '文字列・JSON・カウンター'}
                  {type === 'LIST'   && 'キュー・スタック・履歴'}
                  {type === 'SET'    && '重複なし集合・タグ'}
                  {type === 'ZSET'   && 'スコア付き順位・ランキング'}
                  {type === 'HASH'   && 'フィールド→値のマップ'}
                  {type === 'STREAM' && 'イベントログ・MQ'}
                </div>
                {count > 0 && (
                  <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: m.color + '44', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(count / Math.max(entries.length, 1) * 100 * 3, 100)}%`, height: '100%', background: m.color }} />
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
