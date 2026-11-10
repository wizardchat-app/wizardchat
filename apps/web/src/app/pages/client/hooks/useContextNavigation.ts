import { useCallback, useEffect } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import type { RoomSummary, SpaceNode } from '@wizardchat/core';
import {
  currentRoomIdAtom,
  currentSpaceIdAtom,
  favouriteRoomsAtom,
  lastRoomByContextAtom,
  sidebarViewAtom,
} from '@/app/store/atoms';
import type { SidebarView } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  childrenOf,
  isInAnySpace,
  roomsAtom,
  spaceGraphAtom,
  useAllRooms,
  useSpaceGraph,
} from '@/app/data';

const OVERVIEW = 'overview';

export interface ContextNavState {
  sidebarView: SidebarView;
  currentSpaceId: string | null;
  keepDrawer?: boolean;
}

function contextKey(view: SidebarView, spaceId: string | null): string | null {
  if (view === 'space') return spaceId;
  return view;
}

interface NavData {
  rooms: RoomSummary[];
  byId: Map<string, RoomSummary>;
  graph: SpaceNode[];
}

function navData(rooms: RoomSummary[], graph: SpaceNode[]): NavData {
  return { rooms, byId: new Map(rooms.map((r) => [r.id, r])), graph };
}

function childIds(data: NavData, spaceId: string): string[] {
  return childrenOf(data.graph, spaceId)
    .map((c) => c.roomId)
    .filter((id) => !!id && id !== spaceId);
}

function isJoinedSpace(data: NavData, id: string): boolean {
  return data.graph.some((s) => s.spaceId === id);
}

function spaceRooms(data: NavData, spaceId: string): RoomSummary[][] {
  const levels: RoomSummary[][] = [];
  const visited = new Set<string>([spaceId]);
  let queue = [spaceId];
  while (queue.length > 0) {
    const level: RoomSummary[] = [];
    const next: string[] = [];
    for (const id of queue) {
      if (!isJoinedSpace(data, id)) continue;
      for (const childId of childIds(data, id)) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        if (isJoinedSpace(data, childId)) {
          next.push(childId);
          continue;
        }
        const child = data.byId.get(childId);
        if (!child || child.isInvite) continue;
        if (!child.isDirect && !child.isTombstoned) level.push(child);
      }
    }
    if (level.length > 0) levels.push(level);
    queue = next;
  }
  return levels;
}

function isRememberable(data: NavData, key: string, roomId: string): boolean {
  const room = data.byId.get(roomId);
  if (!room || room.isInvite || room.isTombstoned) return false;
  if (key === 'dms') return room.isDirect;
  if (room.isDirect) return false;
  if (key === 'home') return !isInAnySpace(data.graph, roomId);
  return spaceRooms(data, key).some((level) => level.some((r) => r.id === roomId));
}

function roomName(room: RoomSummary): string {
  return room.name ?? room.id;
}

function firstInListOrder(
  rooms: RoomSummary[],
  favourites: ReadonlySet<string>
): RoomSummary | undefined {
  return [...rooms].sort((a, b) => {
    const fav = Number(favourites.has(b.id)) - Number(favourites.has(a.id));
    return fav || roomName(a).localeCompare(roomName(b));
  })[0];
}

function roomPath(data: NavData, roomId: string): string {
  const isDm = !!data.byId.get(roomId)?.isDirect;
  return `/${isDm ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`;
}

function resolveTarget(
  data: NavData,
  view: SidebarView,
  spaceId: string | null,
  lastRooms: Record<string, string>,
  favourites: ReadonlySet<string>
): string {
  const key = contextKey(view, spaceId);
  const remembered = key ? lastRooms[key] : undefined;

  if (view === 'space' && spaceId) {
    if (remembered === OVERVIEW) return `/space/${encodeURIComponent(spaceId)}`;
    if (remembered && isRememberable(data, spaceId, remembered)) {
      return roomPath(data, remembered);
    }
    // Top-level rooms before sub-space rooms
    for (const level of spaceRooms(data, spaceId)) {
      const first = firstInListOrder(level, favourites);
      if (first) return roomPath(data, first.id);
    }
    return `/space/${encodeURIComponent(spaceId)}`;
  }

  if (remembered && key && isRememberable(data, key, remembered)) {
    return roomPath(data, remembered);
  }

  if (view === 'home') return '/';

  if (view === 'dms') {
    const latest = data.rooms
      .filter((r) => isRememberable(data, 'dms', r.id))
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))[0];
    if (latest) return roomPath(data, latest.id);
  }

  return '/';
}

export function useRecordLastRoom() {
  const rooms = useAllRooms();
  const graph = useSpaceGraph();
  const location = useLocation();
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const setLastRooms = useSetAtom(lastRoomByContextAtom);

  useEffect(() => {
    const key = contextKey(sidebarView, currentSpaceId);
    if (!key) return;

    let value: string | null = null;
    const overviewMatch = location.pathname.match(/^\/space\/(.+)/);
    if (overviewMatch) {
      if (decodeURIComponent(overviewMatch[1]) === key) value = OVERVIEW;
    } else if (location.pathname === '/' && key === 'home') {
      value = OVERVIEW;
    } else if (currentRoomId && isRememberable(navData(rooms, graph), key, currentRoomId)) {
      value = currentRoomId;
    }
    if (!value) return;

    const stored = value;
    setLastRooms((prev) => (prev[key] === stored ? prev : { ...prev, [key]: stored }));
  }, [rooms, graph, location.pathname, sidebarView, currentSpaceId, currentRoomId, setLastRooms]);
}

export function useSwitchContext() {
  const navigate = useNavigate();
  const store = useStore();

  return useCallback(
    (view: SidebarView, spaceId: string | null) => {
      const client = getMatrixClientOrNull();
      const state: ContextNavState = {
        sidebarView: view,
        currentSpaceId: spaceId,
        keepDrawer: true,
      };
      if (!client) {
        navigate('/', { state });
        return;
      }
      const target = resolveTarget(
        navData(store.get(roomsAtom), store.get(spaceGraphAtom)),
        view,
        spaceId,
        store.get(lastRoomByContextAtom),
        store.get(favouriteRoomsAtom)
      );
      navigate(target, { state });
    },
    [navigate, store]
  );
}
