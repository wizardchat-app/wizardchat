import { useEffect } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_SLOP = 10;
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function haptic() {
  navigator.vibrate?.(10);
}

export function useLongPressContextMenu(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;
    let touching = false;
    let fired = false;
    let suppressUntil = 0;

    const cancel = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const onStart = (e: TouchEvent) => {
      cancel();
      touching = true;
      fired = false;
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target || target.closest(EDITABLE)) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        timer = undefined;
        fired = true;
        window.getSelection()?.removeAllRanges();
        haptic();
        target.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
          })
        );
      }, LONG_PRESS_MS);
    };

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > MOVE_SLOP) cancel();
    };

    const onEnd = (e: TouchEvent) => {
      cancel();
      touching = e.touches.length > 0;
      if (fired) {
        if (e.cancelable) e.preventDefault();
        fired = false;
        suppressUntil = Date.now() + 500;
      }
    };

    const onNativeContextMenu = (e: MouseEvent) => {
      if (!e.isTrusted || (e.target as Element | null)?.closest?.(EDITABLE)) return;
      if (touching || Date.now() < suppressUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', onEnd);
    document.addEventListener('contextmenu', onNativeContextMenu, true);
    return () => {
      cancel();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.removeEventListener('contextmenu', onNativeContextMenu, true);
    };
  }, [enabled]);
}
