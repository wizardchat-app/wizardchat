import type { TimeFormat } from '@/app/store/atoms/settings';

let osUses12Hour: boolean | null = null;

export function setSystemUses12Hour(value: boolean | null): void {
  osUses12Hour = value;
}

export function systemUses12Hour(): boolean {
  return (
    osUses12Hour ??
    new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true
  );
}

export function hourCycleOptions(format: TimeFormat = 'auto'): Intl.DateTimeFormatOptions {
  const use12Hour = format === 'auto' ? systemUses12Hour() : format === '12h';
  return use12Hour ? { hour12: true } : { hourCycle: 'h23' };
}

export function formatTime(ts: number, locale?: string, format?: TimeFormat): string {
  return new Date(ts).toLocaleTimeString(locale ? [locale] : [], {
    hour: 'numeric',
    minute: '2-digit',
    ...hourCycleOptions(format),
  });
}

export function formatDateTime(
  ts: number,
  locale?: string,
  format?: TimeFormat,
  styles: Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle'> = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
): string {
  return new Date(ts).toLocaleString(locale ? [locale] : [], {
    ...styles,
    ...hourCycleOptions(format),
  });
}

export function formatDateLabel(ts: number, t: (key: string) => string, locale?: string): string {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (d === today) return t('timeline.dateToday');
  if (d === yesterday) return t('timeline.dateYesterday');
  return date.toLocaleDateString(locale ? [locale] : [], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDateLabel(
  ts: number,
  t: (key: string) => string,
  locale?: string
): string {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (d === today) return t('timeline.dateToday');
  if (d === yesterday) return t('timeline.dateYesterday');
  return date.toLocaleDateString(locale ? [locale] : [], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(
  ts: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale?: string
): string {
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  return formatShortDateLabel(ts, t, locale);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
