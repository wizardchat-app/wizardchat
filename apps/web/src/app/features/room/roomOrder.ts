import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useAccountData, useClient } from '@/app/data';

const ORDER_MIN = 0x20;
const ORDER_MAX = 0x7e;
const ORDER_BASE = ORDER_MAX - ORDER_MIN + 1;
const ORDER_MAX_LENGTH = 50;

export function isValidSpaceOrder(order: unknown): order is string {
  if (typeof order !== 'string' || order.length === 0 || order.length > ORDER_MAX_LENGTH) {
    return false;
  }
  for (let i = 0; i < order.length; i++) {
    const c = order.charCodeAt(i);
    if (c < ORDER_MIN || c > ORDER_MAX) return false;
  }
  return true;
}

export interface SpaceChildSortKey {
  roomId: string;
  order?: string;
  ts: number;
}

export function compareSpaceChildren(a: SpaceChildSortKey, b: SpaceChildSortKey): number {
  const ao = isValidSpaceOrder(a.order) ? a.order : undefined;
  const bo = isValidSpaceOrder(b.order) ? b.order : undefined;
  if (ao !== undefined && bo !== undefined && ao !== bo) return ao < bo ? -1 : 1;
  if (ao !== undefined && bo === undefined) return -1;
  if (ao === undefined && bo !== undefined) return 1;
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
}

const toDigits = (s: string): number[] => [...s].map((c) => c.charCodeAt(0) - ORDER_MIN);
const fromDigits = (d: number[]): string => String.fromCharCode(...d.map((x) => x + ORDER_MIN));

export function orderBetween(a: string | undefined, b: string | undefined): string | null {
  const da = a ? toDigits(a) : [];
  let db: number[] | null = b ? toDigits(b) : null;
  const result: number[] = [];
  for (let i = 0; i < ORDER_MAX_LENGTH; i++) {
    const lo = i < da.length ? da[i] : 0;
    const hi = db ? (i < db.length ? db[i] : 0) : ORDER_BASE;
    if (hi - lo > 1) {
      result.push(Math.floor((lo + hi) / 2));
      return fromDigits(result);
    }
    result.push(lo);
    if (hi > lo) db = null;
  }
  return null;
}

function spreadOrders(count: number): string[] {
  const orders: string[] = [];
  let prev: string | undefined;
  for (let i = 0; i < count; i++) {
    // Leave room after each key for later insertions
    const next = orderBetween(prev, undefined) ?? `${prev ?? ''}~`;
    orders.push(next);
    prev = next;
  }
  return orders;
}

export function planSpaceReorder(
  orderedIds: string[],
  currentOrders: ReadonlyMap<string, string | undefined>,
  movedId: string
): Map<string, string> {
  const index = orderedIds.indexOf(movedId);
  const prevOrder = index > 0 ? currentOrders.get(orderedIds[index - 1]) : undefined;
  const nextOrder =
    index < orderedIds.length - 1 ? currentOrders.get(orderedIds[index + 1]) : undefined;
  const neighboursOrdered =
    (index === 0 || isValidSpaceOrder(prevOrder)) &&
    (index === orderedIds.length - 1 || isValidSpaceOrder(nextOrder));
  if (neighboursOrdered) {
    const between = orderBetween(prevOrder, nextOrder);
    if (between) return new Map([[movedId, between]]);
  }
  const fresh = spreadOrders(orderedIds.length);
  const updates = new Map<string, string>();
  orderedIds.forEach((id, i) => {
    if (currentOrders.get(id) !== fresh[i]) updates.set(id, fresh[i]);
  });
  return updates;
}

export async function saveSpaceChildOrders(
  client: WizardClient,
  spaceId: string,
  updates: ReadonlyMap<string, string>
): Promise<void> {
  for (const [childId, order] of updates) {
    await client.updateSpaceChild(spaceId, childId, undefined, order, false);
  }
}

export const HOME_ORDER_EVENT = 'org.wizardchat.home_order';

export function getHomeOrder(content: Record<string, unknown> | null | undefined): string[] {
  const rooms = content?.rooms;
  return Array.isArray(rooms) ? rooms.filter((id): id is string => typeof id === 'string') : [];
}

export function useHomeOrder(): string[] {
  const content = useAccountData(HOME_ORDER_EVENT);
  return useMemo(() => getHomeOrder(content), [content]);
}

export async function saveHomeOrder(client: WizardClient, roomIds: string[]): Promise<void> {
  await client.setAccountData(HOME_ORDER_EVENT, { rooms: roomIds });
}

export function sortByHomeOrder<T>(
  items: T[],
  order: string[],
  idOf: (item: T) => string,
  nameOf: (item: T) => string
): T[] {
  const position = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = position.get(idOf(a));
    const pb = position.get(idOf(b));
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

export const SPACE_ORDER_EVENT = 'org.matrix.msc3230.space_order';
const FAVOURITE_TAG = 'm.favourite';
const OPTIMISTIC_MS = 15_000;

/** Orders the core streams from room account data, kept in memory so the sorters can stay synchronous */
function createOrderStore<T>(eventType: string, extract: (content: unknown) => T | undefined) {
  let owner: WizardClient | null = null;
  let stop: (() => void) | null = null;
  let users = 0;
  const loaded = new Map<string, T>();
  const optimistic = new Map<string, { value: T; until: number }>();
  const listeners = new Set<() => void>();
  let version = 0;

  const notify = () => {
    version++;
    listeners.forEach((l) => l());
  };

  const bind = (client: WizardClient) => {
    if (owner === client) return;
    stop?.();
    owner = client;
    loaded.clear();
    optimistic.clear();
    const subscription = client.watchRoomAccountData(eventType, (pairs) => {
      loaded.clear();
      for (const [id, content] of pairs) {
        const value = extract(content);
        if (value !== undefined) loaded.set(id, value);
        if (optimistic.get(id)?.value === value) optimistic.delete(id);
      }
      notify();
    });
    stop = () => subscription.cancel();
  };
  const get = (id: string | null | undefined): T | undefined => {
    if (!id) return undefined;
    const pending = optimistic.get(id);
    if (pending && pending.until > Date.now()) return pending.value;
    return loaded.get(id);
  };
  const setOptimistic = (client: WizardClient, id: string, value: T) => {
    bind(client);
    optimistic.set(id, { value, until: Date.now() + OPTIMISTIC_MS });
    notify();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useOrders = (): number => {
    const client = useClient();
    useEffect(() => {
      bind(client);
      users++;
      return () => {
        users--;
        if (users === 0 && owner === client) {
          stop?.();
          stop = null;
          owner = null;
        }
      };
    }, [client]);
    return useSyncExternalStore(subscribe, () => version);
  };
  return { get, setOptimistic, useOrders };
}

const favouriteOrders = createOrderStore<number>('m.tag', (content) => {
  const tags = (content as { tags?: Record<string, { order?: unknown }> } | null)?.tags;
  const order = tags?.[FAVOURITE_TAG]?.order;
  return typeof order === 'number' && Number.isFinite(order) ? order : undefined;
});

const spaceBarOrders = createOrderStore<string>(SPACE_ORDER_EVENT, (content) => {
  const order = (content as { order?: unknown } | null)?.order;
  return isValidSpaceOrder(order) ? order : undefined;
});

/** Keeps the favourite tag orders live; use the returned version as a memo dependency of sortFavourites */
export function useFavouriteOrders(): number {
  return favouriteOrders.useOrders();
}

/** Keeps the space bar orders live; use the returned version as a memo dependency of sortSpaceBar */
export function useSpaceBarOrders(): number {
  return spaceBarOrders.useOrders();
}

export function getFavouriteOrder(roomId: string | null | undefined): number | undefined {
  return favouriteOrders.get(roomId);
}

export function sortFavourites<T>(
  items: T[],
  roomIdOf: (item: T) => string | null | undefined,
  nameOf: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const oa = getFavouriteOrder(roomIdOf(a));
    const ob = getFavouriteOrder(roomIdOf(b));
    if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
    if (oa !== undefined && ob === undefined) return -1;
    if (oa === undefined && ob !== undefined) return 1;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

export async function saveFavouriteOrder(client: WizardClient, roomIds: string[]): Promise<void> {
  const count = roomIds.length;
  for (let i = 0; i < count; i++) {
    const order = (i + 1) / (count + 1);
    if (getFavouriteOrder(roomIds[i]) === order) continue;
    await client.setFavouriteOrder(roomIds[i], order);
    favouriteOrders.setOptimistic(client, roomIds[i], order);
  }
}

export function getSpaceBarOrder(spaceId: string | null | undefined): string | undefined {
  return spaceBarOrders.get(spaceId);
}

export function sortSpaceBar<T>(items: T[], roomIdOf: (item: T) => string | null | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, order: getSpaceBarOrder(roomIdOf(item)) }))
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
        return a.order < b.order ? -1 : 1;
      }
      if (a.order !== undefined && b.order === undefined) return -1;
      if (a.order === undefined && b.order !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export async function saveSpaceBarOrders(
  client: WizardClient,
  updates: ReadonlyMap<string, string>
): Promise<void> {
  for (const [spaceId, order] of updates) {
    await client.setRoomAccountData(spaceId, SPACE_ORDER_EVENT, { order });
    spaceBarOrders.setOptimistic(client, spaceId, order);
  }
}

export function applyPendingOrder<T>(
  items: T[],
  sectionIds: ReadonlySet<string>,
  pendingIds: string[] | null,
  roomIdOf: (item: T) => string | null
): T[] {
  if (!pendingIds) return items;
  const positions: number[] = [];
  const byId = new Map<string, T>();
  items.forEach((item, i) => {
    const id = roomIdOf(item);
    if (id && sectionIds.has(id)) {
      positions.push(i);
      byId.set(id, item);
    }
  });
  if (positions.length !== pendingIds.length || !pendingIds.every((id) => byId.has(id))) {
    return items;
  }
  const out = [...items];
  positions.forEach((pos, k) => {
    out[pos] = byId.get(pendingIds[k])!;
  });
  return out;
}
