import { useState, useCallback, useRef, useEffect } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, variant }]);
    const timerId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      // 発火済みの timer ID を配列から除去して unbounded growth を防ぐ
      timerIdsRef.current = timerIdsRef.current.filter(tid => tid !== timerId);
    }, 3000);
    timerIdsRef.current.push(timerId);
  }, []);

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach(id => clearTimeout(id));
    };
  }, []);

  return { toasts, addToast };
}
