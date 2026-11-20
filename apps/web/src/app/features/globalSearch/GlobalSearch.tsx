import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  ArrowRightIcon,
  ChatCircleIcon,
  CompassIcon,
  GearIcon,
  HashStraightIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  SpeakerHighIcon,
  StackIcon,
} from '@phosphor-icons/react';
import {
  currentRoomIdAtom,
  exploreOpenAtom,
  globalSearchOpenAtom,
  roomMessageSearcherAtom,
  roomSearchAtom,
  settingsOpenAtom,
} from '@/app/store/atoms';
import type { RoomMessageMatch } from '@/app/store/atoms';
import { mergeHomeAndDmsAtom } from '@/app/store/atoms/settings';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoom, useSpaceGraph } from '@/app/data';
import { findParentSpaceId } from '@/util/matrix';
import { formatRelativeTime } from '@/util/format';
import { Avatar } from '@/app/components/Avatar';
import {
  HighlightedText,
  useRoomEntries,
  type RoomEntry,
} from '@/app/features/roomSwitcher/roomEntries';
import { useSwitchContext } from '@/app/pages/client/hooks/useContextNavigation';
import { KeyCaps } from '@/app/components/KeyCaps';
import * as css from './GlobalSearch.css';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';

const ROOM_LIMIT = 6;
const SPACE_LIMIT = 3;
const MESSAGE_LIMIT = 5;
const RECENT_LIMIT = 6;
const SCOPED_LIMIT = 20;

type Item =
  | { kind: 'place'; key: string; label: string; icon: ReactNode; run: () => void }
  | { kind: 'room'; key: string; entry: RoomEntry }
  | { kind: 'message'; key: string; match: RoomMessageMatch }
  | { kind: 'showAll'; key: string; total: number };

interface Section {
  key: string;
  title: string;
  items: Item[];
  empty?: string;
}

const byActivity = (a: RoomEntry, b: RoomEntry) =>
  Number(b.highlight) - Number(a.highlight) ||
  b.unread - a.unread ||
  b.lastActiveTs - a.lastActiveTs;

// Names starting with the query rank above ones that only contain it
function rankByName(entries: RoomEntry[], text: string): RoomEntry[] {
  return entries
    .filter((e) => e.name.toLowerCase().includes(text))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(text);
      const bStarts = b.name.toLowerCase().startsWith(text);
      return Number(bStarts) - Number(aStarts) || byActivity(a, b);
    });
}

function snippet(body: string, query: string): string {
  const flat = body.replace(/\s+/g, ' ');
  const idx = flat.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 30);
  return (start > 0 ? '...' : '') + flat.slice(start, start + 140);
}

function roomPath(entry: RoomEntry): string {
  const prefix = entry.kind === 'space' ? '/space/' : entry.kind === 'dm' ? '/dm/' : '/r/';
  return prefix + encodeURIComponent(entry.roomId);
}

export function GlobalSearch() {
  const [open, setOpen] = useAtom(globalSearchOpenAtom);
  if (!open) return null;
  return <GlobalSearchPanel onClose={() => setOpen(false)} />;
}

function GlobalSearchPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const keyboardHints = useKeyboardHints();
  const navigate = useNavigate();
  const switchContext = useSwitchContext();
  const mergeHomeAndDms = useAtomValue(mergeHomeAndDmsAtom);
  const client = getMatrixClientOrNull();
  const entries = useRoomEntries();
  const graph = useSpaceGraph();
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const searcher = useAtomValue(roomMessageSearcherAtom);
  const setRoomSearch = useSetAtom(roomSearchAtom);
  const setExploreOpen = useSetAtom(exploreOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector<HTMLElement>('[data-global-search-anchor]');
      const rect = anchor?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        setPosition({
          top: rect.top - 4,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
          width: 'min(640px, calc(100vw - 32px))',
        });
      } else {
        setPosition({ top: 'calc(8px + env(safe-area-inset-top))', left: 8, right: 8 });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  useEffect(() => {
    setRoomSearch(null);
    inputRef.current?.focus();
  }, [setRoomSearch]);

  const messageRoom = searcher && searcher.roomId === currentRoomId ? searcher : null;
  const messageRoomSummary = useRoom(messageRoom?.roomId);
  const messageRoomName = messageRoom ? (messageRoomSummary?.name ?? '') : '';

  const sections = useMemo((): Section[] => {
    const trimmed = query.trim();
    const prefix = trimmed.match(/^[#@*]/)?.[0];
    const text = trimmed
      .replace(/^[#@*]/, '')
      .trim()
      .toLowerCase();

    const allPlaces: Item[] = [
      {
        kind: 'place',
        key: 'place:home',
        label: t('nav.home'),
        icon: <HouseIcon size={16} />,
        run: () => switchContext('home', null),
      },
      {
        kind: 'place',
        key: 'place:dms',
        label: t('room.dm.directMessages'),
        icon: <ChatCircleIcon size={16} />,
        run: () => switchContext('dms', null),
      },
      {
        kind: 'place',
        key: 'place:explore',
        label: t('explore.title'),
        icon: <CompassIcon size={16} />,
        run: () => setExploreOpen(true),
      },
      {
        kind: 'place',
        key: 'place:settings',
        label: t('settings.title'),
        icon: <GearIcon size={16} />,
        run: () => setSettingsOpen(true),
      },
    ];
    const places = mergeHomeAndDms
      ? allPlaces.filter((item) => item.key !== 'place:dms')
      : allPlaces;
    const asItems = (list: RoomEntry[]): Item[] =>
      list.map((entry) => ({ kind: 'room', key: entry.roomId, entry }));

    if (!text && !prefix) {
      return [
        { key: 'places', title: t('search.global.places'), items: places },
        {
          key: 'recent',
          title: t('search.global.recent'),
          items: asItems([...entries].sort(byActivity).slice(0, RECENT_LIMIT)),
        },
      ];
    }

    if (prefix) {
      const kind = prefix === '#' ? 'room' : prefix === '@' ? 'dm' : 'space';
      const scoped = entries.filter((e) => e.kind === kind);
      const list = text ? rankByName(scoped, text) : [...scoped].sort(byActivity);
      const title = kind === 'space' ? t('search.global.spaces') : t('search.global.roomsAndDms');
      return [
        {
          key: kind,
          title,
          items: asItems(list.slice(0, SCOPED_LIMIT)),
          empty: t('common.noResults'),
        },
      ];
    }

    const result: Section[] = [];
    const matchingPlaces = places.filter(
      (p) => p.kind === 'place' && p.label.toLowerCase().includes(text)
    );
    if (matchingPlaces.length > 0) {
      result.push({ key: 'places', title: t('search.global.places'), items: matchingPlaces });
    }
    const rooms = rankByName(
      entries.filter((e) => e.kind !== 'space'),
      text
    );
    const spaces = rankByName(
      entries.filter((e) => e.kind === 'space'),
      text
    );
    if (rooms.length > 0) {
      result.push({
        key: 'rooms',
        title: t('search.global.roomsAndDms'),
        items: asItems(rooms.slice(0, ROOM_LIMIT)),
      });
    }
    if (spaces.length > 0) {
      result.push({
        key: 'spaces',
        title: t('search.global.spaces'),
        items: asItems(spaces.slice(0, SPACE_LIMIT)),
      });
    }
    if (messageRoom) {
      const { matches, total } = messageRoom.find(trimmed, MESSAGE_LIMIT);
      const items: Item[] = matches.map((match) => ({
        kind: 'message',
        key: `message:${match.eventId}`,
        match,
      }));
      if (total > 0) items.push({ kind: 'showAll', key: 'showAll', total });
      result.push({
        key: 'messages',
        title: t('search.global.messagesIn', { room: messageRoomName }),
        items,
        empty: t('search.global.noMessages'),
      });
    }
    if (result.length === 0) {
      result.push({ key: 'none', title: '', items: [], empty: t('common.noResults') });
    }
    return result;
  }, [
    query,
    entries,
    messageRoom,
    messageRoomName,
    t,
    switchContext,
    mergeHomeAndDms,
    setExploreOpen,
    setSettingsOpen,
  ]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    bodyRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const run = useCallback(
    (item: Item) => {
      onClose();
      if (item.kind === 'place') item.run();
      else if (item.kind === 'room') navigate(roomPath(item.entry));
      else if (item.kind === 'message') messageRoom?.jumpTo(item.match.eventId);
      else if (item.kind === 'showAll' && messageRoom) {
        setRoomSearch({ roomId: messageRoom.roomId, query: query.trim(), openedAt: Date.now() });
      }
    },
    [onClose, navigate, messageRoom, setRoomSearch, query]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[highlighted];
      if (item) run(item);
    }
  };

  const searchText = query
    .trim()
    .replace(/^[#@*]/, '')
    .trim();

  const renderItem = (item: Item, index: number) => {
    const common = {
      role: 'option',
      'aria-selected': index === highlighted,
      'data-highlighted': index === highlighted,
      onMouseEnter: () => setHighlighted(index),
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => run(item),
    } as const;

    if (item.kind === 'place') {
      return (
        <div key={item.key} {...common} className={css.item}>
          <span className={css.itemIcon}>{item.icon}</span>
          <span className={css.itemText}>
            <HighlightedText text={item.label} query={searchText} />
          </span>
        </div>
      );
    }

    if (item.kind === 'room') {
      const { entry } = item;
      const parentId =
        client && entry.kind !== 'dm' ? findParentSpaceId(entry.roomId, graph) : null;
      const parentName = parentId ? entries.find((e) => e.roomId === parentId)?.name : null;
      const badgeCount = Math.max(entry.unread, entry.highlight ? 1 : 0);
      return (
        <div key={item.key} {...common} className={css.item}>
          <span className={css.itemIcon}>
            {entry.kind === 'dm' ? (
              <Avatar
                name={entry.name}
                mxcUrl={entry.avatarMxc}
                client={client}
                size="xs"
                placeholder="logo"
              />
            ) : entry.kind === 'space' ? (
              <StackIcon size={16} />
            ) : entry.isVoice ? (
              <SpeakerHighIcon size={16} weight="fill" />
            ) : (
              <HashStraightIcon size={16} />
            )}
          </span>
          <span className={css.itemText}>
            <HighlightedText text={entry.name} query={searchText} />
            {parentName && <span className={css.itemMeta}> · {parentName}</span>}
          </span>
          {badgeCount > 0 && (
            <span className={entry.highlight ? css.badgeMention : css.badge}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </div>
      );
    }

    if (item.kind === 'message') {
      const { match } = item;
      return (
        <div key={item.key} {...common} className={css.messageItem}>
          <span className={css.itemIcon}>
            <Avatar
              name={match.senderName}
              mxcUrl={match.senderAvatar}
              client={client}
              size="xs"
              placeholder="logo"
            />
          </span>
          <span className={css.messageBody}>
            <span className={css.messageHead}>
              <span className={css.messageSender}>{match.senderName}</span>
              <span className={css.messageTime}>
                {formatRelativeTime(match.ts, t, i18n.language)}
              </span>
            </span>
            <span className={css.messageSnippet}>
              <HighlightedText text={snippet(match.body, searchText)} query={searchText} />
            </span>
          </span>
        </div>
      );
    }

    return (
      <div key={item.key} {...common} className={css.item}>
        <span className={css.itemIcon}>
          <ArrowRightIcon size={16} />
        </span>
        <span className={css.itemText}>
          {t('search.global.showAll', { count: item.total, room: messageRoomName })}
        </span>
      </div>
    );
  };

  let index = 0;
  return createPortal(
    <>
      <div className={css.backdrop} onMouseDown={onClose} />
      <div className={css.panel} style={position} role="dialog" aria-label={t('titleBar.search')}>
        <div className={css.inputRow}>
          <div className={css.inputField}>
            <MagnifyingGlassIcon size={16} />
            <input
              ref={inputRef}
              className={css.input}
              placeholder={t('titleBar.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-results"
              autoComplete="off"
              spellCheck={false}
            />
            {keyboardHints && <KeyCaps keys={['Esc']} size="sm" />}
          </div>
        </div>
        <div className={css.body} ref={bodyRef} id="global-search-results" role="listbox">
          {sections.map((section) => (
            <div key={section.key} className={css.section}>
              {section.title && <div className={css.sectionTitle}>{section.title}</div>}
              {section.items.length === 0 && section.empty ? (
                <div className={css.sectionEmpty}>{section.empty}</div>
              ) : (
                section.items.map((item) => renderItem(item, index++))
              )}
            </div>
          ))}
        </div>
        <div className={css.footer}>
          {keyboardHints && (
            <>
              <span className={css.footerHint}>
                <KeyCaps keys={['↑', '↓']} size="sm" />
                {t('common.navigate')}
              </span>
              <span className={css.footerHint}>
                <KeyCaps keys={['↵']} size="sm" />
                {t('search.switcher.hintOpen')}
              </span>
            </>
          )}
          <span className={css.footerHint}>
            <KeyCaps keys={['#']} size="sm" />
            {t('search.switcher.prefixRooms')}
          </span>
          <span className={css.footerHint}>
            <KeyCaps keys={['@']} size="sm" />
            {t('search.switcher.prefixDms')}
          </span>
          <span className={css.footerHint}>
            <KeyCaps keys={['*']} size="sm" />
            {t('search.switcher.prefixSpaces')}
          </span>
        </div>
      </div>
    </>,
    document.body
  );
}
