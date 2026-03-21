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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // fetcher を ref で保持することで、呼び出し側が useCallback を使わずに
  // インラインで fetcher を渡しても useEffect が再実行されない。
  // これにより fetcher の参照が変わるたびにポーリングが重複登録されるバグを防ぐ。
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setIsLoading(false);
    }
  }, []); // fetcherRef は ref なので依存配列に含めない

  useEffect(() => {
    if (!enabled) return;
    run();
    timerRef.current = setInterval(run, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, interval, run]);

  return { data, error, isLoading, refetch: run };
}
