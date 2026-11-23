import { useEffect, useCallback, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { toastsAtom, type Toast } from '@/app/store/atoms';
import * as css from './Toast.css';

const TYPE_CLASS: Record<Toast['type'], string> = {
  info: css.toastInfo,
  success: css.toastSuccess,
  error: css.toastError,
  warning: css.toastWarning,
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const duration = toast.duration ?? 4000;
  const remainingRef = useRef(duration);
  const startedAtRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (ms: number) => {
      clearTimer();
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(() => onDismiss(toast.id), ms);
    },
    [clearTimer, onDismiss, toast.id]
  );

  useEffect(() => {
    scheduleDismiss(duration);
    return clearTimer;
  }, [duration, scheduleDismiss, clearTimer]);

  const handlePause = useCallback(() => {
    if (paused) return;
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    clearTimer();
    setPaused(true);
  }, [paused, clearTimer]);

  const handleResume = useCallback(() => {
    if (!paused) return;
    setPaused(false);
    scheduleDismiss(remainingRef.current);
  }, [paused, scheduleDismiss]);

  const handleClick = () => {
    toast.onClick?.();
    onDismiss(toast.id);
  };

  const baseClass = TYPE_CLASS[toast.type];
  const role = toast.type === 'error' ? 'alert' : undefined;

  const hoverProps = {
    onMouseEnter: handlePause,
    onMouseLeave: handleResume,
    onFocus: handlePause,
    onBlur: handleResume,
  };

  if (toast.onClick) {
    return (
      <button
        type="button"
        className={`${baseClass} ${css.clickable}`}
        onClick={handleClick}
        {...hoverProps}
      >
        <span className={css.message} role={role}>
          {toast.message}
        </span>
        {toast.actionLabel && <span className={css.action}>{toast.actionLabel}</span>}
      </button>
    );
  }

  return (
    <div className={baseClass} {...hoverProps}>
      <span className={css.message} role={role}>
        {toast.message}
      </span>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useAtom(toastsAtom);

  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [setToasts]
  );

  return (
    <div className={css.container} role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
