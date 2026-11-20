import { atom, type Getter, type PrimitiveAtom, type SetStateAction, type Setter } from 'jotai';
import type {
  RoomSection,
  RoomSummary,
  SpaceNode,
  SpaceSummary,
  SyncState,
} from '@wizardchat/core';

/** The core's room list as it streams in: joined, invited (spaces too) and knocked rooms */
export const roomListAtom = atom<RoomSummary[]>([]);
const spaceListAtom = atom<SpaceSummary[]>([]);
const spaceGraphListAtom = atom<SpaceNode[]>([]);
/** Rooms and spaces left in this session, hidden until the lists drop them */
const leftRoomIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

function listedIds(get: Getter): Set<string> {
  return new Set([
    ...get(roomListAtom).map((r) => r.id),
    ...get(spaceListAtom).map((s) => s.id),
    ...get(spaceGraphListAtom).map((s) => s.spaceId),
  ]);
}

/** Forgets left rooms once no list has them any more, so rejoining shows them again */
function pruneLeft(get: Getter, set: Setter) {
  const left = get(leftRoomIdsAtom);
  if (left.size === 0) return;
  const present = listedIds(get);
  const kept = [...left].filter((id) => present.has(id));
  if (kept.length !== left.size) set(leftRoomIdsAtom, new Set(kept));
}

function listAtom<T>(base: PrimitiveAtom<T[]>, idOf: (item: T) => string) {
  return atom(
    (get) => {
      const left = get(leftRoomIdsAtom);
      const items = get(base);
      return left.size === 0 ? items : items.filter((item) => !left.has(idOf(item)));
    },
    (get, set, update: SetStateAction<T[]>) => {
      set(base, update);
      pruneLeft(get, set);
    }
  );
}

const visibleRoomsAtom = listAtom<RoomSummary>(roomListAtom, (r) => r.id);

/**
 * Every joined room and every invite (space invites included), kept current by `DataSync`.
 * Knocked rooms aren't joined, so they're left out (see `knockedRoomIdsAtom`).
 */
export const roomsAtom = atom(
  (get) => get(visibleRoomsAtom).filter((r) => !r.isKnocked),
  (_get, set, update: SetStateAction<RoomSummary[]>) => set(visibleRoomsAtom, update)
);
/** Top-level joined spaces */
export const spacesAtom = listAtom<SpaceSummary>(spaceListAtom, (s) => s.id);
/** Which rooms each joined space contains */
export const spaceGraphAtom = listAtom<SpaceNode>(spaceGraphListAtom, (s) => s.spaceId);

/** Rooms the user asked to join and is waiting for */
export const knockedRoomIdsAtom = atom(
  (get) =>
    new Set(
      get(roomListAtom)
        .filter((r) => r.isKnocked)
        .map((r) => r.id)
    )
);

export const syncStateAtom = atom<SyncState>('idle');
/** The room list sections in list order */
export const roomSectionsAtom = atom<RoomSection[]>([]);
export const roomSectionOrderAtom = atom<string[]>([]);
/** Each room's tag names (`m.tag`) */
export const roomTagNamesAtom = atom<ReadonlyMap<string, string[]>>(new Map());
/** Set once the first sync finished */
export const syncReadyAtom = atom(false);

export const roomsByIdAtom = atom((get) => new Map(get(roomsAtom).map((r) => [r.id, r])));

/** Hides a room or space right after leaving it, before the lists catch up */
export const markRoomLeftAtom = atom(null, (get, set, roomId: string) => {
  if (!listedIds(get).has(roomId)) return;
  set(leftRoomIdsAtom, new Set([...get(leftRoomIdsAtom), roomId]));
});
