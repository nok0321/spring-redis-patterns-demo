import { useState, useRef, useEffect } from 'react';
import { cliApi } from '../../api/cli';

const ALLOWED_COMMANDS = [
  'GET', 'SET', 'SCAN', 'TTL', 'PTTL', 'TYPE',
  'INFO', 'LLEN', 'HGETALL', 'SMEMBERS', 'ZRANGE', 'ZCARD',
  'STRLEN', 'MEMORY USAGE', 'SLOWLOG GET',
];

interface Line {
  type: 'input' | 'output' | 'error';
  text: string;
}

const MAX_LINES = 100;

export function RedisCli() {
  const [lines, setLines] = useState<Line[]>([
    { type: 'output', text: '# Redis CLI (ホワイトリスト制限あり)' },
    { type: 'output', text: '# 使用可能コマンド: ' + ALLOWED_COMMANDS.slice(0, 5).join(', ') + ' ...' },
    { type: 'output', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<string[]>([]);
  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [lines]);

  const appendLines = (newLines: Line[]) => {
    setLines(prev => [...prev, ...newLines].slice(-MAX_LINES));
  };

  const handleExecute = async () => {
    const cmd = input.trim();
    if (!cmd) return;

    historyRef.current = [cmd, ...historyRef.current.slice(0, 49)];
    setHistoryIndex(-1);
    appendLines([{ type: 'input', text: `redis> ${cmd}` }]);
    setInput('');
    setLoading(true);

    try {
      const res = await cliApi.execute(cmd);
      if (res.error) {
        appendLines([{ type: 'error', text: `(error) ${res.error}` }]);
      } else {
        const resultText = res.result ?? '(nil)';
        appendLines([
          { type: 'output', text: resultText },
          { type: 'output', text: `  ↳ ${res.executionMs}ms` },
        ]);
      }
    } catch (e) {
      appendLines([{ type: 'error', text: `(network error) ${e instanceof Error ? e.message : ''}` }]);
    } finally {
      setLoading(false);
    }
    appendLines([{ type: 'output', text: '' }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
      return;
    }

    const hist = historyRef.current;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(historyIndex + 1, hist.length - 1);
      setHistoryIndex(idx);
      setInput(hist[idx] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setInput(idx < 0 ? '' : (hist[idx] ?? ''));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Autocomplete
      const upper = input.toUpperCase();
      const match = ALLOWED_COMMANDS.find(c => c.startsWith(upper));
      if (match) setInput(match + ' ');
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-black rounded-lg font-mono text-sm overflow-hidden border border-gray-700"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal output */}
      <div
        ref={termRef}
        className="flex-1 overflow-y-auto p-4 space-y-0 leading-5"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'input' ? 'text-green-400' :
              line.type === 'error' ? 'text-red-400' :
              'text-gray-300'
            }
          >
            {line.text || '\u00A0'}
          </div>
        ))}
        {loading && (
          <div className="text-yellow-400 animate-pulse">...</div>
        )}
      </div>

      {/* Input line */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-800">
        <span className="text-green-400 shrink-0">redis&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1 bg-transparent text-green-400 outline-none caret-green-400 placeholder-gray-600"
          placeholder="コマンドを入力 (Tab で補完, ↑↓ で履歴)"
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
}
