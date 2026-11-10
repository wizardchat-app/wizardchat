import type { Keybinds } from '@/app/store/atoms/settings';
import { ALT_KEY, MODIFIER_KEY, SHIFT_KEY } from '@/app/util/platform';

export type KeybindAction = keyof Keybinds;

export interface ShortcutItem {
  id: string;
  labelKey: string;
  keys: string | string[];
  editable?: false;
}

export interface EditableShortcutItem {
  id: KeybindAction;
  labelKey: string;
  keys: '';
  editable: true;
}

export type AnyShortcutItem = ShortcutItem | EditableShortcutItem;

export interface ShortcutGroup {
  id: string;
  labelKey: string;
  items: AnyShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'general',
    labelKey: 'settings.keybinds.groupGeneral',
    items: [
      {
        id: 'searchGlobal',
        labelKey: 'settings.keybinds.searchGlobal',
        keys: `${MODIFIER_KEY} + K`,
      },
      {
        id: 'searchInRoom',
        labelKey: 'settings.keybinds.searchInRoom',
        keys: `${MODIFIER_KEY} + F`,
      },
      {
        id: 'openInbox',
        labelKey: 'settings.keybinds.openInbox',
        keys: `${MODIFIER_KEY} + I`,
      },
      {
        id: 'openPinned',
        labelKey: 'settings.keybinds.openPinned',
        keys: `${MODIFIER_KEY} + P`,
      },
      {
        id: 'createJoinSpace',
        labelKey: 'settings.keybinds.createJoinSpace',
        keys: `${MODIFIER_KEY} + ${SHIFT_KEY} + N`,
      },
      {
        id: 'showHelp',
        labelKey: 'settings.keybinds.showHelp',
        keys: `${MODIFIER_KEY} + /`,
      },
    ],
  },
  {
    id: 'navigation',
    labelKey: 'settings.keybinds.groupNavigation',
    items: [
      {
        id: 'navigateRooms',
        labelKey: 'settings.keybinds.navigateRooms',
        keys: [`${ALT_KEY} + ↑`, `${ALT_KEY} + ↓`],
      },
      {
        id: 'navigateSpaces',
        labelKey: 'settings.keybinds.navigateSpaces',
        keys: [`${MODIFIER_KEY} + ${ALT_KEY} + ↑`, `${MODIFIER_KEY} + ${ALT_KEY} + ↓`],
      },
    ],
  },
  {
    id: 'composer',
    labelKey: 'settings.keybinds.groupComposer',
    items: [
      { id: 'close', labelKey: 'settings.keybinds.close', keys: 'Esc' },
      { id: 'send', labelKey: 'composer.send', keys: 'Enter' },
      { id: 'newLine', labelKey: 'settings.keybinds.newLine', keys: `${SHIFT_KEY} + Enter` },
      { id: 'bold', labelKey: 'composer.formatting.bold', keys: `${MODIFIER_KEY} + B` },
      { id: 'italic', labelKey: 'composer.formatting.italic', keys: `${MODIFIER_KEY} + I` },
      {
        id: 'strikethrough',
        labelKey: 'composer.formatting.strikethrough',
        keys: `${MODIFIER_KEY} + ${SHIFT_KEY} + S`,
      },
      { id: 'inlineCode', labelKey: 'settings.keybinds.inlineCode', keys: `${MODIFIER_KEY} + E` },
      {
        id: 'editMessage',
        labelKey: 'settings.keybinds.editMessage',
        keys: ['↑', '↓'],
      },
      {
        id: 'emojiPicker',
        labelKey: 'settings.keybinds.emojiPicker',
        keys: `${MODIFIER_KEY} + ;`,
      },
      {
        id: 'acceptSuggestion',
        labelKey: 'settings.keybinds.acceptSuggestion',
        keys: 'Tab',
      },
    ],
  },
  {
    id: 'voice',
    labelKey: 'settings.keybinds.voiceRoom',
    items: [
      {
        id: 'pushToTalk',
        labelKey: 'settings.keybinds.pushToTalk',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleMute',
        labelKey: 'settings.keybinds.toggleMute',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleDeafen',
        labelKey: 'settings.keybinds.toggleDeafen',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleScreenShare',
        labelKey: 'settings.keybinds.toggleScreenShare',
        keys: '',
        editable: true,
      },
      {
        id: 'toggleCamera',
        labelKey: 'settings.keybinds.toggleCamera',
        keys: '',
        editable: true,
      },
    ],
  },
];
