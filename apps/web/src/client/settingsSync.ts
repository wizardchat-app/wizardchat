import type { MessageLayout, Preferences, ThemeName } from '@/app/store/atoms';
import { THEMES } from '@/theme/themes.css';
import {
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_THEME,
} from '@/const/storageKeys';

export const SETTINGS_ACCOUNT_DATA_TYPE = 'org.wizardchat.settings';

const isBoolean = (value: unknown) => typeof value === 'boolean';
const oneOf =
  (...allowed: string[]) =>
  (value: unknown) =>
    typeof value === 'string' && allowed.includes(value);

const SYNCED_PREFERENCES = {
  typingIndicators: isBoolean,
  sendReadReceipts: isBoolean,
  mediaVisibility: oneOf('always', 'private', 'never'),
  prettifyLinks: isBoolean,
  markdown: isBoolean,
  showRoomAvatars: isBoolean,
  showPresenceDots: isBoolean,
  colorUsernames: isBoolean,
  groupImages: isBoolean,
  themedAppIcon: isBoolean,
  chatFontSize: (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 8 && value <= 48,
  chatDensity: oneOf('compact', 'default', 'spacious'),
  uiDensity: oneOf('compact', 'default', 'spacious'),
} satisfies Partial<Record<keyof Preferences, (value: unknown) => boolean>>;

export type SyncedPreferenceKey = keyof typeof SYNCED_PREFERENCES;
export const SYNCED_PREFERENCE_KEYS = Object.keys(SYNCED_PREFERENCES) as SyncedPreferenceKey[];
export type SyncedPreferences = Pick<Preferences, SyncedPreferenceKey>;

export interface SyncedSettings extends SyncedPreferences {
  theme: ThemeName;
  messageLayout: MessageLayout;
  language: string;
}

const MESSAGE_LAYOUTS: MessageLayout[] = ['classic', 'modern', 'compact'];

export function parseSettings(raw: unknown): Partial<SyncedSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const content = raw as Record<string, unknown>;
  const settings: Partial<SyncedSettings> = {};

  if (typeof content.theme === 'string' && content.theme in THEMES) {
    settings.theme = content.theme as ThemeName;
  }

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

export function writeSettingsToLocalStorage(settings: Partial<SyncedSettings>): void {
  if (settings.theme) localStorage.setItem(STORAGE_KEY_THEME, settings.theme);
  if (settings.messageLayout)
    localStorage.setItem(STORAGE_KEY_MESSAGE_LAYOUT, settings.messageLayout);
  if (settings.language) localStorage.setItem(STORAGE_KEY_LANGUAGE, settings.language);

  const preferences = pickSyncedPreferences(settings);
  if (Object.keys(preferences).length === 0) return;
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') ?? {};
  } catch {
    // Corrupt local value: the synced preferences replace it
  }
  localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify({ ...stored, ...preferences }));
}

export function settingsEqual(a: Partial<SyncedSettings>, b: Partial<SyncedSettings>): boolean {
  const keys: (keyof SyncedSettings)[] = [
    'theme',
    'messageLayout',
    'language',
    ...SYNCED_PREFERENCE_KEYS,
  ];
  return keys.every((key) => (a[key] ?? null) === (b[key] ?? null));
}
