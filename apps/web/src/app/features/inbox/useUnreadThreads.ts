import { useCallback, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { RoomSummary } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';

const MAX_THREADS = 50;

export interface UnreadThreadEntry {
  roomId: string;
  rootEventId: string;
  roomName: string;
  roomAvatarMxc: string | null;
  rootBody: string | null;
  senderName: string;
  latestBody: string | null;
  unread: number;
  ts: number;
  kind: 'room' | 'dm';
}

function threadRooms(rooms: RoomSummary[]): RoomSummary[] {
  return rooms.filter(
    (room) => !room.isInvite && !room.isSpace && !room.isTombstoned && room.unreadThreads > 0
  );
}

export function useUnreadThreads(enabled: boolean) {
  const rooms = useAllRooms();
  const queryClient = useQueryClient();
  const withThreads = useMemo(() => (enabled ? threadRooms(rooms) : []), [enabled, rooms]);

  const results = useQueries({
    queries: withThreads.map((room) => ({
      queryKey: ['unreadThreads', room.id, room.unreadThreads, room.lastActivity],
      queryFn: () => getMatrixClientOrNull()!.unreadThreads(room.id),
      enabled: !!getMatrixClientOrNull(),
      staleTime: Infinity,
    })),
  });

  const threads = useMemo((): UnreadThreadEntry[] => {
    const list: UnreadThreadEntry[] = [];
    withThreads.forEach((room, i) => {
      const dmPartnerId = room.isDirect ? room.dmUserId : null;
      const roomName = dmPartnerId
        ? (room.dmUserName ?? formatUserId(dmPartnerId))
        : (room.name ?? room.id);
      for (const thread of results[i]?.data ?? []) {
        list.push({
          roomId: room.id,
          rootEventId: thread.rootEventId,
          roomName,
          roomAvatarMxc: dmPartnerId ? room.dmUserAvatar : room.avatarUrl,
          rootBody: thread.rootBody,
          senderName: thread.latestSenderName || formatUserId(thread.latestSender),
          latestBody: thread.latestBody,
          unread: thread.unread,
          ts: thread.latestTimestamp,
          kind: dmPartnerId ? 'dm' : 'room',
        });
      }
    });
    return list.sort((a, b) => b.ts - a.ts).slice(0, MAX_THREADS);
  }, [withThreads, results]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['unreadThreads'] });
  }, [queryClient]);

  return { threads, refresh };
}

export function useHasUnreadThreads(): boolean {
  const rooms = useAllRooms();
  return useMemo(() => threadRooms(rooms).length > 0, [rooms]);
}
