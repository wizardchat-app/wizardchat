import { atom } from 'jotai';
import type { CustomTheme } from '@/theme/customTheme';
import type { UiDensity, UiScale } from '@/theme/uiDensity';
import { atomWithStorage } from 'jotai/utils';
import { DEFAULT_THEME } from '@/theme/themes.css';
import { MOD_MODIFIER } from '@/app/util/platform';
import {
  STORAGE_KEY_THEME,
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
  | 'Custom';
export type MediaVisibility = 'always' | 'private' | 'never';
export type StreamerMode = 'always' | 'screenshare' | 'off';
export type ReducedMotion = 'system' | 'on' | 'off';
export type ChatDensity = 'compact' | 'default' | 'spacious';
export type { UiDensity, UiScale } from '@/theme/uiDensity';

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
  showPresenceDots: boolean;
  colorUsernames: boolean;
  groupImages: boolean;
  largeEmoji: boolean;
  emoticonsToEmoji: boolean;
  showJoinLeave: boolean;
  showProfileChanges: boolean;
  customThemes: CustomTheme[];
  activeCustomTheme: string | null;
  autoplayGifs: boolean;
  mediaVisibility: MediaVisibility;
  streamerMode: StreamerMode;
  reducedMotion: ReducedMotion;
  chatFontSize: number;
  chatDensity: ChatDensity;
  uiDensity: UiDensity;
  uiScale: UiScale;
  reducedMotionApplied: boolean | null;
  themedAppIcon: boolean;
  excludeInsecureSessions: boolean;
  pushToTalk: boolean;
  voiceSounds: Partial<Record<string, boolean>>;
}

export const themeAtom = atomWithStorage<ThemeName>(STORAGE_KEY_THEME, DEFAULT_THEME as ThemeName);

export const messageLayoutAtom = atomWithStorage<MessageLayout>(
  STORAGE_KEY_MESSAGE_LAYOUT,
  'modern'
);

export const keybindsAtom = atomWithStorage<Keybinds>(STORAGE_KEY_KEYBINDS, DEFAULT_KEYBINDS);

export const DEFAULT_PREFERENCES: Preferences = {
  typingIndicators: true,
  notificationSounds: true,
  notificationBanners: false,
  sendReadReceipts: true,
  prettifyLinks: false,
  markdown: true,
  showRoomAvatars: true,
  showPresenceDots: true,
  colorUsernames: true,
  groupImages: true,
  largeEmoji: true,
  emoticonsToEmoji: false,
  showJoinLeave: true,
  showProfileChanges: false,
  customThemes: [],
  activeCustomTheme: null,
  autoplayGifs: false,
  mediaVisibility: 'always',
  streamerMode: 'screenshare',
  reducedMotion: 'system',
  chatFontSize: 15,
  chatDensity: 'default',
  uiDensity: 'default',
  uiScale: 'auto',
  reducedMotionApplied: null,
  themedAppIcon: false,
  excludeInsecureSessions: false,
  pushToTalk: false,
  voiceSounds: {},
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
export const showPresenceDotsAtom = preferenceFieldAtom('showPresenceDots');
export const colorUsernamesAtom = preferenceFieldAtom('colorUsernames');
export const groupImagesAtom = preferenceFieldAtom('groupImages');
export const largeEmojiAtom = preferenceFieldAtom('largeEmoji');
export const emoticonsToEmojiAtom = preferenceFieldAtom('emoticonsToEmoji');
export const showJoinLeaveAtom = preferenceFieldAtom('showJoinLeave');
export const showProfileChangesAtom = preferenceFieldAtom('showProfileChanges');
export const customThemesAtom = preferenceFieldAtom('customThemes');
export const activeCustomThemeIdAtom = preferenceFieldAtom('activeCustomTheme');
export const activeCustomThemeAtom = atom((get) => {
  if (get(themeAtom) !== 'Custom') return null;
  const themes = get(customThemesAtom);
  const id = get(activeCustomThemeIdAtom);
  return themes.find((t) => t.id === id) ?? themes[0] ?? null;
});
export const autoplayGifsAtom = preferenceFieldAtom('autoplayGifs');
export const mediaVisibilityAtom = preferenceFieldAtom('mediaVisibility');
export const streamerModeAtom = preferenceFieldAtom('streamerMode');
export const reducedMotionAtom = preferenceFieldAtom('reducedMotion');
export const chatFontSizeAtom = preferenceFieldAtom('chatFontSize');
export const chatDensityAtom = preferenceFieldAtom('chatDensity');
export const uiDensityAtom = preferenceFieldAtom('uiDensity');
export const uiScaleAtom = preferenceFieldAtom('uiScale');
export const touchUiAtom = atom(false);
export const themedAppIconAtom = preferenceFieldAtom('themedAppIcon');
export const excludeInsecureSessionsAtom = preferenceFieldAtom('excludeInsecureSessions');
export const pushToTalkEnabledAtom = preferenceFieldAtom('pushToTalk');
export const voiceSoundsAtom = preferenceFieldAtom('voiceSounds');

const rawStringStorage = {
  getItem: (key: string, init: string) => localStorage.getItem(key) ?? init,
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const languageAtom = atomWithStorage<string>(STORAGE_KEY_LANGUAGE, 'en', rawStringStorage);

export const developerModeAtom = atomWithStorage<boolean>(STORAGE_KEY_DEVELOPER_MODE, false);

export const micMutedAtom = atomWithStorage<boolean>(STORAGE_KEY_MIC_MUTED, false);

export const deafenedAtom = atomWithStorage<boolean>(STORAGE_KEY_DEAFENED, false);
