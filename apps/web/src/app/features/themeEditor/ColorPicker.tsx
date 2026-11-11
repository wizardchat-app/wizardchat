import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { hexToHsv, hsvToHex } from '@/theme/customTheme';
import * as css from './ThemeEditor.css';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onMove(
      clamp((e.clientX - rect.left) / rect.width),
      clamp((e.clientY - rect.top) / rect.height)
    );
  };
  return {
    ref,
    onPointerDown: (e: PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    },
    onPointerMove: (e: PointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
    },
  };
}

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  useEffect(() => {
    if (hsvToHex(...hsv) !== value) setHsv(hexToHsv(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (next: [number, number, number]) => {
    setHsv(next);
    onChange(hsvToHex(...next));
  };
  const [h, s, v] = hsv;

  const square = useDrag((x, y) => update([h, x, 1 - y]));
  const hue = useDrag((x) => update([x * 359.9, s, v]));

  const squareKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    update([h, clamp(s + move[0]), clamp(v + move[1])]);
  };
  const hueKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 4;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    update([(h + delta + 360) % 360, s, v]);
  };

  return (
    <div className={css.picker}>
      <div
        {...square}
        className={css.square}
        style={{ backgroundColor: hsvToHex(h, 1, 1) }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(s * 100)}
        aria-valuetext={value}
        onKeyDown={squareKey}
      >
        <span
          className={css.squareThumb}
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, backgroundColor: value }}
        />
      </div>
      <div
        {...hue}
        className={css.hue}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        onKeyDown={hueKey}
      >
        <span
          className={css.hueThumb}
          style={{ left: `${(h / 360) * 100}%`, backgroundColor: hsvToHex(h, 1, 1) }}
        />
      </div>
    </div>
  );
}
