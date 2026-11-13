import type { AuditLogEntry } from '@wizardchat/core';

export type AuditCategory = 'moderation' | 'members' | 'settings';
export type AuditFilter = 'all' | AuditCategory;

export interface AuditLine {
  key: string;
  targetId?: string;
  value?: string;
}

export interface AuditItem {
  id: string;
  ts: number;
  category: AuditCategory;
  actorId: string;
  lines: AuditLine[];
  reason?: string;
  detail?: string;
}

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function membershipLine(sender: string, target: string, now: string, before: string | undefined) {
  const self = sender === target;
  switch (now) {
    case 'join':
      return { category: 'members' as const, line: { key: 'joined' } };
    case 'knock':
      return { category: 'members' as const, line: { key: 'knocked' } };
    case 'invite':
      return before === 'knock'
        ? { category: 'moderation' as const, line: { key: 'knockAccepted', targetId: target } }
        : { category: 'members' as const, line: { key: 'invited', targetId: target } };
    case 'ban':
      return { category: 'moderation' as const, line: { key: 'banned', targetId: target } };
    case 'leave':
      if (self) {
        if (before === 'invite') return { category: 'members' as const, line: { key: 'declined' } };
        if (before === 'knock')
          return { category: 'members' as const, line: { key: 'knockWithdrawn' } };
        return { category: 'members' as const, line: { key: 'left' } };
      }
      if (before === 'ban')
        return { category: 'moderation' as const, line: { key: 'unbanned', targetId: target } };
      if (before === 'invite')
        return {
          category: 'moderation' as const,
          line: { key: 'inviteWithdrawn', targetId: target },
        };
      if (before === 'knock')
        return { category: 'moderation' as const, line: { key: 'knockDenied', targetId: target } };
      return { category: 'moderation' as const, line: { key: 'kicked', targetId: target } };
    default:
      return null;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function powerLevelLines(content: Json, prev: Json): AuditLine[] {
  const lines: AuditLine[] = [];
  const users = obj(content.users);
  const prevUsers = obj(prev.users);
  const fallback = num(content.users_default, 0);
  const prevFallback = num(prev.users_default, 0);
  for (const userId of new Set([...Object.keys(users), ...Object.keys(prevUsers)])) {
    const now = num(users[userId], fallback);
    const before = num(prevUsers[userId], prevFallback);
    if (now !== before)
      lines.push({ key: 'roleChanged', targetId: userId, value: `${before}:${now}` });
  }
  const withoutUsers = (c: Json) =>
    canonical(Object.fromEntries(Object.entries(c).filter(([key]) => key !== 'users')));
  if (withoutUsers(content) !== withoutUsers(prev)) lines.push({ key: 'permissionsChanged' });
  return lines;
}

function pinnedLine(content: Json, prev: Json): AuditLine | null {
  const now = Array.isArray(content.pinned) ? content.pinned : [];
  const before = Array.isArray(prev.pinned) ? prev.pinned : [];
  if (now.length > before.length) return { key: 'pinned' };
  if (now.length < before.length) return { key: 'unpinned' };
  return null;
}

export function describeAuditEntry(entry: AuditLogEntry, isSpace: boolean): AuditItem | null {
  const event = obj(entry.event);
  const type = str(event.type);
  const id = str(event.event_id);
  const actorId = str(event.sender);
  if (!type || !id || !actorId) return null;
  const content = obj(event.content);
  const prev = obj(obj(event.unsigned).prev_content);
  const stateKey = typeof event.state_key === 'string' ? event.state_key : '';
  const base = { id, ts: num(event.origin_server_ts, 0), actorId };
  const settings = (lines: (AuditLine | null)[], detail?: string): AuditItem | null => {
    const kept = lines.filter((l): l is AuditLine => l !== null);
    return kept.length ? { ...base, category: 'settings', lines: kept, detail } : null;
  };

  switch (type) {
    case 'm.room.create':
      return settings([{ key: isSpace ? 'createdSpace' : 'createdRoom' }]);
    case 'm.room.member': {
      const now = str(content.membership);
      if (!now || !stateKey) return null;
      const result = membershipLine(actorId, stateKey, now, str(prev.membership));
      if (!result) return null;
      return {
        ...base,
        category: result.category,
        lines: [result.line],
        reason: str(content.reason),
      };
    }
    case 'm.room.power_levels':
      return settings(powerLevelLines(content, prev));
    case 'm.room.name': {
      const name = str(content.name);
      return settings([name ? { key: 'renamed', value: name } : { key: 'nameRemoved' }]);
    }
    case 'm.room.topic': {
      const topic = str(content.topic);
      return settings([{ key: topic ? 'topicChanged' : 'topicRemoved' }], topic);
    }
    case 'm.room.avatar':
      return settings([{ key: str(content.url) ? 'avatarChanged' : 'avatarRemoved' }]);
    case 'm.room.canonical_alias': {
      const alias = str(content.alias);
      if (alias === str(prev.alias)) return settings([{ key: 'addressesChanged' }]);
      return settings([alias ? { key: 'addressSet', value: alias } : { key: 'addressRemoved' }]);
    }
    case 'm.room.join_rules':
      return settings([{ key: 'joinRuleChanged', value: str(content.join_rule) ?? 'invite' }]);
    case 'm.room.history_visibility':
      return settings([
        { key: 'historyChanged', value: str(content.history_visibility) ?? 'shared' },
      ]);
    case 'm.room.guest_access':
      return settings([
        { key: str(content.guest_access) === 'can_join' ? 'guestsAllowed' : 'guestsForbidden' },
      ]);
    case 'm.room.encryption':
      return settings([{ key: 'encryptionEnabled' }]);
    case 'm.room.server_acl':
      return { ...base, category: 'moderation', lines: [{ key: 'serverAclChanged' }] };
    case 'm.room.tombstone':
      return settings([{ key: 'upgraded' }]);
    case 'm.room.pinned_events':
      return settings([pinnedLine(content, prev)]);
    case 'm.space.child':
      return settings([
        Object.keys(content).length
          ? { key: 'childAdded', value: stateKey }
          : { key: 'childRemoved', value: stateKey },
      ]);
    case 'm.space.parent':
      return settings([
        Object.keys(content).length
          ? { key: 'parentAdded', value: stateKey }
          : { key: 'parentRemoved', value: stateKey },
      ]);
    case 'm.room.redaction':
      return {
        ...base,
        category: 'moderation',
        lines: entry.redactedSender
          ? [{ key: 'messageRemoved', targetId: entry.redactedSender }]
          : [{ key: 'messageRemovedUnknown' }],
        reason: str(content.reason),
      };
    default:
      return null;
  }
}
