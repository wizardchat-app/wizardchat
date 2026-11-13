import { useState, useLayoutEffect, useCallback, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  SlidersIcon,
  PuzzlePieceIcon,
  UsersIcon,
  ShieldIcon,
  ScrollIcon,
  SmileyStickerIcon,
  VinylRecordIcon,
  WrenchIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import {
  roomSettingsRoomIdAtom,
  roomSettingsTabAtom,
  developerModeAtom,
  emojiPickerAtom,
} from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { canViewAuditLog, useRoom, useRoomSettings, useUserId } from '@/app/data';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { PermissionsPanel } from './Permissions';
import { RoomPermissionsMatrix } from './RoomPermissionsMatrix';
import { Widgets } from './Widgets';
import { EmojiStickerPanel } from './EmojiStickerPanel';
import { SoundsPanel } from './SoundsPanel';
import { DeveloperPanel } from './Developer';
import { AuditLogPanel } from './AuditLog';
import { NarrowSettingsList, NarrowSettingsPage } from '@/app/components/Settings/NarrowSettings';
import {
  SettingsSearchInput,
  SettingsSearchResults,
  useHighlightSetting,
  useSettingsSearch,
  type SettingsSearchResult,
} from '@/app/components/Settings/SettingsSearch';
import { ROOM_SETTINGS_INDEX, type RoomSettingsTab } from './searchIndex';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from '@/app/components/Settings/Settings.css';

type Tab = RoomSettingsTab;

const NAV: { tab: Tab; labelKey: string; Icon: PhosphorIcon }[] = [
  { tab: 'general', labelKey: 'room.settings.general.title', Icon: SlidersIcon },
  { tab: 'members', labelKey: 'common.members', Icon: UsersIcon },
  {
    tab: 'permissions',
    labelKey: 'room.settings.permissions.title',
    Icon: ShieldIcon,
  },
  { tab: 'audit', labelKey: 'room.settings.audit.title', Icon: ScrollIcon },
  {
    tab: 'widgets',
    labelKey: 'room.settings.widgets.title',
    Icon: PuzzlePieceIcon,
  },
  {
    tab: 'emojis',
    labelKey: 'room.settings.emojis.title',
    Icon: SmileyStickerIcon,
  },
  { tab: 'sounds', labelKey: 'room.settings.sounds.title', Icon: VinylRecordIcon },
  { tab: 'developer', labelKey: 'developer.title', Icon: WrenchIcon },
];

const DEV_TABS: Tab[] = ['widgets', 'developer'];

export function RoomSettings() {
  const emojiPickerOpen = !!useAtomValue(emojiPickerAtom);
  const { t } = useTranslation();
  const [roomId, setRoomId] = useAtom(roomSettingsRoomIdAtom);
  const [roomSettingsTab, setRoomSettingsTab] = useAtom(roomSettingsTabAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const client = getMatrixClientOrNull();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [narrowView, setNarrowView] = useState<'list' | 'page'>('list');
  const backToList = useCallback(() => setNarrowView('list'), []);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const clearHighlight = useCallback(() => setHighlight(null), []);
  useHighlightSetting(pageRef, highlight, clearHighlight);

  const room = useRoom(roomId);

  const userId = useUserId();
  const { data: settings } = useRoomSettings(roomId);
  const canAudit = canViewAuditLog(settings, userId);
  const hidden = (tab: Tab) =>
    (!developerMode && DEV_TABS.includes(tab)) || (!canAudit && tab === 'audit');
  const navItems = NAV.filter((item) => !hidden(item.tab));
  const shownTab = hidden(activeTab) ? 'general' : activeTab;
  const pages = navItems.map((item) => ({
    key: item.tab,
    label: t(item.labelKey),
    Icon: item.Icon,
  }));
  const results = useSettingsSearch(pages, ROOM_SETTINGS_INDEX, query);

  useLayoutEffect(() => {
    if (roomId) {
      setQuery('');
      setActiveTab(roomSettingsTab ?? 'general');
      setNarrowView(roomSettingsTab ? 'page' : 'list');
      setRoomSettingsTab(null);
    }
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setRoomId(null), [setRoomId]);

  const valid = Boolean(roomId) && Boolean(room && client) && !room?.isInvite;

  const showPage = isNarrow && narrowView === 'page';
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    setNarrowView('page');
  };
  const openResult = (result: SettingsSearchResult<Tab>) => {
    openTab(result.page);
    setHighlight(result.pageLabel ? result.label : null);
  };
  const search = (className: string) => (
    <SettingsSearchInput
      className={className}
      value={query}
      onChange={setQuery}
      onSubmit={() => results?.[0] && openResult(results[0])}
    />
  );
  const panel = (
    <div ref={pageRef}>
      {shownTab === 'general' && <GeneralPanel roomId={roomId!} onClose={close} />}
      {shownTab === 'members' && <PermissionsPanel roomId={roomId!} />}
      {shownTab === 'permissions' && room && <RoomPermissionsMatrix roomId={roomId!} />}
      {shownTab === 'audit' && <AuditLogPanel roomId={roomId!} client={client!} isSpace={false} />}
      {shownTab === 'widgets' && <Widgets roomId={roomId!} client={client!} />}
      {shownTab === 'emojis' && <EmojiStickerPanel roomId={roomId!} client={client!} />}
      {shownTab === 'sounds' && <SoundsPanel roomId={roomId!} client={client!} />}
      {shownTab === 'developer' && <DeveloperPanel roomId={roomId!} client={client!} />}
    </div>
  );

  return (
    <Dialog
      open={Boolean(roomId)}
      trapPaused={emojiPickerOpen}
      onClose={showPage ? backToList : close}
      size="xl"
      zIndex={7000}
      maxWidth="1080px"
      height="800px"
      surface="primary"
      fullscreenOnMobile
      bodyClassName={isNarrow ? `${css.dialogBody} ${css.dialogBodyColumn}` : css.dialogBody}
      ariaLabel={t('common.settings')}
    >
      {!valid ? null : isNarrow ? (
        showPage ? (
          <NarrowSettingsPage
            title={t(navItems.find((item) => item.tab === shownTab)?.labelKey ?? '')}
            onBack={backToList}
            onClose={close}
          >
            {panel}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={room?.name ?? t('common.settings')}
            items={pages}
            onSelect={openTab}
            onClose={close}
            search={search(css.navListSearch)}
            results={
              results && <SettingsSearchResults results={results} onSelect={openResult} narrow />
            }
          />
        )
      ) : (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('common.settings')}</span>
            {search(css.navSearch)}
            {results ? (
              <SettingsSearchResults results={results} onSelect={openResult} />
            ) : (
              navItems.map((item) => {
                const isActive = shownTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    className={isActive ? css.navItemActive : css.navItem}
                    onClick={() => setActiveTab(item.tab)}
                  >
                    <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    <span className={css.navLabelText}>{t(item.labelKey)}</span>
                  </button>
                );
              })
            )}
          </nav>

          <div className={css.content}>
            <button
              type="button"
              className={css.closeBtn}
              onClick={close}
              aria-label={t('common.close')}
            >
              <XIcon size={18} />
            </button>
            {panel}
          </div>
        </>
      )}
    </Dialog>
  );
}
