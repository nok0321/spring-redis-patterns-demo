import { RedisCli } from '../components/cli/RedisCli';

const ALLOWED_COMMANDS = [
  { cmd: 'GET <key>',          desc: 'String 値を取得' },
  { cmd: 'SET <key> <value>',  desc: 'String 値を設定' },
  { cmd: 'KEYS <pattern>',     desc: 'パターンでキー検索' },
  { cmd: 'SCAN 0',             desc: 'キーのスキャン' },
  { cmd: 'TTL <key>',          desc: '残り TTL (秒)' },
  { cmd: 'PTTL <key>',         desc: '残り TTL (ミリ秒)' },
  { cmd: 'TYPE <key>',         desc: 'キーのデータ型' },
  { cmd: 'STRLEN <key>',       desc: '文字列長' },
  { cmd: 'LLEN <key>',         desc: 'リスト長' },
  { cmd: 'HGETALL <key>',      desc: 'ハッシュ全取得' },
  { cmd: 'SMEMBERS <key>',     desc: 'セット全取得' },
  { cmd: 'ZRANGE <key> 0 -1',  desc: 'ソート済みセット取得' },
  { cmd: 'ZCARD <key>',        desc: 'ソート済みセット件数' },
  { cmd: 'INFO',               desc: 'サーバー情報' },
  { cmd: 'MEMORY USAGE <key>', desc: 'メモリ使用量' },
  { cmd: 'SLOWLOG GET',        desc: 'スローログ取得' },
];

export function RedisCliPage() {
  return (
    <div className="p-6 flex gap-6 h-[calc(100vh-48px)]">
      {/* Terminal */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-white">Redis CLI</h1>
          <p className="text-gray-400 text-sm mt-1">
            ブラウザ内から Redis コマンドを実行できます（ホワイトリスト制限あり）
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <RedisCli />
        </div>
      </div>

      {/* Command reference */}
      <div className="w-64 shrink-0">
        <div className="bg-gray-800 rounded-lg p-4 sticky top-0">
          <h2 className="text-white font-semibold text-sm mb-3">使用可能コマンド</h2>
          <div className="space-y-1.5 text-xs">
            {ALLOWED_COMMANDS.map(({ cmd, desc }) => (
              <div key={cmd} className="space-y-0">
                <div className="text-green-300 font-mono">{cmd}</div>
                <div className="text-gray-500">{desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-600">
            <div>Tab: コマンド補完</div>
            <div>↑/↓: コマンド履歴</div>
            <div>Enter: 実行</div>
          </div>
        </div>
      </div>
    </div>
  );
}
