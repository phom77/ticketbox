import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { ToastContext } from './toast-context';

type ToastType = 'success' | 'error';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const toast = { id: ++nextId.current, message, type };
    setToasts([toast]);
  }, []);

  const value = useMemo(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(
      () => onDismiss(toast.id),
      toast.type === 'error' ? 7000 : 5000,
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id, toast.type]);

  const Icon = toast.type === 'success' ? CheckCircle2 : CircleAlert;

  return (
    <div
      className={`toast-item toast-${toast.type}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" size={19} />
      <p>{toast.message}</p>
      <button type="button" aria-label="Đóng thông báo" onClick={() => onDismiss(toast.id)}>
        <X aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
