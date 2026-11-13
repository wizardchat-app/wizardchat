import { useEffect, useMemo, useState } from 'react';
import { atom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Member,
  MemberEntry,
  RoomDetails,
  RoomSettings,
  RoomSummary,
  SpaceNode,
  SpaceSummary,
  UserProfile,
  WizardClient,
} from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { applyDiffs } from '@/core/listDiff';
import {
  knockedRoomIdsAtom,
  markRoomLeftAtom,
  roomsAtom,
  roomSectionsAtom,
  roomsByIdAtom,
  roomTagNamesAtom,
  spaceGraphAtom,
  spacesAtom,
  syncReadyAtom,
  syncStateAtom,
} from './atoms';

export * from './atoms';
export { DataSync } from './DataSync';
export { useTimeline, useTypingUsers } from '@/core/hooks';
export { useMediaUrl, downloadMedia } from '@/core/media';

/** The signed-in client; only use below the auth guard */
export function useClient(): WizardClient {
  const client = getMatrixClientOrNull();
  if (!client) throw new Error('useClient outside a signed-in session');
  return client;
}

export function useUserId(): string {
  return getMatrixClientOrNull()?.userId() ?? '';
}

export const useSyncReady = () => useAtomValue(syncReadyAtom);
export const useSyncState = () => useAtomValue(syncStateAtom);

/** Every joined and invited room (no spaces) */
export const useAllRooms = () => useAtomValue(roomsAtom);

export function useRoom(roomId: string | null | undefined): RoomSummary | null {
  const byId = useAtomValue(roomsByIdAtom);
  return (roomId && byId.get(roomId)) || null;
}

/** The room list sections in list order, live */
export const useRoomSections = () => useAtomValue(roomSectionsAtom);
/** Each room's tag names, live */
export const useRoomTagNames = () => useAtomValue(roomTagNamesAtom);

export const useJoinedSpaces = () => useAtomValue(spacesAtom);
export const useKnockedRoomIds = () => useAtomValue(knockedRoomIdsAtom);
/** Hides a room or space right after leaving it */
export const useMarkRoomLeft = () => useSetAtom(markRoomLeftAtom);

export const allJoinedSpacesAtom = atom<SpaceSummary[]>([]);
const allSpacesAtom = allJoinedSpacesAtom;
let allSpacesWatch: {
  client: WizardClient;
  store: ReturnType<typeof useStore>;
  users: number;
  cancel: () => void;
} | null = null;

/** Every joined space, subspaces included, live */
export function useAllJoinedSpaces(): SpaceSummary[] {
  const store = useStore();
  useEffect(() => {
    const client = getMatrixClientOrNull();
    if (!client) return;
    if (allSpacesWatch?.client !== client || allSpacesWatch.store !== store) {
      allSpacesWatch?.cancel();
      store.set(allSpacesAtom, []);
      const subscription = client.watchAllSpaces((diffs) =>
        store.set(allSpacesAtom, (spaces) => applyDiffs(spaces, diffs))
      );
      allSpacesWatch = { client, store, users: 0, cancel: () => subscription.cancel() };
    }
    const watch = allSpacesWatch;
    watch.users++;
    return () => {
      watch.users--;
      if (watch.users === 0 && allSpacesWatch === watch) {
        watch.cancel();
        allSpacesWatch = null;
      }
    };
  }, [store]);
  return useAtomValue(allSpacesAtom);
}
export const useSpaceGraph = () => useAtomValue(spaceGraphAtom);

/** Spaces that list the room as a child */
export function parentSpacesOf(graph: SpaceNode[], roomId: string): string[] {
  return graph.filter((s) => s.children.some((c) => c.roomId === roomId)).map((s) => s.spaceId);
}

export function childrenOf(graph: SpaceNode[], spaceId: string): SpaceNode['children'] {
  return graph.find((s) => s.spaceId === spaceId)?.children ?? [];
}

/** Every room and space below a space, at any depth */
export function descendantsOf(graph: SpaceNode[], spaceId: string): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    for (const child of childrenOf(graph, id)) {
      if (seen.has(child.roomId)) continue;
      seen.add(child.roomId);
      visit(child.roomId);
    }
  };
  visit(spaceId);
  return seen;
}

/** Rooms that are in no joined space */
export function isInAnySpace(graph: SpaceNode[], roomId: string): boolean {
  return graph.some((s) => s.children.some((c) => c.roomId === roomId));
}

/** Live details (name, topic, permissions, pinned events) of a room */
export function useRoomDetails(roomId: string | null | undefined): RoomDetails | null {
  const [details, setDetails] = useState<RoomDetails | null>(null);
  useEffect(() => {
    const client = getMatrixClientOrNull();
    setDetails(null);
    if (!client || !roomId) return;
    const subscription = client.watchRoomDetails(roomId, setDetails);
    return () => subscription.cancel();
  }, [roomId]);
  return details;
}

/** React Query keys for core data; invalidate them after changing the data */
export const queryKeys = {
  roomSettings: (roomId: string) => ['roomSettings', roomId] as const,
  members: (roomId: string) => ['members', roomId] as const,
  membersIn: (roomId: string, membership: string) => ['membersIn', roomId, membership] as const,
  profile: (userId: string) => ['profile', userId] as const,
  trust: (userId: string) => ['trust', userId] as const,
  capabilities: () => ['capabilities'] as const,
  notificationPrefs: () => ['notificationPrefs'] as const,
  roomNotificationMode: (roomId: string) => ['roomNotificationMode', roomId] as const,
  devices: () => ['devices'] as const,
  banner: (userId: string) => ['banner', userId] as const,
  spaceChildren: (spaceId: string) => ['spaceChildren', spaceId] as const,
  widgets: (roomId: string) => ['widgets', roomId] as const,
};

function useCoreQuery<T>(
  key: readonly unknown[],
  fetch: (client: WizardClient) => Promise<T>,
  enabled = true,
  staleTime = 30_000
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => fetch(getMatrixClientOrNull()!),
    enabled: enabled && !!getMatrixClientOrNull(),
    staleTime,
  });
}

/**
 * Full room settings from the server (join rules, history, aliases, power levels, ...); until
 * they arrive, what local state has (`isPlaceholderData` is set then, and `published` and
 * `localAliases` are still empty).
 */
export function useRoomSettings(roomId: string | null | undefined) {
  const local = useCoreQuery<RoomSettings>(
    [...queryKeys.roomSettings(roomId ?? ''), 'local'],
    (c) => c.localRoomSettings(roomId!),
    !!roomId
  );
  const full = useCoreQuery<RoomSettings>(
    queryKeys.roomSettings(roomId ?? ''),
    (c) => c.roomSettings(roomId!),
    !!roomId
  );
  return useMemo(
    () =>
      full.data === undefined && local.data !== undefined
        ? { ...full, data: local.data, isPlaceholderData: true }
        : full,
    [full, local.data]
  );
}

export function refreshRoomSettings(queryClient: QueryClient, roomId: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.roomSettings(roomId) });
}

/** Joined and invited members, refetched when the member count changes */
export function useMembers(roomId: string | null | undefined) {
  const room = useRoom(roomId);
  const queryClient = useQueryClient();
  const query = useCoreQuery<Member[]>(
    queryKeys.members(roomId ?? ''),
    (c) => c.members(roomId!),
    !!roomId
  );
  const count = room?.memberCount;
  useEffect(() => {
    if (roomId && count !== undefined)
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(roomId) });
  }, [roomId, count, queryClient]);
  return query;
}

export function useMember(
  roomId: string | null | undefined,
  userId: string | null | undefined
): Member | null {
  const { data } = useMembers(roomId);
  return useMemo(() => data?.find((m) => m.userId === userId) ?? null, [data, userId]);
}

/** Banned, knocking or invited people */
export function useMembersIn(
  roomId: string | null | undefined,
  membership: 'ban' | 'knock' | 'invite'
) {
  return useCoreQuery<MemberEntry[]>(
    queryKeys.membersIn(roomId ?? '', membership),
    (c) => c.membersInState(roomId!, membership),
    !!roomId
  );
}

export function useProfile(userId: string | null | undefined) {
  return useCoreQuery<UserProfile>(
    queryKeys.profile(userId ?? ''),
    (c) => c.userProfile(userId!),
    !!userId,
    60_000
  );
}

export function useServerCapabilities() {
  return useCoreQuery(queryKeys.capabilities(), (c) => c.serverCapabilities(), true, 10 * 60_000);
}

/** Every room's account data of one type (roomId -> content), live */
export function useRoomAccountData<T = Record<string, unknown>>(
  eventType: string
): ReadonlyMap<string, T> {
  const [data, setData] = useState<ReadonlyMap<string, T>>(() => new Map());
  useEffect(() => {
    const client = getMatrixClientOrNull();
    setData(new Map());
    if (!client) return;
    const subscription = client.watchRoomAccountData(eventType, (pairs) =>
      setData(new Map(pairs.map(([roomId, content]) => [roomId, content as T])))
    );
    return () => subscription.cancel();
  }, [eventType]);
  return data;
}

/** An account data event's content, live */
export function useAccountData<T = Record<string, unknown>>(eventType: string): T | null {
  const [content, setContent] = useState<T | null>(null);
  useEffect(() => {
    const client = getMatrixClientOrNull();
    if (!client) return;
    const subscription = client.watchAccountData(eventType, (c) => setContent((c as T) ?? null));
    return () => subscription.cancel();
  }, [eventType]);
  return content;
}

/** The power level a user has in the room, from the power levels content */
export function powerLevelOf(
  levels: Record<string, unknown> | undefined,
  userId: string,
  creators: string[] = []
): number {
  if (creators.includes(userId)) return Infinity;
  const users = (levels?.users ?? {}) as Record<string, number>;
  return users[userId] ?? (levels?.users_default as number | undefined) ?? 0;
}

/** Whether a user can moderate (kick, ban or remove others' messages), which shows the audit log */
export function canViewAuditLog(settings: RoomSettings | undefined, userId: string): boolean {
  if (!settings) return false;
  const levels = settings.powerLevels as Record<string, unknown> | undefined;
  const level = (key: string) => {
    const value = levels?.[key];
    return typeof value === 'number' ? value : 50;
  };
  const needed = Math.min(level('kick'), level('ban'), level('redact'));
  return powerLevelOf(levels, userId, settings.creators) >= needed;
}

/** Whether a user may send a state event of `type` */
export function canSendState(
  settings: RoomSettings | undefined,
  userId: string,
  type: string
): boolean {
  if (!settings) return false;
  const levels = settings.powerLevels;
  const needed =
    (levels?.events?.[type] as number | undefined) ??
    (levels?.state_default as number | undefined) ??
    50;
  return powerLevelOf(levels, userId, settings.creators) >= needed;
}

/** Whether a user may send a message-like event of `type` */
export function canSendEvent(
  settings: RoomSettings | undefined,
  userId: string,
  type: string
): boolean {
  if (!settings) return false;
  const levels = settings.powerLevels;
  const needed =
    (levels?.events?.[type] as number | undefined) ??
    (levels?.events_default as number | undefined) ??
    0;
  return powerLevelOf(levels, userId, settings.creators) >= needed;
}
