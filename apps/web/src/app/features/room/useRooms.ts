import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { InviteInfo, RoomSummary, SpaceNode } from '@wizardchat/core';
import { useHomeOrder, sortByHomeOrder } from './roomOrder';
import { pinnedSubSpacesAtom } from '@/app/store/atoms/rooms';
import { mergeHomeAndDmsAtom } from '@/app/store/atoms/settings';
import { callRoomIdAtom } from '@/app/store/atoms/call';
import {
  childrenOf,
  isInAnySpace,
  useAllRooms,
  useJoinedSpaces,
  useSpaceGraph,
  useSyncReady,
} from '@/app/data';
import { formatUserId, isDmRoom, isVoiceRoom } from '@/util/matrix';
import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';
import { useJoinedSpaceInfo } from '@/app/features/space/spaceHierarchy';

export interface RoomEntry {
  room: RoomSummary;
  roomId: string;
  name: string;
  avatarMxc: string | null;
  unreadCount: number;
  hasNotif: boolean;
  inviterUserId: string | null;
  inviterDisplayName: string | null;
  hasVoiceRoom: boolean;
}

export function buildRoomEntry(room: RoomSummary, invite?: InviteInfo | null): RoomEntry {
  const hasVoiceRoom = isVoiceRoom(room);

  let inviterUserId: string | null = null;
  let inviterDisplayName: string | null = null;
  if (room.isInvite && invite) {
    inviterUserId = invite.inviterId;
    inviterDisplayName = invite.inviterName ?? formatUserId(invite.inviterId) ?? null;
  }

  return {
    room,
    roomId: room.id,
    name: room.name ?? room.id,
    avatarMxc: room.avatarUrl ?? null,
    unreadCount: getRoomUnreadCount(room),
    hasNotif: roomHasUnreadMention(room),
    inviterUserId,
    inviterDisplayName,
    hasVoiceRoom,
  };
}

export function useRooms() {
  const allRooms = useAllRooms();
  const graph = useSpaceGraph();
  const homeOrder = useHomeOrder();
  const loading = !useSyncReady();

  const rooms = useMemo((): RoomEntry[] => {
    const entries = allRooms
      .filter((room) => {
        if (room.isInvite) return false;
        if (room.isTombstoned) return false;
        if (isDmRoom(room)) return false;

        // Home: rooms not in any space.
        return !isInAnySpace(graph, room.id);
      })
      .map((room) => buildRoomEntry(room));
    return sortByHomeOrder(
      entries,
      homeOrder,
      (e) => e.roomId,
      (e) => e.name
    );
  }, [allRooms, graph, homeOrder]);

  return { rooms, loading };
}

export interface SpaceEntry {
  roomId: string;
  name: string;
  avatarMxc: string | null;
  unreadCount: number;
  hasNotif: boolean;
  hasMention: boolean;
  hasCall: boolean;
}

export interface SpacesData {
  spaces: SpaceEntry[];
  homeHasNotif: boolean;
  homeHasMention: boolean;
  dmsHasNotif: boolean;
  dmsHasMention: boolean;
  homeHasCall: boolean;
  dmsHasCall: boolean;
}

function isJoinedSpace(graph: SpaceNode[], id: string): boolean {
  return graph.some((s) => s.spaceId === id);
}

export function useSpaces() {
  const allRooms = useAllRooms();
  const graph = useSpaceGraph();
  const topLevel = useJoinedSpaces();
  const pinnedSubSpacesArr = useAtomValue(pinnedSubSpacesAtom);
  const mergeHomeAndDms = useAtomValue(mergeHomeAndDmsAtom);
  const callRoomId = useAtomValue(callRoomIdAtom);

  const pinnedJoined = useMemo(() => {
    const top = new Set(topLevel.map((s) => s.id));
    return pinnedSubSpacesArr.filter((id) => !top.has(id) && isJoinedSpace(graph, id));
  }, [pinnedSubSpacesArr, topLevel, graph]);
  const spaceInfo = useJoinedSpaceInfo(pinnedJoined);

  return useMemo((): SpacesData => {
    const roomsById = new Map(allRooms.map((r) => [r.id, r]));

    const aggregateUnread = (
      spaceId: string,
      visited = new Set<string>()
    ): { unreadCount: number; hasNotif: boolean; hasMention: boolean; hasCall: boolean } => {
      if (visited.has(spaceId))
        return { unreadCount: 0, hasNotif: false, hasMention: false, hasCall: false };
      visited.add(spaceId);
      if (!isJoinedSpace(graph, spaceId))
        return { unreadCount: 0, hasNotif: false, hasMention: false, hasCall: false };
      let unreadCount = 0;
      let hasNotif = false;
      let hasMention = false;
      let hasCall = false;
      for (const { roomId: childId } of childrenOf(graph, spaceId)) {
        if (isJoinedSpace(graph, childId)) {
          const sub = aggregateUnread(childId, visited);
          unreadCount += sub.unreadCount;
          if (sub.hasNotif) hasNotif = true;
          if (sub.hasMention) hasMention = true;
          if (sub.hasCall) hasCall = true;
          continue;
        }
        const child = roomsById.get(childId);
        if (!child || child.isInvite) continue;
        if (isDmRoom(child)) continue;
        if (child.isTombstoned) continue;
        if (childId === callRoomId) hasCall = true;
        const childUnread = getRoomUnreadCount(child);
        unreadCount += childUnread;
        if (childUnread > 0) hasNotif = true;
        if (roomHasUnreadMention(child)) hasMention = true;
      }
      return { unreadCount, hasNotif: hasNotif || hasMention, hasMention, hasCall };
    };

    const toEntry = (id: string, name: string | null, avatarMxc: string | null): SpaceEntry => {
      const { unreadCount, hasNotif, hasMention, hasCall } = aggregateUnread(id);
      return {
        roomId: id,
        name: name || id,
        avatarMxc,
        unreadCount,
        hasNotif,
        hasMention,
        hasCall,
      };
    };

    const spaces: SpaceEntry[] = [
      ...topLevel.map((space) => toEntry(space.id, space.name, space.avatarUrl ?? null)),
      ...pinnedJoined.map((id) => {
        const info = spaceInfo.get(id);
        return toEntry(id, info?.name ?? null, info?.avatarUrl ?? null);
      }),
    ];

    const joinedRooms = allRooms.filter((room) => !room.isInvite && !room.isTombstoned);

    // Home: rooms not in any space, not DMs
    const homeRooms = joinedRooms.filter(
      (room) => !isDmRoom(room) && !isInAnySpace(graph, room.id)
    );
    const homeHasMention = homeRooms.some((r) => roomHasUnreadMention(r));
    const homeHasNotif = homeHasMention || homeRooms.some((r) => getRoomUnreadCount(r) > 0);
    const homeHasCall = homeRooms.some((r) => r.id === callRoomId);

    // DMs
    const dmRooms = joinedRooms.filter((room) => isDmRoom(room));
    const dmsHasMention = dmRooms.some((r) => roomHasUnreadMention(r));
    const dmsHasNotif = dmsHasMention || dmRooms.some((r) => getRoomUnreadCount(r) > 0);
    const dmsHasCall = dmRooms.some((r) => r.id === callRoomId);

    return {
      spaces,
      homeHasNotif: homeHasNotif || (mergeHomeAndDms && dmsHasNotif),
      homeHasMention: homeHasMention || (mergeHomeAndDms && dmsHasMention),
      dmsHasNotif,
      dmsHasMention,
      homeHasCall: homeHasCall || (mergeHomeAndDms && dmsHasCall),
      dmsHasCall,
    };
  }, [allRooms, graph, topLevel, pinnedJoined, spaceInfo, callRoomId, mergeHomeAndDms]);
}
