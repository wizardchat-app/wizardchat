import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { WatchTogetherInvite } from './WatchTogetherInvite';
import { WatchTogetherPlayer } from './WatchTogetherPlayer';
import { watchActionsAtom, watchStateAtom, watchingVideoIdAtom } from './watchTogether';
import * as css from './WatchTogether.css';

export const WATCH_TILE_KEY = 'watch-together';

interface Slot {
  el: HTMLElement;
  clip: HTMLElement | null;
  focused: boolean;
  compact: boolean;
  onSelect?: () => void;
}

const slotAtom = atom<Slot | null>(null);

function scrollParent(el: HTMLElement, stop: HTMLElement | null): HTMLElement | null {
  for (let node = el.parentElement; node && node !== stop; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (overflowX !== 'visible' || overflowY !== 'visible') return node;
  }
  return null;
}

interface SlotProps {
  startedByName: string;
  focused?: boolean;
  compact?: boolean;
  onSelect?: () => void;
}

export function WatchSlot({
  startedByName,
  focused = false,
  compact = false,
  onSelect,
}: SlotProps) {
  const state = useAtomValue(watchStateAtom);
  const watchingVideoId = useAtomValue(watchingVideoIdAtom);
  const setSlot = useSetAtom(slotAtom);
  const ref = useRef<HTMLDivElement>(null);
  const watching = !!state && watchingVideoId === state.videoId;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!watching || !el) return;
    setSlot({ el, clip: scrollParent(el, null), focused, compact, onSelect });
    return () => setSlot((prev) => (prev?.el === el ? null : prev));
  });

  if (!state) return null;
  if (!watching) {
    return (
      <div className={css.slot} onClick={onSelect}>
        <WatchTogetherInvite state={state} startedByName={startedByName} compact={compact} />
      </div>
    );
  }
  return <div ref={ref} className={css.slot} />;
}

interface LayerProps {
  rootRef: React.RefObject<HTMLElement | null>;
  startedByName: string;
}

export function WatchPlayerLayer({ rootRef, startedByName }: LayerProps) {
  const state = useAtomValue(watchStateAtom);
  const actions = useAtomValue(watchActionsAtom);
  const watchingVideoId = useAtomValue(watchingVideoIdAtom);
  const slot = useAtomValue(slotAtom);
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let last = '';
    let lastLayer: HTMLDivElement | null = null;
    const follow = () => {
      const layer = layerRef.current;
      if (layer !== lastLayer) {
        lastLayer = layer;
        last = '';
      }
      const root = rootRef.current;
      const current = slotRef.current;
      if (layer && root) {
        let next = 'hidden';
        if (current?.el.isConnected) {
          const box = current.el.getBoundingClientRect();
          const origin = root.getBoundingClientRect();
          const clip = current.clip?.getBoundingClientRect();
          const inset = clip
            ? [
                Math.max(0, clip.top - box.top),
                Math.max(0, box.right - clip.right),
                Math.max(0, box.bottom - clip.bottom),
                Math.max(0, clip.left - box.left),
              ]
            : [0, 0, 0, 0];
          next = [
            box.left - origin.left,
            box.top - origin.top,
            box.width,
            box.height,
            ...inset,
          ].join(',');
        }
        if (next !== last) {
          last = next;
          if (next === 'hidden') {
            layer.style.visibility = 'hidden';
          } else {
            const [left, top, width, height, t, r, b, l] = next.split(',').map(Number);
            Object.assign(layer.style, {
              visibility: '',
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              clipPath: t || r || b || l ? `inset(${t}px ${r}px ${b}px ${l}px)` : '',
            });
          }
        }
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [rootRef]);

  if (!state || !actions || watchingVideoId !== state.videoId) return null;
  const small = !!slot?.compact;
  return (
    <div ref={layerRef} className={css.layer} style={{ visibility: 'hidden' }}>
      <WatchTogetherPlayer
        state={state}
        compact={small}
        onUpdate={actions.update}
        onStop={actions.stop}
        onFocus={slot?.onSelect && !slot.focused ? slot.onSelect : undefined}
      />
      {small && slot?.onSelect && (
        <button
          type="button"
          className={css.layerSelect}
          onClick={slot.onSelect}
          aria-label={startedByName}
        />
      )}
    </div>
  );
}
