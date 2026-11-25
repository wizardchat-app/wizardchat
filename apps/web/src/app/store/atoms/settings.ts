import { atom } from 'jotai';
import type { CustomTheme } from '@/theme/customTheme';
import { atomWithStorage } from 'jotai/utils';
import { MOD_MODIFIER } from '@/app/util/platform';
import {
  DEFAULT_SLOTS,
  legacyThemeSlot,
  resolveSlot,
  slotKey,
  type ColorMode,
  type ThemeMode,
} from '@/theme/themeSlots';
import { themeEditorAtom } from './ui';
import {
  STORAGE_KEY_THEME,
  STORAGE_KEY_THEME_MODE,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_KEYBINDS,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_DEVELOPER_MODE,
  STORAGE_KEY_MIC_MUTED,
  STORAGE_KEY_DEAFENED,
} from '@/const/storageKeys';

export type MessageLayout = 'classic' | 'modern' | 'compact';
export type ThemeName =
  | 'Carbon'
  | 'Pewter'
  | 'Umbra'
  | 'Eclipse'
  | 'Parrot'
  | 'Hallow'
  | 'Garnet'
  | 'Ethereal'
  | 'Blossom'
  | 'Opaline'
  | 'Prism'
  | 'Custom';
export type MediaVisibility = 'always' | 'private' | 'never';
export type StreamerMode = 'always' | 'screenshare' | 'off';
export type ReducedMotion = 'system' | 'on' | 'off';
export type ChatDensity = 'compact' | 'default' | 'spacious';
export type { ColorMode, ThemeMode } from '@/theme/themeSlots';

export interface Keybinds {
  toggleMute: string;
  toggleDeafen: string;
  toggleScreenShare?: string;
  toggleCamera?: string;
  pushToTalk: string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  toggleMute: `${MOD_MODIFIER}+Shift+KeyM`,
  toggleDeafen: `${MOD_MODIFIER}+Shift+KeyD`,
  toggleScreenShare: `${MOD_MODIFIER}+Shift+KeyE`,
  toggleCamera: `${MOD_MODIFIER}+Shift+KeyO`,
  pushToTalk: '',
};

export interface Preferences {
  typingIndicators: boolean;
  notificationSounds: boolean;
  notificationBanners: boolean;
  sendReadReceipts: boolean;
  prettifyLinks: boolean;
  markdown: boolean;
  showRoomAvatars: boolean;
  showLastMessage: boolean;
  mergeHomeAndDms: boolean;
  showPresenceDots: boolean;
  colorUsernames: boolean;
  groupImages: boolean;
  stripPhotoMetadata: boolean;
  compressImages: boolean;
  largeEmoji: boolean;
  emoticonsToEmoji: boolean;
  showJoinLeave: boolean;
  showProfileChanges: boolean;
  customThemes: CustomTheme[];
  lightTheme: string;
  darkTheme: string;
  autoplayGifs: boolean;
  mediaVisibility: MediaVisibility;
  streamerMode: StreamerMode;
  reducedMotion: ReducedMotion;
  chatFontSize: number;
  chatDensity: ChatDensity;
  uiZoom: number;
  reducedMotionApplied: boolean | null;
  themedAppIcon: boolean;
  excludeInsecureSessions: boolean;
  pushToTalk: boolean;
  voiceSounds: Partial<Record<string, boolean>>;
  soundboardVolume: number;
}

function migrateLegacyTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THEME);
    if (raw === null || localStorage.getItem(STORAGE_KEY_THEME_MODE) !== null) return;
    let legacy: unknown = raw;
    try {
      legacy = JSON.parse(raw);
    } catch {
      // Stored unquoted by older settings sync
    }
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') ?? {};
    const customThemes = Array.isArray(prefs.customThemes) ? prefs.customThemes : [];
    const slot = legacyThemeSlot(legacy, prefs.activeCustomTheme, customThemes);
    const mode: ThemeMode = !slot || slot.wasDefault ? 'system' : slot.mode;
    localStorage.setItem(STORAGE_KEY_THEME_MODE, JSON.stringify(mode));
    if (slot)
      localStorage.setItem(
        STORAGE_KEY_PREFERENCES,
        JSON.stringify({ ...prefs, [slotKey(slot.mode)]: slot.value })
      );
    localStorage.removeItem(STORAGE_KEY_THEME);
  } catch {
    // Unreadable legacy values: start from the defaults
  }
}
migrateLegacyTheme();

function migrateUiDensity() {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? 'null');
    if (!prefs || !('uiDensity' in prefs)) return;
    const uiZoom = prefs.uiDensity === 'compact' ? 90 : prefs.uiDensity === 'spacious' ? 110 : 100;
    delete prefs.uiDensity;
    delete prefs.uiScale;
    localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify({ ...prefs, uiZoom }));
  } catch {
    // Unreadable preferences: start from the defaults
  }
}
migrateUiDensity();

export const themeModeAtom = atomWithStorage<ThemeMode>(
  STORAGE_KEY_THEME_MODE,
  'system',
  undefined,
  {
    getOnInit: true,
  }
);

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const systemColorModeAtom = atom<ColorMode>(
  darkQuery()?.matches === false ? 'light' : 'dark'
);
systemColorModeAtom.onMount = (set) => {
  const query = darkQuery();
  if (!query) return;
  const update = () => set(query.matches ? 'dark' : 'light');
  update();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
};

export const colorModeAtom = atom<ColorMode>((get) => {
  const mode = get(themeModeAtom);
  return mode === 'system' ? get(systemColorModeAtom) : mode;
});

export const messageLayoutAtom = atomWithStorage<MessageLayout>(
  STORAGE_KEY_MESSAGE_LAYOUT,
  'modern'
);

export const keybindsAtom = atomWithStorage<Keybinds>(STORAGE_KEY_KEYBINDS, DEFAULT_KEYBINDS);

export const DEFAULT_PREFERENCES: Preferences = {
  typingIndicators: true,
  notificationSounds: true,
  notificationBanners: import.meta.env.DESKTOP,
  sendReadReceipts: true,
  prettifyLinks: false,
  markdown: true,
  showRoomAvatars: true,
  showLastMessage: false,
  mergeHomeAndDms: false,
  showPresenceDots: true,
  colorUsernames: true,
  groupImages: true,
  stripPhotoMetadata: true,
  compressImages: false,
  largeEmoji: true,
  emoticonsToEmoji: false,
  showJoinLeave: true,
  showProfileChanges: false,
  customThemes: [],
  lightTheme: DEFAULT_SLOTS.light,
  darkTheme: DEFAULT_SLOTS.dark,
  autoplayGifs: false,
  mediaVisibility: 'always',
  streamerMode: 'screenshare',
  reducedMotion: 'system',
  chatFontSize: 15,
  chatDensity: 'default',
  uiZoom: 100,
  reducedMotionApplied: null,
  themedAppIcon: false,
  excludeInsecureSessions: false,
  pushToTalk: false,
  voiceSounds: {},
  soundboardVolume: 0.5,
};

export const preferencesAtom = atomWithStorage<Preferences>(
  STORAGE_KEY_PREFERENCES,
  DEFAULT_PREFERENCES
);

function preferenceFieldAtom<K extends keyof Preferences>(key: K) {
  return atom(
    (get) => get(preferencesAtom)[key] ?? DEFAULT_PREFERENCES[key],
    (_get, set, value: Preferences[K]) =>
      set(preferencesAtom, (prev) => ({ ...prev, [key]: value }))
  );
}

export const typingIndicatorsAtom = preferenceFieldAtom('typingIndicators');
export const notificationSoundsAtom = preferenceFieldAtom('notificationSounds');
export const notificationBannersAtom = preferenceFieldAtom('notificationBanners');
export const sendReadReceiptsAtom = preferenceFieldAtom('sendReadReceipts');
export const prettifyLinksAtom = preferenceFieldAtom('prettifyLinks');
export const markdownAtom = preferenceFieldAtom('markdown');
export const showRoomAvatarsAtom = preferenceFieldAtom('showRoomAvatars');
export const showLastMessageAtom = preferenceFieldAtom('showLastMessage');
export const mergeHomeAndDmsAtom = preferenceFieldAtom('mergeHomeAndDms');
export const showPresenceDotsAtom = preferenceFieldAtom('showPresenceDots');
export const colorUsernamesAtom = preferenceFieldAtom('colorUsernames');
export const groupImagesAtom = preferenceFieldAtom('groupImages');
export const stripPhotoMetadataAtom = preferenceFieldAtom('stripPhotoMetadata');
export const compressImagesAtom = preferenceFieldAtom('compressImages');
export const largeEmojiAtom = preferenceFieldAtom('largeEmoji');
export const emoticonsToEmojiAtom = preferenceFieldAtom('emoticonsToEmoji');
export const showJoinLeaveAtom = preferenceFieldAtom('showJoinLeave');
export const showProfileChangesAtom = preferenceFieldAtom('showProfileChanges');
export const customThemesAtom = preferenceFieldAtom('customThemes');
export const lightThemeAtom = preferenceFieldAtom('lightTheme');
export const darkThemeAtom = preferenceFieldAtom('darkTheme');
export const themeSlotAtom = (mode: ColorMode) =>
  mode === 'light' ? lightThemeAtom : darkThemeAtom;

const activeThemeAtom = atom((get) => {
  const themes = get(customThemesAtom);
  const editing = themes.find((t) => t.id === get(themeEditorAtom));
  if (editing) return editing;
  const mode = get(colorModeAtom);
  return resolveSlot(get(themeSlotAtom(mode)), mode, themes);
});
export const themeAtom = atom<ThemeName>((get) => {
  const active = get(activeThemeAtom);
  return typeof active === 'string' ? active : 'Custom';
});
export const activeCustomThemeAtom = atom((get) => {
  const active = get(activeThemeAtom);
  return typeof active === 'string' ? null : active;
});
export const autoplayGifsAtom = preferenceFieldAtom('autoplayGifs');
export const mediaVisibilityAtom = preferenceFieldAtom('mediaVisibility');
export const streamerModeAtom = preferenceFieldAtom('streamerMode');
export const reducedMotionAtom = preferenceFieldAtom('reducedMotion');
export const chatFontSizeAtom = preferenceFieldAtom('chatFontSize');
export const chatDensityAtom = preferenceFieldAtom('chatDensity');
export const uiZoomAtom = preferenceFieldAtom('uiZoom');
export const themedAppIconAtom = preferenceFieldAtom('themedAppIcon');
export const excludeInsecureSessionsAtom = preferenceFieldAtom('excludeInsecureSessions');
export const pushToTalkEnabledAtom = preferenceFieldAtom('pushToTalk');
export const voiceSoundsAtom = preferenceFieldAtom('voiceSounds');
export const soundboardVolumeAtom = preferenceFieldAtom('soundboardVolume');

const rawStringStorage = {
  getItem: (key: string, init: string) => localStorage.getItem(key) ?? init,
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const languageAtom = atomWithStorage<string>(STORAGE_KEY_LANGUAGE, 'en', rawStringStorage);

export const developerModeAtom = atomWithStorage<boolean>(STORAGE_KEY_DEVELOPER_MODE, false);

export const micMutedAtom = atomWithStorage<boolean>(STORAGE_KEY_MIC_MUTED, false);

export const deafenedAtom = atomWithStorage<boolean>(STORAGE_KEY_DEAFENED, false);
