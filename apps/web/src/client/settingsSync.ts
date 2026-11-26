import type { MessageLayout, Preferences } from '@/app/store/atoms';
import { isCustomThemeList, type CustomTheme } from '@/theme/customTheme';
import { legacyThemeSlot, slotKey } from '@/theme/themeSlots';

export const SETTINGS_ACCOUNT_DATA_TYPE = 'org.wizardchat.settings';

const isBoolean = (value: unknown) => typeof value === 'boolean';
const oneOf =
  (...allowed: string[]) =>
  (value: unknown) =>
    typeof value === 'string' && allowed.includes(value);

const isThemeSlot = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

const SYNCED_PREFERENCES = {
  typingIndicators: isBoolean,
  sendReadReceipts: isBoolean,
  mediaVisibility: oneOf('always', 'private', 'never'),
  streamerMode: oneOf('always', 'screenshare', 'off'),
  prettifyLinks: isBoolean,
  markdown: isBoolean,
  showRoomAvatars: isBoolean,
  mergeHomeAndDms: isBoolean,
  showPresenceDots: isBoolean,
  colorUsernames: isBoolean,
  groupImages: isBoolean,
  stripPhotoMetadata: isBoolean,
  compressImages: isBoolean,
  largeEmoji: isBoolean,
  emoticonsToEmoji: isBoolean,
  showJoinLeave: isBoolean,
  showProfileChanges: isBoolean,
  customThemes: isCustomThemeList,
  lightTheme: isThemeSlot,
  darkTheme: isThemeSlot,
  themedAppIcon: isBoolean,
  chatFontSize: (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 8 && value <= 48,
  chatDensity: oneOf('compact', 'default', 'spacious'),
  timeFormat: oneOf('auto', '12h', '24h'),
  uiZoom: (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 50 && value <= 200,
} satisfies Partial<Record<keyof Preferences, (value: unknown) => boolean>>;

export type SyncedPreferenceKey = keyof typeof SYNCED_PREFERENCES;
export const SYNCED_PREFERENCE_KEYS = Object.keys(SYNCED_PREFERENCES) as SyncedPreferenceKey[];
export type SyncedPreferences = Pick<Preferences, SyncedPreferenceKey>;

export interface SyncedSettings extends SyncedPreferences {
  messageLayout: MessageLayout;
  language: string;
}

const MESSAGE_LAYOUTS: MessageLayout[] = ['classic', 'modern', 'compact'];

export function parseSettings(raw: unknown): Partial<SyncedSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const content = raw as Record<string, unknown>;
  const settings: Partial<SyncedSettings> = {};

  if (
    typeof content.messageLayout === 'string' &&
    (MESSAGE_LAYOUTS as string[]).includes(content.messageLayout)
  ) {
    settings.messageLayout = content.messageLayout as MessageLayout;
  }

  if (typeof content.language === 'string' && content.language.trim() !== '') {
    settings.language = content.language;
  }

  for (const key of SYNCED_PREFERENCE_KEYS) {
    if (SYNCED_PREFERENCES[key](content[key])) {
      (settings as Record<string, unknown>)[key] = content[key];
    }
  }

  if (settings.lightTheme === undefined && settings.darkTheme === undefined) {
    const customThemes: CustomTheme[] = settings.customThemes ?? [];
    const slot = legacyThemeSlot(content.theme, content.activeCustomTheme, customThemes);
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

/** The settings stored in account data (from `client.accountData(SETTINGS_ACCOUNT_DATA_TYPE)`) */
export function readSettingsFromContent(content: unknown): Partial<SyncedSettings> {
  return content ? parseSettings(content) : {};
}

export function settingsEqual(a: Partial<SyncedSettings>, b: Partial<SyncedSettings>): boolean {
  const keys: (keyof SyncedSettings)[] = ['messageLayout', 'language', ...SYNCED_PREFERENCE_KEYS];
  return keys.every((key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null));
}
