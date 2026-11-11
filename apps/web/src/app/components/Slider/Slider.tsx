import * as css from './Slider.css';

interface SliderProps {
  value: number;
  stops: number[];
  onChange: (value: number) => void;
  defaultValue?: number;
  format?: (value: number) => string;
  'aria-label'?: string;
  onDoubleClick?: () => void;
  labels?: boolean;
  className?: string;
}

function nearestIndex(stops: number[], value: number): number {
  let best = 0;
  stops.forEach((stop, i) => {
    if (Math.abs(stop - value) < Math.abs(stops[best] - value)) best = i;
  });
  return best;
}

export function Slider({
  value,
  stops,
  onChange,
  defaultValue,
  format = String,
  'aria-label': ariaLabel,
  onDoubleClick,
  labels = true,
  className,
}: SliderProps) {
  const index = nearestIndex(stops, value);
  const last = Math.max(stops.length - 1, 1);

  return (
    <div className={className ? `${css.root} ${className}` : css.root}>
      {labels && (
        <div className={css.ticks} aria-hidden="true">
          {stops.map((stop, i) => (
            <button
              key={stop}
              type="button"
              tabIndex={-1}
              className={stop === defaultValue ? css.tickDefault : css.tick}
              style={{
                left: `calc(${css.THUMB_SIZE / 2}px + ${i / last} * (100% - ${css.THUMB_SIZE}px))`,
              }}
              onClick={() => onChange(stop)}
            >
              {format(stop)}
            </button>
          ))}
        </div>
      )}
      <input
        type="range"
        className={css.input}
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(stops[Number(e.target.value)])}
        onDoubleClick={onDoubleClick}
        aria-label={ariaLabel}
        aria-valuetext={format(stops[index])}
      />
    </div>
  );
}
