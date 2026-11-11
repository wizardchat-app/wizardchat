import type { SettingsPage } from '@/app/store/atoms';
import { SHORTCUT_GROUPS } from '@/app/features/keyboardShortcuts/shortcuts';
import type { SettingsIndexEntry as Entry } from '@/app/components/Settings/SettingsSearch';

type SettingsIndexEntry = Entry<SettingsPage>;

const SOUNDS = [
  'mute',
  'deafen',
  'camera',
  'screenshare',
  'join',
  'leave',
  'ringtone',
  'ringback',
  'callEnded',
  'raiseHand',
  'reaction',
  'watchTogether',
];

export const SETTINGS_INDEX: SettingsIndexEntry[] = [
  ['account', 'settings.account.displayName'],
  ['account', 'settings.account.username'],
  ['account', 'presence.title'],
  ['account', 'status.customStatus'],
  ['account', 'settings.account.changePasswordTitle'],
  ['account', 'settings.account.emailTitle'],
  ['account', 'settings.account.deactivateAccount'],

  ['privacy', 'settings.privacy.typingIndicators', 'settings.privacy.typingIndicatorsNote'],
  ['privacy', 'settings.privacy.sendReadReceipts', 'settings.privacy.sendReadReceiptsNote'],
  ['privacy', 'settings.privacy.mediaVisibility'],
  ['privacy', 'settings.privacy.streamerMode'],
  ['privacy', 'settings.privacy.blockInvites', 'settings.privacy.blockInvitesNote'],
  ['privacy', 'settings.privacy.ignoredUsers'],

  [
    'emojis-stickers',
    'settings.emojisStickers.defaultPack',
    'settings.emojisStickers.defaultPackNote',
  ],
  [
    'emojis-stickers',
    'settings.emojisStickers.favoritePacks',
    'settings.emojisStickers.favoritePacksNote',
  ],

  [
    'notifications',
    'settings.notifications.notificationSounds',
    'settings.notifications.notificationSoundsNote',
  ],
  [
    'notifications',
    'settings.notifications.notificationBanners',
    'settings.notifications.notificationBannersNote',
  ],
  ['notifications', 'settings.notifications.dms'],
  ['notifications', 'settings.notifications.rooms'],
  ['notifications', 'settings.notifications.userMention'],
  ['notifications', 'settings.notifications.roomMention'],
  ['notifications', 'settings.notifications.keywordsLabel', 'settings.notifications.keywordsNote'],

  ['voice-video', 'call.inputDevice'],
  ['voice-video', 'call.outputDevice'],
  ['voice-video', 'call.camera'],
  ['voice-video', 'settings.voiceVideo.inputLevel', 'settings.voiceVideo.testNote'],
  ['voice-video', 'settings.voiceVideo.inputMode'],
  ['voice-video', 'settings.voiceVideo.pushToTalkKey'],
  ['voice-video', 'settings.voiceVideo.sounds'],
  ...SOUNDS.map((id): SettingsIndexEntry => ['voice-video', `settings.voiceVideo.sound.${id}`]),

  ['appearance', 'settings.appearance.theme'],
  ['appearance', 'settings.appearance.messageLayout'],
  ['appearance', 'settings.appearance.textSize'],
  ['appearance', 'settings.appearance.density'],
  ['appearance', 'settings.appearance.uiDensity', 'settings.appearance.uiDensityNote'],
  ['appearance', 'settings.appearance.uiScale', 'settings.appearance.uiScaleNote'],
  ['appearance', 'settings.appearance.colorUsernames'],
  ['appearance', 'settings.appearance.groupImages'],
  ['appearance', 'settings.appearance.customThemes'],
  ['appearance', 'settings.appearance.prettifyLinks', 'settings.appearance.prettifyLinksNote'],
  ['appearance', 'settings.appearance.themedAppIcon'],
  ['appearance', 'settings.appearance.showRoomAvatars'],
  [
    'appearance',
    'settings.appearance.showPresenceDots',
    'settings.appearance.showPresenceDotsNote',
  ],
  ['appearance', 'settings.appearance.markdown', 'settings.appearance.markdownNote'],

  [
    'accessibility',
    'settings.accessibility.reducedMotion',
    'settings.accessibility.reducedMotionNote',
  ],
  [
    'accessibility',
    'settings.accessibility.autoplayGifs',
    'settings.accessibility.autoplayGifsNote',
  ],

  ...SHORTCUT_GROUPS.flatMap((group) =>
    group.items.map((item): SettingsIndexEntry => ['keybinds', item.labelKey])
  ),

  ['language', 'settings.language.languageDisplay'],

  ['sessions', 'settings.sessions.currentDevice'],
  ['sessions', 'settings.sessions.yourDevices', 'settings.sessions.devicesDescription'],

  ['encryption', 'settings.encryption.endToEnd'],
  ['encryption', 'settings.encryption.excludeInsecure', 'settings.encryption.excludeInsecureNote'],
  ['encryption', 'settings.encryption.reset', 'settings.encryption.resetNote'],

  ['developer', 'developer.enable', 'developer.enableDescription'],
  ['developer', 'developer.homeserverUrl'],
  ['developer', 'developer.accessToken'],
  ['developer', 'developer.accountData.title'],

  ['about', 'settings.about.credits'],
  ['about', 'settings.about.privacyPolicy'],
];
