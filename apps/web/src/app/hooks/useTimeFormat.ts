import { useMemo } from 'react';
import { atom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { timeFormatAtom } from '@/app/store/atoms';
import { isDesktop, systemUses12Hour } from '@/bridge/desktop';
import { formatDateTime, formatTime, setSystemUses12Hour } from '@/util/format';

const systemHourCycleAtom = atom<boolean | null>(null);
systemHourCycleAtom.onMount = (set) => {
  if (!isDesktop) return;
  const refresh = () =>
    void systemUses12Hour()
      .then((value) => {
        setSystemUses12Hour(value);
        set(value);
      })
      .catch(() => {});
  refresh();
  window.addEventListener('focus', refresh);
  return () => window.removeEventListener('focus', refresh);
};

export function useTimeFormat() {
  const { i18n } = useTranslation();
  const format = useAtomValue(timeFormatAtom);
  const system = useAtomValue(systemHourCycleAtom);
  const locale = i18n.language;
  return useMemo(
    () => ({
      time: (ts: number) => formatTime(ts, locale, format),
      dateTime: (ts: number, styles?: Parameters<typeof formatDateTime>[3]) =>
        formatDateTime(ts, locale, format, styles),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `system` changes what formatTime resolves
    [locale, format, system]
  );
}
