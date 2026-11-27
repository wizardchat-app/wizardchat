import type { SyncedSettings as CoreSyncedSettings } from '@wizardchat/core';
import type { MessageLayout, Preferences } from '@/app/store/atoms';
import { isCustomThemeList, type CustomTheme } from '@/theme/customTheme';
import { legacyThemeSlot, slotKey } from '@/theme/themeSlots';

export const SYNCED_PREFERENCE_KEYS = [
  'typingIndicators',
  'sendReadReceipts',
  'mediaVisibility',
  'streamerMode',
  'prettifyLinks',
  'markdown',
  'showRoomAvatars',
  'mergeHomeAndDms',
  'showPresenceDots',
  'colorUsernames',
  'groupImages',
  'stripPhotoMetadata',
  'compressImages',
  'largeEmoji',
  'emoticonsToEmoji',
  'showJoinLeave',
  'showProfileChanges',
  'customThemes',
  'lightTheme',
  'darkTheme',
  'themedAppIcon',
  'chatFontSize',
  'chatDensity',
  'alignOwnRight',
  'timeFormat',
  'uiZoom',
] as const satisfies readonly (keyof Preferences & keyof CoreSyncedSettings)[];

export type SyncedPreferenceKey = (typeof SYNCED_PREFERENCE_KEYS)[number];
export type SyncedPreferences = Pick<Preferences, SyncedPreferenceKey>;

export interface SyncedSettings extends SyncedPreferences {
  messageLayout: MessageLayout;
  language: string;
}

/** The core's synced settings (already validated there) as the web app's preferences */
export function fromCoreSettings(core: CoreSyncedSettings): Partial<SyncedSettings> {
  const settings: Partial<SyncedSettings> = {};
  if (core.messageLayout) settings.messageLayout = core.messageLayout as MessageLayout;
  if (core.language) settings.language = core.language;

  for (const key of SYNCED_PREFERENCE_KEYS) {
    const value = core[key];
    if (value !== null && value !== undefined) {
      (settings as Record<string, unknown>)[key] = value;
    }
  }
  if (settings.customThemes !== undefined && !isCustomThemeList(settings.customThemes)) {
    delete settings.customThemes;
  }

  if (settings.lightTheme === undefined && settings.darkTheme === undefined) {
    const customThemes: CustomTheme[] = settings.customThemes ?? [];
    const slot = legacyThemeSlot(core.theme, core.activeCustomTheme, customThemes);
    if (slot) settings[slotKey(slot.mode)] = slot.value;
  }

  return settings;
}

export function pickSyncedPreferences(
  settings: Partial<SyncedSettings>
): Partial<SyncedPreferences> {
  const picked: Partial<SyncedPreferences> = {};
  for (const key of SYNCED_PREFERENCE_KEYS) {
    if (settings[key] !== undefined) (picked as Record<string, unknown>)[key] = settings[key];
  }
  return picked;
}

export function settingsEqual(a: Partial<SyncedSettings>, b: Partial<SyncedSettings>): boolean {
  const keys: (keyof SyncedSettings)[] = ['messageLayout', 'language', ...SYNCED_PREFERENCE_KEYS];
  return keys.every((key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null));
}
