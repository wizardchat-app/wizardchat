import { useEffect, useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretRightIcon,
  MagnifyingGlassIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { Input } from '@/app/components/Input';
import { scrollBehavior } from '@/app/hooks/useReducedMotion';
import * as css from './Settings.css';

export type SettingsIndexEntry<K extends string> = [page: K, labelKey: string, noteKey?: string];

export interface SettingsSearchResult<K extends string> {
  id: string;
  page: K;
  label: string;
  pageLabel: string | null;
  Icon: PhosphorIcon;
}

interface SearchPage<K extends string> {
  key: K;
  label: string;
  Icon: PhosphorIcon;
}

export function useSettingsSearch<K extends string>(
  pages: SearchPage<K>[],
  index: SettingsIndexEntry<K>[],
  query: string
): SettingsSearchResult<K>[] | null {
  const { t } = useTranslation();
  return useMemo(() => {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    const matches = (text: string) => words.every((w) => text.toLocaleLowerCase().includes(w));
    const results: (SettingsSearchResult<K> & { rank: number })[] = [];
    for (const page of pages) {
      if (matches(page.label))
        results.push({
          id: page.key,
          page: page.key,
          label: page.label,
          pageLabel: null,
          Icon: page.Icon,
          rank: 0,
        });
    }
    const seen = new Set<string>();
    for (const [key, labelKey, noteKey] of index) {
      const page = pages.find((p) => p.key === key);
      if (!page) continue;
      const label = t(labelKey);
      const id = `${key}:${label}`;
      if (seen.has(id)) continue;
      const note = noteKey ? t(noteKey) : '';
      const rank = matches(label)
        ? 1
        : matches(`${label} ${page.label}`)
          ? 2
          : matches(`${label} ${note} ${page.label}`)
            ? 3
            : 0;
      if (!rank) continue;
      seen.add(id);
      results.push({ id, page: key, label, pageLabel: page.label, Icon: page.Icon, rank });
    }
    return results.sort((a, b) => a.rank - b.rank);
  }, [pages, index, query, t]);
}

export function SettingsSearchInput({
  value,
  onChange,
  onSubmit,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder={t('settings.search')}
        aria-label={t('settings.search')}
        leadingIcon={<MagnifyingGlassIcon size={14} />}
      />
    </div>
  );
}

export function SettingsSearchResults<K extends string>({
  results,
  onSelect,
  narrow,
}: {
  results: SettingsSearchResult<K>[];
  onSelect: (result: SettingsSearchResult<K>) => void;
  narrow?: boolean;
}) {
  const { t } = useTranslation();
  if (results.length === 0)
    return (
      <div className={narrow ? css.navListNoMatches : css.navNoMatches}>{t('nav.noMatches')}</div>
    );
  return (
    <>
      {results.map((result) => (
        <button
          key={result.id}
          type="button"
          className={narrow ? css.navRow : css.navItem}
          onClick={() => onSelect(result)}
        >
          {narrow ? (
            <span className={css.navRowIcon}>
              <result.Icon size={22} />
            </span>
          ) : (
            <result.Icon size={16} />
          )}
          <span className={`${narrow ? css.navRowLabel : css.navLabelText} ${css.navResult}`}>
            {result.label}
            {result.pageLabel && <span className={css.navResultPage}>{result.pageLabel}</span>}
          </span>
          {narrow && <CaretRightIcon size={18} className={css.navRowCaret} />}
        </button>
      ))}
    </>
  );
}

export function useHighlightSetting(
  container: RefObject<HTMLElement | null>,
  label: string | null,
  onDone: () => void
) {
  useEffect(() => {
    if (!label) return;
    let tries = 0;
    const find = (): HTMLElement | null => {
      const root = container.current;
      if (!root) return null;
      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        if (el.textContent?.trim() !== label) continue;
        if ([...el.children].some((child) => child.textContent?.trim() === label)) continue;
        return el;
      }
      return null;
    };
    const timer = window.setInterval(() => {
      const el = find();
      if (!el && ++tries < 30) return;
      window.clearInterval(timer);
      onDone();
      if (!el) return;
      const target = rowOf(el, container.current!);
      const tall = target.offsetHeight > window.innerHeight / 2;
      target.scrollIntoView({ block: tall ? 'start' : 'center', behavior: scrollBehavior() });
      target.classList.remove(css.searchHighlight);
      void target.offsetWidth;
      target.classList.add(css.searchHighlight);
      target.addEventListener('animationend', () => target.classList.remove(css.searchHighlight), {
        once: true,
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [container, label, onDone]);
}

function rowOf(el: HTMLElement, root: HTMLElement): HTMLElement {
  if (el.tagName === 'H3' && el.parentElement && el.parentElement !== root) return el.parentElement;
  for (let row = el; row.parentElement && row.parentElement !== root; row = row.parentElement) {
    if (row.parentElement.classList.contains(css.section)) return row;
  }
  let row = el;
  while (
    row.parentElement &&
    row.parentElement !== root &&
    row.offsetWidth < root.clientWidth * 0.85
  )
    row = row.parentElement;
  return row;
}
