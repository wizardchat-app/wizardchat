import { useEffect, useRef, type RefObject } from 'react';

const EDGE_WIDTH = 24;
const LONG_PRESS_MS = 450;
const MOVE_SLOP = 10;
const SWIPE_TRIGGER = 64;
const SWIPE_MAX = 96;
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const OPEN_LAYER =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-back-escape]';

function navigateBack(): boolean {
  if (document.querySelector(OPEN_LAYER)) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  const overlays = document.querySelectorAll<HTMLElement>('[data-back-dismiss]');
  const overlay = overlays[overlays.length - 1];
  if (overlay) {
    overlay.click();
    return true;
  }
  if (document.querySelector('[data-back-root]')) return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) {
    window.history.back();
    return true;
  }
  return false;
}

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

interface SwipeTarget {
  slide: HTMLElement;
  reveal?: HTMLElement;
}

function onScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.left < window.innerWidth - 1 && rect.right > 1;
}

function findSwipeTarget(): SwipeTarget | null {
  const layers = document.querySelectorAll<HTMLElement>(OPEN_LAYER);
  if (layers.length > 0) {
    const panel = layers[layers.length - 1].closest<HTMLElement>('[data-swipe-back="panel"]');
    return panel ? { slide: panel } : null;
  }
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-swipe-back="panel"]')
  ).filter(onScreen);
  if (panels.length > 0) return { slide: panels[panels.length - 1] };
  const screen = document.querySelector<HTMLElement>('[data-swipe-back="screen"]');
  const list = document.querySelector<HTMLElement>('[data-swipe-back-reveal]');
  if (screen && list && !onScreen(list)) return { slide: screen, reveal: list };
  return null;
}

const SETTLE_MS = 250;
const SETTLE = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;

function placeSwipe(target: SwipeTarget, dx: number, animate: boolean) {
  const { slide, reveal } = target;
  const transition = animate ? SETTLE : 'none';
  slide.style.transition = transition;
  slide.style.transform = `translateX(${dx}px)`;
  slide.style.boxShadow = '-8px 0 24px rgba(0, 0, 0, 0.35)';
  if (reveal) {
    slide.style.zIndex = '1';
    reveal.style.zIndex = '0';
    reveal.style.transition = transition;
    reveal.style.transform = `translateX(${(dx - window.innerWidth) * 0.3}px)`;
  }
}

function clearSwipe(target: SwipeTarget) {
  for (const el of [target.slide, target.reveal]) {
    if (!el) continue;
    el.style.transition = '';
    el.style.transform = '';
    el.style.boxShadow = '';
    el.style.zIndex = '';
  }
}

export function useEdgeSwipeBack(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let mode: 'pending' | 'drag' | null = null;
    let target: SwipeTarget | null = null;
    let dx = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let settling = false;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      mode = null;
      if (settling || e.touches.length !== 1 || touch.clientX > EDGE_WIDTH) return;
      start = { x: touch.clientX, y: touch.clientY };
      target = findSwipeTarget();
      mode = 'pending';
      dx = 0;
      velocity = 0;
      lastX = touch.clientX;
      lastTime = e.timeStamp;
    };

    const onMove = (e: TouchEvent) => {
      if (!mode || !start) return;
      const touch = e.touches[0];
      const mx = touch.clientX - start.x;
      const my = touch.clientY - start.y;
      if (mode === 'pending') {
        if (Math.abs(my) > MOVE_SLOP && Math.abs(my) > mx) {
          mode = null;
          return;
        }
        if (mx <= MOVE_SLOP) return;
        mode = 'drag';
      }
      if (e.cancelable) e.preventDefault();
      if (e.timeStamp > lastTime) velocity = (touch.clientX - lastX) / (e.timeStamp - lastTime);
      lastX = touch.clientX;
      lastTime = e.timeStamp;
      dx = Math.max(0, mx);
      if (target) placeSwipe(target, dx, false);
    };

    const onEnd = () => {
      const dragged = mode === 'drag';
      mode = null;
      start = null;
      if (!dragged) return;
      const done = dx > window.innerWidth * 0.35 || velocity > 0.5;
      const current = target;
      target = null;
      if (!current) {
        if (dx > SWIPE_TRIGGER) navigateBack();
        return;
      }
      settling = true;
      placeSwipe(current, done ? window.innerWidth : 0, true);
      setTimeout(() => {
        if (done) navigateBack();
        setTimeout(
          () => {
            clearSwipe(current);
            settling = false;
          },
          done ? 350 : 0
        );
      }, SETTLE_MS);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);
}

export function useSwipeToReply(
  rowRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  iconRef: RefObject<HTMLElement | null>,
  onSwipe: () => void,
  enabled: boolean
) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    const row = rowRef.current;
    if (!row || !enabled) return;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let mode: 'pending' | 'swipe' | null = null;

    const apply = (x: number, animate: boolean) => {
      const content = contentRef.current;
      const icon = iconRef.current;
      const transition = animate ? 'transform 0.2s ease, opacity 0.2s ease' : '';
      if (content) {
        content.style.transition = transition;
        content.style.transform = x ? `translateX(${x}px)` : '';
      }
      if (icon) {
        const progress = Math.min(1, x / SWIPE_TRIGGER);
        icon.style.transition = transition;
        icon.style.opacity = String(progress);
        icon.style.transform = `translateY(-50%) scale(${0.6 + progress * 0.4})`;
      }
    };

    const onStart = (e: TouchEvent) => {
      mode = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = e.target as Element | null;
      if (touch.clientX <= EDGE_WIDTH || target?.closest(`pre, ${EDITABLE}, [data-no-swipe]`))
        return;
      startX = touch.clientX;
      startY = touch.clientY;
      dx = 0;
      mode = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (!mode) return;
      const touch = e.touches[0];
      const mx = touch.clientX - startX;
      const my = touch.clientY - startY;
      if (mode === 'pending') {
        if (Math.abs(my) > MOVE_SLOP && Math.abs(my) >= Math.abs(mx)) {
          mode = null;
          return;
        }
        if (mx > MOVE_SLOP && mx > Math.abs(my) * 1.5) mode = 'swipe';
        else return;
      }
      if (e.cancelable) e.preventDefault();
      const next = Math.min(SWIPE_MAX, Math.max(0, mx - MOVE_SLOP));
      if (dx < SWIPE_TRIGGER && next >= SWIPE_TRIGGER) haptic();
      dx = next;
      apply(dx, false);
    };

    const onEnd = () => {
      if (mode === 'swipe') {
        if (dx >= SWIPE_TRIGGER) onSwipeRef.current();
        apply(0, true);
      }
      mode = null;
    };

    row.addEventListener('touchstart', onStart, { passive: true });
    row.addEventListener('touchmove', onMove, { passive: false });
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);
    return () => {
      row.removeEventListener('touchstart', onStart);
      row.removeEventListener('touchmove', onMove);
      row.removeEventListener('touchend', onEnd);
      row.removeEventListener('touchcancel', onEnd);
      apply(0, false);
    };
  }, [rowRef, contentRef, iconRef, enabled]);
}
