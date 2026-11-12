import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import * as css from './Calendar.css';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  onSubmit?: () => void;
  max?: Date;
  autoFocus?: boolean;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

function firstDayOfWeek(language: string): number {
  try {
    const locale = new Intl.Locale(language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    return info ? info.firstDay % 7 : 1;
  } catch {
    return 1;
  }
}

export function Calendar({ value, onChange, onSubmit, max, autoFocus }: Props) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusPending = useRef(false);
  const limit = max ? startOfDay(max) : undefined;
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    dayRefs.current.get(value.toDateString())?.focus();
  });

  const weekStart = useMemo(() => firstDayOfWeek(i18n.language), [i18n.language]);
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
    const sunday = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => format.format(addDays(sunday, weekStart + i)));
  }, [i18n.language, weekStart]);
  const title = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
    month
  );

  const offset = (month.getDay() - weekStart + 7) % 7;
  const gridStart = addDays(month, -offset);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const isDisabled = (date: Date) => !!limit && date > limit;
  const valueShown =
    value.getFullYear() === month.getFullYear() && value.getMonth() === month.getMonth();
  const clamp = (date: Date) => (limit && date > limit ? limit : date);

  const select = (date: Date, focus = false) => {
    const next = clamp(date);
    focusPending.current = focus;
    onChange(next);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(value, -1),
      ArrowRight: () => addDays(value, 1),
      ArrowUp: () => addDays(value, -7),
      ArrowDown: () => addDays(value, 7),
      PageUp: () => addMonths(value, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(value, e.shiftKey ? 12 : 1),
      Home: () => addDays(value, -((value.getDay() - weekStart + 7) % 7)),
      End: () => addDays(value, 6 - ((value.getDay() - weekStart + 7) % 7)),
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      select(move(), true);
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const nextMonth = addMonths(month, 1);

  return (
    <div className={css.root}>
      <div className={css.header}>
        <button
          type="button"
          className={css.navButton}
          aria-label={t('calendar.previousMonth')}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>
        <span className={css.title} aria-live="polite">
          {title}
        </span>
        <button
          type="button"
          className={css.navButton}
          aria-label={t('calendar.nextMonth')}
          disabled={!!limit && nextMonth > limit}
          onClick={() => setMonth(nextMonth)}
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>
      <div
        className={css.grid}
        role="grid"
        tabIndex={-1}
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        {weekdays.map((name) => (
          <span key={name} className={css.weekday} role="columnheader">
            {name}
          </span>
        ))}
        {days.map((date) => {
          const isSelected = sameDay(date, value);
          const classes = [
            css.day,
            date.getMonth() !== month.getMonth() && css.outside,
            sameDay(date, today) && !isSelected && css.today,
            isSelected && css.selected,
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={date.toDateString()}
              ref={(el) => {
                if (el) dayRefs.current.set(date.toDateString(), el);
                else dayRefs.current.delete(date.toDateString());
              }}
              type="button"
              role="gridcell"
              className={classes}
              tabIndex={isSelected || (!valueShown && sameDay(date, month)) ? 0 : -1}
              aria-selected={isSelected}
              data-dialog-autofocus={autoFocus && isSelected ? '' : undefined}
              aria-current={sameDay(date, today) ? 'date' : undefined}
              aria-label={date.toLocaleDateString(i18n.language, { dateStyle: 'full' })}
              disabled={isDisabled(date)}
              onClick={() => select(date)}
              onDoubleClick={() => onSubmit?.()}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
