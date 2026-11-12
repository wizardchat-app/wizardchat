export type PermissionRowKind = 'scalar' | 'event' | 'nested';

export interface PermissionRow {
  id: string;
  key: string;
  linkedKeys?: string[];
  kind: PermissionRowKind;
  isState?: boolean;
  specDefault: number;
  hideForSpace?: boolean;
  onlyForSpace?: boolean;
}

export interface PermissionGroup {
  id: string;
  rows: PermissionRow[];
}

export const POWER_LEVEL_DEFAULTS = {
  users_default: 0,
  events_default: 0,
  state_default: 50,
  invite: 0,
  kick: 50,
  ban: 50,
  redact: 50,
  'notifications.room': 50,
} as const;

const SCALAR = (
  id: string,
  key: string,
  specDefault: number,
  hideForSpace = false
): PermissionRow => ({
  id,
  key,
  kind: 'scalar',
  specDefault,
  hideForSpace,
});

const STATE = (id: string, eventType: string, hideForSpace = false): PermissionRow => ({
  id,
  key: eventType,
  kind: 'event',
  isState: true,
  specDefault: POWER_LEVEL_DEFAULTS.state_default,
  hideForSpace,
});

const MESSAGE = (id: string, eventType: string, hideForSpace = false): PermissionRow => ({
  id,
  key: eventType,
  kind: 'event',
  isState: false,
  specDefault: POWER_LEVEL_DEFAULTS.events_default,
  hideForSpace,
});

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'roles',
    rows: [SCALAR('users_default', 'users_default', POWER_LEVEL_DEFAULTS.users_default)],
  },
  {
    id: 'messages',
    rows: [
      MESSAGE('send_message', 'm.room.message', true),
      MESSAGE('send_sticker', 'm.sticker', true),
      MESSAGE('send_reaction', 'm.reaction', true),
      STATE('pin_events', 'm.room.pinned', true),
      {
        id: 'notify_everyone',
        key: 'room',
        kind: 'nested',
        specDefault: POWER_LEVEL_DEFAULTS['notifications.room'],
        hideForSpace: true,
      },
      SCALAR('other_message_events', 'events_default', POWER_LEVEL_DEFAULTS.events_default, true),
    ],
  },
  {
    id: 'calls',
    rows: [STATE('start_join_call', 'org.matrix.msc3401.call.member', true)],
  },
  {
    id: 'moderation',
    rows: [
      SCALAR('invite', 'invite', POWER_LEVEL_DEFAULTS.invite),
      SCALAR('kick', 'kick', POWER_LEVEL_DEFAULTS.kick),
      SCALAR('ban', 'ban', POWER_LEVEL_DEFAULTS.ban),
      SCALAR('redact_others', 'redact', POWER_LEVEL_DEFAULTS.redact, true),
      MESSAGE('redact_self', 'm.room.redaction', true),
    ],
  },
  {
    id: 'profile',
    rows: [
      STATE('change_avatar', 'm.room.avatar'),
      STATE('change_name', 'm.room.name'),
      STATE('change_topic', 'm.room.topic'),
      STATE('change_alias', 'm.room.canonical_alias'),
    ],
  },
  {
    id: 'settings',
    rows: [
      STATE('change_join_rules', 'm.room.join_rules'),
      STATE('change_history_visibility', 'm.room.history_visibility', true),
      STATE('change_power_levels', 'm.room.power_levels'),
      STATE('change_server_acl', 'm.room.server_acl', true),
      STATE('upgrade_room', 'm.room.tombstone', true),
      STATE('change_encryption', 'm.room.encryption', true),
      SCALAR('other_state_events', 'state_default', POWER_LEVEL_DEFAULTS.state_default),
      {
        ...STATE('manage_emotes', 'im.ponies.room_emotes'),
        linkedKeys: ['m.room.image_pack', 'moe.crafty.room_soundboard'],
      },
      STATE('modify_widgets', 'm.room.widget', true),
    ],
  },
  {
    id: 'spaces',
    rows: [{ ...STATE('space_child', 'm.space.child'), onlyForSpace: true }],
  },
];

export function getPermissionGroups(isSpace: boolean): PermissionGroup[] {
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => {
      if (row.onlyForSpace) return isSpace;
      if (row.hideForSpace) return !isSpace;
      return true;
    }),
  })).filter((group) => group.rows.length > 0);
}

export function getPermissionRows(isSpace: boolean): PermissionRow[] {
  return getPermissionGroups(isSpace).flatMap((group) => group.rows);
}

export type PowerLevelsContent = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readNumber(source: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!source) return undefined;
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Some homeservers stringify numeric state values; tolerate them on read.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function inheritedLevel(row: PermissionRow, content: PowerLevelsContent): number {
  if (row.kind !== 'event') return row.specDefault;
  const fallback = row.isState ? 'state_default' : 'events_default';
  return readNumber(content, fallback) ?? row.specDefault;
}

export function readEffectiveLevel(row: PermissionRow, content: PowerLevelsContent): number {
  if (row.kind === 'event') {
    return readNumber(asObject(content.events), row.key) ?? inheritedLevel(row, content);
  }
  if (row.kind === 'nested') {
    return readNumber(asObject(content.notifications), row.key) ?? row.specDefault;
  }
  return readNumber(content, row.key) ?? row.specDefault;
}

export function buildUpdatedContent(
  rows: PermissionRow[],
  current: PowerLevelsContent,
  updates: Record<string, number>
): PowerLevelsContent {
  const next: PowerLevelsContent = { ...current };

  for (const row of rows) {
    const value = updates[row.id];
    if (value === undefined) continue;
    const inherited = inheritedLevel(row, current);

    if (row.kind === 'event') {
      const events = { ...(asObject(current.events) ?? {}) };
      for (const key of [row.key, ...(row.linkedKeys ?? [])]) {
        if (value === inherited) delete events[key];
        else events[key] = value;
      }
      if (Object.keys(events).length === 0) delete next.events;
      else next.events = events;
      continue;
    }

    if (row.kind === 'nested') {
      const notifications = { ...(asObject(current.notifications) ?? {}) };
      if (value === inherited) delete notifications[row.key];
      else notifications[row.key] = value;
      if (Object.keys(notifications).length === 0) delete next.notifications;
      else next.notifications = notifications;
      continue;
    }

    if (value === inherited && current[row.key] === undefined) continue;
    next[row.key] = value;
  }

  return next;
}

export function findOverLevelRows(
  rows: PermissionRow[],
  updates: Record<string, number>,
  myLevel: number
): PermissionRow[] {
  return rows.filter((row) => {
    const value = updates[row.id];
    return value !== undefined && value > myLevel;
  });
}
