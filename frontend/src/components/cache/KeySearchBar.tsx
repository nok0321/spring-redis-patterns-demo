import { Search } from 'lucide-react';

interface KeySearchBarProps {
  pattern: string;
  onPatternChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
}

export function KeySearchBar({ pattern, onPatternChange, onSearch, isSearching }: KeySearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="パターンまたはキーを入力... 例: demo:*, user:*, session:user:1"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={onSearch}
        disabled={isSearching}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
      >
        {isSearching ? '検索中...' : '検索'}
      </button>
    </div>
  );
}
