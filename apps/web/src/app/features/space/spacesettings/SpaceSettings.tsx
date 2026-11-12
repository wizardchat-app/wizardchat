import { useState, useLayoutEffect, useCallback, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  SlidersIcon,
  UsersIcon,
  ShieldIcon,
  SmileyStickerIcon,
  VinylRecordIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { spaceSettingsRoomIdAtom, emojiPickerAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoomDetails, useSpaceGraph } from '@/app/data';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { PermissionsPanel } from '@/app/features/room/roomsettings/Permissions';
import { RoomPermissionsMatrix } from '@/app/features/room/roomsettings/RoomPermissionsMatrix';
import { EmojiStickerPanel } from '@/app/features/room/roomsettings/EmojiStickerPanel';
import { SoundsPanel } from '@/app/features/room/roomsettings/SoundsPanel';
import { NarrowSettingsList, NarrowSettingsPage } from '@/app/components/Settings/NarrowSettings';
import {
  SettingsSearchInput,
  SettingsSearchResults,
  useHighlightSetting,
  useSettingsSearch,
  type SettingsSearchResult,
} from '@/app/components/Settings/SettingsSearch';
import {
  SPACE_SETTINGS_INDEX,
  type SpaceSettingsTab,
} from '@/app/features/room/roomsettings/searchIndex';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from '@/app/components/Settings/Settings.css';

type Tab = SpaceSettingsTab;

const NAV: { tab: Tab; labelKey: string; Icon: PhosphorIcon }[] = [
  { tab: 'general', labelKey: 'room.settings.general.title', Icon: SlidersIcon },
  { tab: 'members', labelKey: 'common.members', Icon: UsersIcon },
  {
    tab: 'permissions',
    labelKey: 'room.settings.permissions.title',
    Icon: ShieldIcon,
  },
  {
    tab: 'emojis',
    labelKey: 'room.settings.emojis.title',
    Icon: SmileyStickerIcon,
  },
  { tab: 'sounds', labelKey: 'room.settings.sounds.title', Icon: VinylRecordIcon },
];

export function SpaceSettings() {
  const emojiPickerOpen = !!useAtomValue(emojiPickerAtom);
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useAtom(spaceSettingsRoomIdAtom);
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
  const pages = NAV.map((item) => ({ key: item.tab, label: t(item.labelKey), Icon: item.Icon }));
  const results = useSettingsSearch(pages, SPACE_SETTINGS_INDEX, query);

  const graph = useSpaceGraph();
  const details = useRoomDetails(spaceId);
  const space = spaceId && graph.some((s) => s.spaceId === spaceId) ? (details ?? null) : null;

  useLayoutEffect(() => {
    if (spaceId) {
      setQuery('');
      setActiveTab('general');
      setNarrowView('list');
    }
  }, [spaceId]);

  const close = useCallback(() => setSpaceId(null), [setSpaceId]);

  const valid = Boolean(spaceId && space);

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
      {activeTab === 'general' && <GeneralPanel spaceId={spaceId!} />}
      {activeTab === 'members' && <PermissionsPanel roomId={spaceId!} />}
      {activeTab === 'permissions' && space && <RoomPermissionsMatrix roomId={spaceId!} />}
      {activeTab === 'emojis' && space && client && (
        <EmojiStickerPanel roomId={spaceId!} client={client} />
      )}
      {activeTab === 'sounds' && space && client && (
        <SoundsPanel roomId={spaceId!} client={client} />
      )}
    </div>
  );

  return (
    <Dialog
      open={Boolean(spaceId)}
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
            title={t(NAV.find((item) => item.tab === activeTab)?.labelKey ?? '')}
            onBack={backToList}
            onClose={close}
          >
            {panel}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={space?.name ?? t('common.settings')}
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
              NAV.map((item) => {
                const isActive = activeTab === item.tab;
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
