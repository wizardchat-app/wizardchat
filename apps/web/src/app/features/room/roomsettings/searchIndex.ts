import type { SettingsIndexEntry } from '@/app/components/Settings/SettingsSearch';
import { PERMISSION_GROUPS } from './permissionMatrix';

export type RoomSettingsTab =
  'general' | 'members' | 'permissions' | 'widgets' | 'emojis' | 'sounds' | 'developer';
export type SpaceSettingsTab = 'general' | 'members' | 'permissions' | 'emojis' | 'sounds';

function permissions(space: boolean): SettingsIndexEntry<'permissions'>[] {
  return PERMISSION_GROUPS.flatMap((group) => {
    const rows = group.rows.filter((row) => (space ? !row.hideForSpace : !row.onlyForSpace));
    if (rows.length === 0) return [];
    return [
      ['permissions', `room.settings.permissions.groups.${group.id}`],
      ...rows.map((row): SettingsIndexEntry<'permissions'> => [
        'permissions',
        `room.settings.permissions.rows.${row.id}`,
      ]),
    ];
  });
}

const SHARED: SettingsIndexEntry<SpaceSettingsTab>[] = [
  ['general', 'room.topic'],
  ['general', 'room.settings.addresses.title'],
  ['general', 'room.settings.security.access'],
  ['members', 'room.settings.members.searchMembers'],
  ['emojis', 'room.settings.emojis.createPack', 'room.settings.emojis.description'],
  ['sounds', 'room.settings.sounds.createPack', 'room.settings.sounds.description'],
];

export const ROOM_SETTINGS_INDEX: SettingsIndexEntry<RoomSettingsTab>[] = [
  ['general', 'room.name'],
  ...SHARED,
  ['general', 'room.settings.security.messageHistory', 'room.settings.security.historyNote'],
  ['general', 'room.settings.general.e2ee', 'room.settings.general.encryptionNote'],
  ['general', 'room.settings.bridges.title'],
  ['general', 'room.upgrade.title'],
  ...permissions(false),
  ['widgets', 'room.settings.widgets.addedWidgets'],
  ['widgets', 'room.settings.widgets.customWidgets', 'room.settings.widgets.privacy'],
  ['developer', 'room.settings.general.id'],
  ['developer', 'developer.roomState.title'],
];

export const SPACE_SETTINGS_INDEX: SettingsIndexEntry<SpaceSettingsTab>[] = [
  ['general', 'space.name'],
  ...SHARED,
  ['general', 'space.settings.general.spaceId'],
  ...permissions(true),
];
