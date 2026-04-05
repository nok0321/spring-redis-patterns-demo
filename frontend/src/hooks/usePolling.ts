import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval: number;
  enabled?: boolean;
}

interface UsePollingResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  refetch: () => void;
}

export function usePolling<T>({
  fetcher,
  interval,
  enabled = true,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // enabled=false のときは即座にロード完了とみなす（ポーリング自体が行われないため）
  const [isLoading, setIsLoading] = useState(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // fetcher を ref で保持することで、呼び出し側が useCallback を使わずに
  // インラインで fetcher を渡しても useEffect が再実行されない。
  // これにより fetcher の参照が変わるたびにポーリングが重複登録されるバグを防ぐ。
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // enabledRef / intervalRef を保持することで、setTimeout コールバック内から
  // 最新の値を参照できる（クロージャの stale 問題を回避）。
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setIsLoading(false);
      // fetch 完了後に次回タイマーを再アーム（fetch が interval より長くかかっても重複しない）
      if (enabledRef.current) {
        timerRef.current = setTimeout(run, intervalRef.current);
      }
    }
  }, []); // fetcherRef / enabledRef / intervalRef は ref なので依存配列に含めない

  useEffect(() => {
    if (!enabled) return;
    run();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, interval, run]);

  return { data, error, isLoading, refetch: run };
}
