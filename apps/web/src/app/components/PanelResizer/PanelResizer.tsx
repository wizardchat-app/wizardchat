import { useCallback, useRef, useState } from 'react';
import * as css from './PanelResizer.css';

interface PanelResizerProps {
  width: number;
  onWidthChange: (width: number) => void;
  defaultWidth?: number;
  min?: number;
  max?: number;
  edge?: 'left' | 'right';
}

export function PanelResizer({
  width,
  onWidthChange,
  defaultWidth,
  min,
  max,
  edge = 'left',
}: PanelResizerProps) {
  const stateRef = useRef({ width, min, max });
  stateRef.current.width = width;
  stateRef.current.min = min;
  stateRef.current.max = max;
  const [dragging, setDragging] = useState(false);
  const direction = edge === 'left' ? -1 : 1;

  const clamp = useCallback((next: number) => {
    const { min, max } = stateRef.current;
    let value = next;
    if (min !== undefined) value = Math.max(min, value);
    if (max !== undefined) value = Math.min(max, value);
    return Math.round(value);
  }, []);

  const onDoubleClick = useCallback(() => {
    if (defaultWidth !== undefined) onWidthChange(defaultWidth);
  }, [defaultWidth, onWidthChange]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const rendered = e.currentTarget.parentElement?.getBoundingClientRect().width;
      const startWidth = clamp(rendered || stateRef.current.width);
      const onMove = (ev: PointerEvent) => {
        onWidthChange(clamp(startWidth + (ev.clientX - startX) * direction));
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [onWidthChange, clamp, direction]
  );

  return (
    <div
      className={`${css.handle} ${edge === 'left' ? css.handleLeft : css.handleRight}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      data-dragging={dragging ? 'true' : undefined}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
