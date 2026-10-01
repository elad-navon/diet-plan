import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './Button';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const VISIBLE_MS = 8000;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/** A polite live-region message with an optional action ("undo"). Auto-dismisses after 8 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    clearTimeout(timer.current);
    setToast(options);
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      >
        {toast && (
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-canvas shadow-lg">
            <span className="text-base">{toast.message}</span>
            {toast.actionLabel && (
              <Button
                variant="ghost"
                className="!text-canvas underline"
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
              >
                {toast.actionLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
