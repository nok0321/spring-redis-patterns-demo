import type { ToastItem } from '../../hooks/useToast';

const variantClasses: Record<ToastItem['variant'], string> = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  warning: 'bg-yellow-500',
  info:    'bg-blue-600',
};

interface Props { toasts: ToastItem[] }

export function ToastContainer({ toasts }: Props) {
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${variantClasses[t.variant]} text-white px-4 py-2 rounded shadow-lg text-sm max-w-xs`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
