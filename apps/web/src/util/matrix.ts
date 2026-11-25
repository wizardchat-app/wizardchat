import type { RoomSummary, SpaceNode } from '@wizardchat/core';

export function formatUserId(userId: string | null | undefined): string {
  if (!userId) return '';
  return userId.split(':')[0].substring(1);
}

export function isDmRoom(room: RoomSummary | null | undefined): boolean {
  return !!room?.isDirect;
}

export function isVoiceRoom(room: RoomSummary | null | undefined): boolean {
  return !!room?.isVoice;
}

export function joinRuleToAccess(rule: string): 'invite' | 'restricted' | 'public' | 'knock' {
  if (rule === 'public') return 'public';
  if (rule === 'knock' || rule === 'knock_restricted') return 'knock';
  if (rule === 'restricted') return 'restricted';
  return 'invite';
}

export function isChildOfSpace(roomId: string, spaceId: string, graph: SpaceNode[]): boolean {
  return graph.some((s) => s.spaceId === spaceId && s.children.some((c) => c.roomId === roomId));
}

export function findParentSpaceId(roomId: string, graph: SpaceNode[]): string | null {
  return graph.find((s) => s.children.some((c) => c.roomId === roomId))?.spaceId ?? null;
}

function getViaServers(
  roomIdOrAlias: string | null | undefined,
  homeDomain: string | null | undefined
): string[] {
  if (!roomIdOrAlias) return [];
  if (!roomIdOrAlias.startsWith('!') && !roomIdOrAlias.startsWith('#')) return [];
  const server = roomIdOrAlias.split(':').slice(1).join(':').toLowerCase();
  return server && server !== homeDomain?.toLowerCase() ? [server] : [];
}

export function viaServersFor(
  roomIdOrAlias: string | null | undefined,
  homeDomain: string | null | undefined
) {
  return { viaServers: getViaServers(roomIdOrAlias, homeDomain) };
}

function parseMatrixPermalink(input: string): {
  roomIdOrAlias: string;
  viaServers: string[];
} | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let raw: string;
  if (trimmed.startsWith('matrix:')) {
    raw = trimmed.slice('matrix:'.length).replace(/^[^/]+\//, '');
  } else {
    let path: string;
    try {
      const url = new URL(trimmed);
      if (!/(^|\.)matrix\.to$/.test(url.hostname)) return null;
      path = url.hash.replace(/^#\/?/, '');
    } catch {
      if (!trimmed.startsWith('#/')) return null;
      path = trimmed.slice('#/'.length);
    }
    if (!path) return null;
    raw = path;
  }

  const queryIndex = raw.indexOf('?');
  const roomPath = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).split('/')[0].trim();
  let roomIdOrAlias = roomPath;
  try {
    roomIdOrAlias = decodeURIComponent(roomPath);
  } catch {
    // keep as is
  }
  if (!roomIdOrAlias.startsWith('!') && !roomIdOrAlias.startsWith('#')) return null;

  const viaServers =
    queryIndex === -1
      ? []
      : raw
          .slice(queryIndex + 1)
          .split('&')
          .map((p) => p.replace(/^via=/, '').trim())
          .filter((p) => p && p !== 'via');

  return { roomIdOrAlias, viaServers };
}

export function normalizeJoinTarget(input: string): {
  roomIdOrAlias: string;
  viaServers: string[];
} | null {
  const trimmed = input.trim();
  const permalink = parseMatrixPermalink(trimmed);
  if (permalink) return permalink;
  if (!trimmed.startsWith('!') && !trimmed.startsWith('#')) return null;
  return { roomIdOrAlias: trimmed, viaServers: [] };
}

export function makeRoomPermalink(room: { id: string; canonicalAlias?: string | null }): string {
  if (room.canonicalAlias) return `https://matrix.to/#/${room.canonicalAlias}`;
  const server = room.id.startsWith('!') ? room.id.split(':').slice(1).join(':') : '';
  return `https://matrix.to/#/${room.id}${server ? `?via=${server}` : ''}`;
}

export function makeUserPermalink(userId: string): string {
  return `https://matrix.to/#/${userId}`;
}

export function makeEventPermalink(roomId: string, eventId: string): string {
  const server = roomId.startsWith('!') ? roomId.split(':').slice(1).join(':') : '';
  return `https://matrix.to/#/${roomId}/${eventId}${server ? `?via=${server}` : ''}`;
}
