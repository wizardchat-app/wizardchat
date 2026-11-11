import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  groupImagesAtom,
  showJoinLeaveAtom,
  showProfileChangesAtom,
} from '@/app/store/atoms/settings';
import { useTranslation } from 'react-i18next';
import type { RoomTimeline, TimelineEntry, TimelineKind, WizardClient } from '@wizardchat/core';
import {
  useMembers,
  useRoomDetails,
  useRoomSettings,
  useTimeline as useCoreTimeline,
} from '@/app/data';
import { useIgnoredUsers } from '@/app/hooks/useIgnoredUsers';
import { formatUserId } from '@/util/matrix';
import { formatDateLabel } from '@/util/format';
import { isPinnedEvent } from '@/app/features/timeline/message/pinning';
import {
  computeRoomPermissions,
  computeMessagePermissions,
  type RoomPermissions,
} from '@/app/features/timeline/message/permissions';
import { entryEventId, isEventEntry, type EventEntry } from '@/app/features/timeline/message/entry';
import type { ItemRange } from '@/app/hooks/useVirtualPaginator';

export type { EventEntry };

const PAGINATION_LIMIT = 80;
const PAGINATION_TIMEOUT_MS = 25000;

const JOIN_CHANGES = new Set(['Joined', 'InvitationAccepted']);
const LEAVE_CHANGES = new Set(['Left', 'Kicked', 'KickedAndBanned']);

const EMPTY_REDACTED = new Set<string>();
const EMPTY_EDITS = new Map<string, string>();
const MAIN_KIND: TimelineKind = { type: 'main' };

export interface SystemEventOptions {
  showJoinLeave?: boolean;
  showProfileChanges?: boolean;
}

export function isTimelineRenderedEntry(
  entry: TimelineEntry,
  { showJoinLeave = true, showProfileChanges = false }: SystemEventOptions = {}
): entry is EventEntry {
  if (entry.kind !== 'event') return false;
  const { content } = entry;
  switch (content.type) {
    case 'membership':
      return (
        showJoinLeave &&
        content.change !== null &&
        (JOIN_CHANGES.has(content.change) || LEAVE_CHANGES.has(content.change))
      );
    case 'profileChange':
      return showProfileChanges;
    case 'state':
    case 'callPart':
    case 'other':
      return false;
    default:
      return true;
  }
}

/** Read avatars sit on messages only, not on joins, leaves or call events */
export function isReceiptAnchorEntry(entry: TimelineEntry): entry is EventEntry {
  if (!isTimelineRenderedEntry(entry)) return false;
  return entry.content.type !== 'membership' && entry.content.type !== 'call';
}

export interface TimelineItem {
  event: EventEntry;
  eventId: string;
  isOwn: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  isGrouped: boolean;
  showDateSep: boolean;
  dateSepLabel: string;
  isSystemMessage: boolean;
  reactionVersion: number;
  isEdited: boolean;
  isRedacted: boolean;
  isPinned: boolean;
  canEdit: boolean;
  canRedact: boolean;
  canPin: boolean;
  isDecrypting: boolean;
  isUndecryptable: boolean;
  isSending: boolean;
  isFailed: boolean;
  sendError: string | null;
  optimisticBody: string | null;
  galleryEvents: EventEntry[] | null;
}

export function itemContainsEvent(item: TimelineItem, eventId: string): boolean {
  if (item.eventId === eventId) return true;
  return item.galleryEvents?.some((e) => entryEventId(e) === eventId) ?? false;
}

export function indexOfEvent(items: TimelineItem[], eventId: string): number {
  return items.findIndex((item) => itemContainsEvent(item, eventId));
}

export type MemberLookup = (userId: string) => { name: string | null; avatarUrl: string | null };

export interface BuildContext {
  myId: string;
  roomPerms: RoomPermissions;
  pinnedIds: readonly string[];
  ignoredUsers: ReadonlySet<string>;
  lookupMember?: MemberLookup;
  decryptingIds?: ReadonlySet<string>;
  groupImages?: boolean;
  showJoinLeave?: boolean;
  showProfileChanges?: boolean;
}

export type BuildItemsSeed = { prevEvent?: EventEntry | null };

function isGalleryCandidate(e: EventEntry, redacted: ReadonlySet<string>): boolean {
  if (e.content.type !== 'image') return false;
  if (redacted.has(entryEventId(e))) return false;
  if (e.threadRoot) return false;
  return e.content.media.mimetype !== 'image/svg+xml';
}

export function buildItems(
  entries: TimelineEntry[],
  ctx: BuildContext,
  t: (key: string) => string,
  locale: string,
  optimisticRedactedIds: ReadonlySet<string> = EMPTY_REDACTED,
  optimisticEditBodies: ReadonlyMap<string, string> = EMPTY_EDITS,
  seed: BuildItemsSeed = {}
): TimelineItem[] {
  const {
    myId,
    roomPerms,
    pinnedIds,
    ignoredUsers,
    lookupMember,
    decryptingIds,
    groupImages = true,
    showJoinLeave = true,
    showProfileChanges = false,
  } = ctx;
  const shown = { showJoinLeave, showProfileChanges };
  const items: TimelineItem[] = [];
  const events = entries.filter(isEventEntry);

  const seedEvent = seed.prevEvent ?? null;
  let lastSenderId = seedEvent?.sender ?? '';
  let lastTs = seedEvent?.timestamp ?? 0;
  let lastDate = seedEvent ? formatDateLabel(seedEvent.timestamp, t, locale) : '';

  const GALLERY_GAP_MS = 5 * 60 * 1000;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!isTimelineRenderedEntry(event, shown)) continue;
    const isSystemMessage =
      event.content.type === 'membership' || event.content.type === 'profileChange';
    const isCallEvent = event.content.type === 'call';

    const sender = event.sender;
    if (sender !== myId && !isSystemMessage && !isCallEvent && ignoredUsers.has(sender)) continue;

    const eventId = entryEventId(event);

    const senderId = sender;
    const ts = event.timestamp;
    const dateLabel = formatDateLabel(ts, t, locale);
    const showDateSep = dateLabel !== lastDate;
    lastDate = dateLabel;

    const member = lookupMember?.(senderId);
    const senderName = event.senderName ?? member?.name ?? formatUserId(senderId);
    const senderAvatar = event.senderAvatar ?? member?.avatarUrl ?? null;

    const GROUP_MS = 5 * 60 * 1000;
    const isGrouped =
      !isSystemMessage &&
      !isCallEvent &&
      !showDateSep &&
      senderId === lastSenderId &&
      ts - lastTs < GROUP_MS;

    const isOptimisticallyRedacted = optimisticRedactedIds.has(eventId);
    const optimisticBody = optimisticEditBodies.get(eventId) ?? null;

    // Collapse consecutive image-only uploads from the same sender into a gallery.
    let galleryEvents: EventEntry[] | null = null;
    if (groupImages && isGalleryCandidate(event, optimisticRedactedIds)) {
      const group = [event];
      let prevTs = ts;
      for (let j = i + 1; j < events.length; j++) {
        const next = events[j];
        if (!isTimelineRenderedEntry(next, shown)) continue;
        if (!isGalleryCandidate(next, optimisticRedactedIds)) break;
        if (next.sender !== senderId) break;
        const nextTs = next.timestamp;
        if (nextTs - prevTs >= GALLERY_GAP_MS) break;
        if (formatDateLabel(nextTs, t, locale) !== dateLabel) break;
        group.push(next);
        prevTs = nextTs;
      }
      if (group.length >= 2) galleryEvents = group;
    }

    items.push({
      event,
      eventId,
      isOwn: event.isOwn || senderId === myId,
      senderId,
      senderName,
      senderAvatar,
      isGrouped,
      showDateSep,
      dateSepLabel: dateLabel,
      isSystemMessage: isSystemMessage || isCallEvent,
      reactionVersion: (galleryEvents ?? [event]).reduce(
        (sum, e) => sum + e.reactions.reduce((n, r) => n + r.count, 0),
        0
      ),
      isEdited: event.edited || optimisticBody !== null,
      isRedacted: event.content.type === 'redacted' || isOptimisticallyRedacted,
      isPinned: isPinnedEvent(pinnedIds, eventId),
      ...computeMessagePermissions(event, roomPerms),
      isDecrypting: event.content.type === 'unableToDecrypt' && !!decryptingIds?.has(eventId),
      isUndecryptable: event.content.type === 'unableToDecrypt' && !decryptingIds?.has(eventId),
      isSending: event.sendState === 'sending',
      isFailed: event.sendState === 'failed',
      sendError: event.sendState === 'failed' ? event.sendError : null,
      optimisticBody,
      galleryEvents,
    });

    if (galleryEvents !== null) {
      const galleryLast = galleryEvents[galleryEvents.length - 1];
      if (galleryLast) {
        i = events.indexOf(galleryLast, i);
        lastSenderId = galleryLast.sender;
        lastTs = galleryLast.timestamp;
      }
    } else if (isSystemMessage || isCallEvent) {
      lastSenderId = '';
      lastTs = 0;
    } else {
      lastSenderId = senderId;
      lastTs = ts;
    }
  }

  return items;
}

function galleryEventsEqual(a: TimelineItem, b: TimelineItem): boolean {
  const ga = a.galleryEvents;
  const gb = b.galleryEvents;
  if (!!ga !== !!gb) return false;
  if (!ga || !gb) return true;
  if (ga.length !== gb.length) return false;
  for (let i = 0; i < ga.length; i++) {
    if (ga[i] !== gb[i]) return false;
  }
  return true;
}

function itemsRenderEq(a: TimelineItem, b: TimelineItem): boolean {
  if (a.event !== b.event) return false;
  return (
    a.isRedacted === b.isRedacted &&
    a.reactionVersion === b.reactionVersion &&
    a.isEdited === b.isEdited &&
    a.isPinned === b.isPinned &&
    a.canEdit === b.canEdit &&
    a.canRedact === b.canRedact &&
    a.canPin === b.canPin &&
    a.senderName === b.senderName &&
    a.senderAvatar === b.senderAvatar &&
    a.isGrouped === b.isGrouped &&
    a.showDateSep === b.showDateSep &&
    a.dateSepLabel === b.dateSepLabel &&
    (a.optimisticBody ?? null) === (b.optimisticBody ?? null) &&
    a.isSystemMessage === b.isSystemMessage &&
    galleryEventsEqual(a, b)
  );
}

export function mergePreservingIdentity(
  built: TimelineItem[],
  previous: TimelineItem[]
): TimelineItem[] {
  if (previous.length === 0) return built;
  const prevById = new Map<string, TimelineItem>();
  for (const item of previous) prevById.set(item.event.id, item);
  return built.map((item) => {
    const prev = prevById.get(item.event.id);
    return prev && itemsRenderEq(prev, item) ? prev : item;
  });
}

/** How long an undecryptable event shows as "decrypting..." while its keys may still arrive */
const DECRYPTING_MS = 5000;

/**
 * Undecryptable events seen for less than DECRYPTING_MS. The core retries decryption as keys
 * arrive, so they first show as "decrypting...".
 */
function useDecryptingIds(events: EventEntry[]): ReadonlySet<string> {
  const firstSeen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());
  const ids = useMemo(() => {
    const seen = firstSeen.current;
    const current = Date.now();
    const result = new Set<string>();
    for (const event of events) {
      if (event.content.type !== 'unableToDecrypt') continue;
      const id = entryEventId(event);
      if (!seen.has(id)) seen.set(id, current);
      if (current - (seen.get(id) ?? current) < DECRYPTING_MS) result.add(id);
    }
    return result;
    // `now` re-evaluates the set when a window ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, now]);
  useEffect(() => {
    if (ids.size === 0) return undefined;
    const timer = window.setTimeout(() => setNow(Date.now()), DECRYPTING_MS);
    return () => window.clearTimeout(timer);
  }, [ids]);
  return ids;
}

export function useBuildContext(client: WizardClient, roomId: string | null): BuildContext {
  const myId = client.userId() ?? '';
  const details = useRoomDetails(roomId);
  const { data: settings } = useRoomSettings(roomId);
  const { data: members } = useMembers(roomId);
  const ignored = useIgnoredUsers();
  const groupImages = useAtomValue(groupImagesAtom);
  const showJoinLeave = useAtomValue(showJoinLeaveAtom);
  const showProfileChanges = useAtomValue(showProfileChangesAtom);

  const ignoredUsers = useMemo(() => new Set(ignored), [ignored]);
  const roomPerms = useMemo(
    () => computeRoomPermissions(details, settings, myId),
    [details, settings, myId]
  );
  const pinnedIds = details?.pinnedEventIds;
  const lookupMember = useMemo<MemberLookup | undefined>(() => {
    if (!members) return undefined;
    const byId = new Map(members.map((m) => [m.userId, m]));
    return (userId) => {
      const member = byId.get(userId);
      return { name: member?.displayName ?? null, avatarUrl: member?.avatarUrl ?? null };
    };
  }, [members]);

  const context = useMemo(
    () => ({
      myId,
      roomPerms,
      pinnedIds: pinnedIds ?? [],
      ignoredUsers,
      lookupMember,
      groupImages,
      showJoinLeave,
      showProfileChanges,
    }),
    [
      myId,
      roomPerms,
      pinnedIds,
      ignoredUsers,
      lookupMember,
      groupImages,
      showJoinLeave,
      showProfileChanges,
    ]
  );
  return context;
}

function findUnread(
  entries: TimelineEntry[],
  myId: string
): { firstUnread: string | null; readUpTo: string | null } {
  const marker = entries.findIndex((e) => e.kind === 'readMarker');
  if (marker === -1) return { firstUnread: null, readUpTo: null };
  let readUpTo: string | null = null;
  for (let i = marker - 1; i >= 0; i--) {
    const entry = entries[i];
    if (isReceiptAnchorEntry(entry)) {
      readUpTo = entryEventId(entry);
      break;
    }
  }
  for (let i = marker + 1; i < entries.length; i++) {
    const entry = entries[i];
    if (!isReceiptAnchorEntry(entry)) continue;
    if (entry.sender === myId) continue;
    return { firstUnread: entryEventId(entry), readUpTo };
  }
  return { firstUnread: null, readUpTo };
}

interface PendingJump {
  roomId: string;
  eventId: string;
  onLoad: (absIndex: number, eventId: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

function indexOfEventId(events: EventEntry[], eventId: string): number {
  return events.findIndex((e) => entryEventId(e) === eventId);
}

interface WindowState {
  events: EventEntry[];
  range: ItemRange;
  epoch: number;
}

function initialRange(length: number): ItemRange {
  return { start: Math.max(length - PAGINATION_LIMIT, 0), end: length };
}

function indexById(events: EventEntry[], id: string | undefined): number {
  if (id === undefined) return -1;
  return events.findIndex((e) => e.id === id);
}

function adjustWindow(prev: WindowState, events: EventEntry[], atBottom: boolean): WindowState {
  if (events.length === 0) return { events, range: { start: 0, end: 0 }, epoch: prev.epoch };
  if (prev.events.length === 0 || prev.range.end <= prev.range.start) {
    return { events, range: initialRange(events.length), epoch: prev.epoch + 1 };
  }
  const startIdx = indexById(events, prev.events[prev.range.start]?.id);
  const endIdx = indexById(events, prev.events[prev.range.end - 1]?.id);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    const start = Math.min(prev.range.start, events.length);
    const end = Math.min(Math.max(prev.range.end, start), events.length);
    return {
      events,
      range: end > start ? { start, end } : initialRange(events.length),
      epoch: prev.epoch,
    };
  }
  let start = startIdx;
  let end = endIdx + 1;
  const wasAtEnd = prev.range.end === prev.events.length;
  if (wasAtEnd && atBottom && end < events.length) {
    const appended = events.length - end;
    end = events.length;
    start = Math.min(start + appended, end - 1);
  }
  return { events, range: { start, end }, epoch: prev.epoch };
}

export interface UseTimelineResult {
  timeline: RoomTimeline | null;
  entries: TimelineEntry[];
  items: TimelineItem[];
  events: EventEntry[];
  buildContext: BuildContext;
  range: ItemRange;
  eventsLength: number;
  liveTimelineLinked: boolean;
  canPaginateBack: boolean;
  rangeAtStart: boolean;
  rangeAtEnd: boolean;
  isPaginating: boolean;
  timelineResetEpoch: number;
  firstUnreadEventId: string | null;
  readUpToEventId: string | null;
  clearUnreadDivider: () => void;
  setRange: (range: ItemRange) => void;
  handlePaginate: (backwards: boolean) => Promise<void>;
  getEventAtIndex: (index: number) => EventEntry | undefined;
  getEventIndex: (eventId: string) => number | undefined;
  loadEventTimeline: (
    eventId: string,
    onLoad: (absIndex: number, eventId: string) => void,
    onError: (err: Error | null) => void
  ) => Promise<void>;
  setInitialTimeline: () => void;
}

export interface UseTimelineOptions {
  kind?: TimelineKind;
  onScrollbackError?: (retry: () => void) => void;
  optimisticRedactedIds?: ReadonlySet<string>;
  optimisticEditBodies?: ReadonlyMap<string, string>;
  isAtBottom?: () => boolean;
}

export function useTimeline(
  client: WizardClient,
  roomId: string,
  options: UseTimelineOptions = {}
): UseTimelineResult {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const baseKind = options.kind ?? MAIN_KIND;
  const myId = client.userId() ?? '';
  const [focus, setFocus] = useState<{ roomId: string; eventId: string } | null>(null);
  const focusEventId = focus?.roomId === roomId ? focus.eventId : null;
  const focusKind = useMemo<TimelineKind | null>(
    () => (focusEventId ? { type: 'event', eventId: focusEventId } : null),
    [focusEventId]
  );
  const kind = focusKind ?? baseKind;
  const focusRef = useRef(focusEventId);
  focusRef.current = focusEventId;

  const optimisticRedactedIds = options.optimisticRedactedIds ?? EMPTY_REDACTED;
  const optimisticEditBodies = options.optimisticEditBodies ?? EMPTY_EDITS;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const core = useCoreTimeline(client, roomId, kind);
  const { entries, timeline } = core;
  const events = useMemo(() => entries.filter(isEventEntry), [entries]);
  const decryptingIds = useDecryptingIds(events);
  const baseContext = useBuildContext(client, roomId);
  const buildContext = useMemo(
    () => ({ ...baseContext, decryptingIds }),
    [baseContext, decryptingIds]
  );
  const eventsLength = events.length;

  const [windowState, setWindowState] = useState<WindowState>({
    events: [],
    range: { start: 0, end: 0 },
    epoch: 0,
  });
  let currentWindow = windowState;
  if (windowState.events !== events) {
    currentWindow = adjustWindow(windowState, events, optionsRef.current.isAtBottom?.() ?? false);
    setWindowState(currentWindow);
  }
  const { range } = currentWindow;
  const windowRef = useRef(currentWindow);
  windowRef.current = currentWindow;

  const [ownAtStart, setOwnAtStart] = useState(false);
  const [isPaginating, setIsPaginating] = useState(false);
  const fetchingRef = useRef(false);
  const atStart = core.atStart || ownAtStart;
  const atStartRef = useRef(atStart);
  atStartRef.current = atStart;

  const [unread, setUnread] = useState<{ firstUnread: string | null; readUpTo: string | null }>({
    firstUnread: null,
    readUpTo: null,
  });
  const unreadLatchRef = useRef(false);
  const unreadOldestRef = useRef<string | null>(null);

  // Reset state on room change so old data is never visible.
  const kindKey = JSON.stringify(kind);
  const baseKindKey = JSON.stringify(baseKind);
  useEffect(() => {
    setOwnAtStart(false);
    setIsPaginating(false);
    fetchingRef.current = false;
  }, [roomId, kindKey]);
  useEffect(() => {
    setFocus((prev) => (prev?.roomId === roomId ? prev : null));
    unreadLatchRef.current = false;
    unreadOldestRef.current = null;
    setUnread({ firstUnread: null, readUpTo: null });
  }, [roomId, baseKindKey]);

  // Until the read marker turns up, look again whenever older messages were loaded
  if (!unreadLatchRef.current && events.length > 0 && unreadOldestRef.current !== events[0].id) {
    unreadOldestRef.current = events[0].id;
    const found = findUnread(entries, myId);
    if (found.readUpTo !== null || entries.some((e) => e.kind === 'readMarker')) {
      unreadLatchRef.current = true;
    }
    if (found.firstUnread !== unread.firstUnread || found.readUpTo !== unread.readUpTo) {
      setUnread(found);
    }
  }

  const clearUnreadDivider = useCallback(() => {
    unreadLatchRef.current = true;
    setUnread((prev) => (prev.firstUnread === null ? prev : { ...prev, firstUnread: null }));
  }, []);

  const prevItemsRef = useRef<TimelineItem[]>([]);
  const prevRoomRef = useRef(roomId);
  if (prevRoomRef.current !== roomId) {
    prevRoomRef.current = roomId;
    prevItemsRef.current = [];
  }
  const items = useMemo(() => {
    const start = Math.max(0, Math.min(range.start, eventsLength));
    const end = Math.max(start, Math.min(range.end, eventsLength));
    if (start >= end && eventsLength > 0) return prevItemsRef.current;
    const slice = events.slice(start, end);
    const prevEvent = start > 0 ? (events[start - 1] ?? null) : null;
    let built: TimelineItem[];
    try {
      built = buildItems(
        slice,
        buildContext,
        t,
        locale,
        optimisticRedactedIds,
        optimisticEditBodies,
        { prevEvent }
      );
    } catch (err) {
      console.error('[useTimeline] buildItems failed, keeping last render', err);
      return prevItemsRef.current;
    }
    const merged = mergePreservingIdentity(built, prevItemsRef.current);
    prevItemsRef.current = merged;
    return merged;
  }, [
    range.start,
    range.end,
    events,
    eventsLength,
    buildContext,
    t,
    locale,
    optimisticRedactedIds,
    optimisticEditBodies,
  ]);

  const setRange = useCallback((next: ItemRange) => {
    setWindowState((prev) => ({ ...prev, range: next }));
  }, []);

  const setInitialTimeline = useCallback(() => {
    if (focusRef.current) {
      setFocus(null);
      return;
    }
    setWindowState((prev) => ({
      ...prev,
      range: initialRange(prev.events.length),
      epoch: prev.epoch + 1,
    }));
  }, []);

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const paginateOnce = useCallback(async (): Promise<boolean> => {
    const tl = timelineRef.current;
    if (!tl) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reachedStart = await Promise.race([
        tl.paginateBack(PAGINATION_LIMIT),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Scrollback request timed out')),
            PAGINATION_TIMEOUT_MS
          );
        }),
      ]);
      if (reachedStart) setOwnAtStart(true);
      return reachedStart;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const handlePaginate = useCallback(
    async (backwards: boolean) => {
      if (!backwards) {
        // Only a timeline opened at an event has newer messages to load; at the newest one
        // it hands over to the live timeline again
        const tl = timelineRef.current;
        if (!focusRef.current || !tl || fetchingRef.current) return;
        fetchingRef.current = true;
        setIsPaginating(true);
        try {
          const atLive = await tl.paginateForward(PAGINATION_LIMIT);
          if (atLive) setFocus(null);
        } catch {
          const { onScrollbackError } = optionsRef.current;
          if (onScrollbackError) onScrollbackError(() => void handlePaginate(backwards));
        } finally {
          fetchingRef.current = false;
          setIsPaginating(false);
        }
        return;
      }
      if (fetchingRef.current || atStartRef.current || !timelineRef.current) return;
      fetchingRef.current = true;
      setIsPaginating(true);
      const forRoom = roomId;
      try {
        await paginateOnce();
      } catch {
        if (forRoom !== prevRoomRef.current) return;
        const { onScrollbackError } = optionsRef.current;
        if (onScrollbackError) onScrollbackError(() => void handlePaginate(backwards));
      } finally {
        fetchingRef.current = false;
        setIsPaginating(false);
      }
    },
    [roomId, paginateOnce]
  );

  const getEventAtIndex = useCallback((index: number) => windowRef.current.events[index], []);
  const getEventIndex = useCallback((eventId: string) => {
    const index = windowRef.current.events.findIndex((e) => entryEventId(e) === eventId);
    return index === -1 ? undefined : index;
  }, []);

  const pendingJumpRef = useRef<PendingJump | null>(null);

  const finishJump = useCallback((jump: PendingJump) => {
    if (pendingJumpRef.current !== jump) return false;
    pendingJumpRef.current = null;
    clearTimeout(jump.timer);
    return true;
  }, []);

  useEffect(() => {
    const jump = pendingJumpRef.current;
    if (!jump || jump.roomId !== roomId || focusEventId !== jump.eventId) return;
    const index = indexOfEventId(events, jump.eventId);
    if (index === -1) return;
    finishJump(jump);
    setWindowState((prev) =>
      prev.events === events
        ? {
            ...prev,
            range: {
              start: Math.max(index - PAGINATION_LIMIT, 0),
              end: Math.min(index + PAGINATION_LIMIT, events.length),
            },
          }
        : prev
    );
    jump.onLoad(index, jump.eventId);
  }, [events, roomId, focusEventId, finishJump]);

  useEffect(
    () => () => {
      const jump = pendingJumpRef.current;
      if (jump) finishJump(jump);
    },
    [roomId, finishJump]
  );

  const loadEventTimeline = useCallback(
    async (
      eventId: string,
      onLoad: (absIndex: number, eventId: string) => void,
      onError: (err: Error | null) => void
    ) => {
      const index = getEventIndex(eventId);
      if (index !== undefined) {
        onLoad(index, eventId);
        return;
      }
      const previous = pendingJumpRef.current;
      if (previous) finishJump(previous);
      try {
        await client.eventSource(roomId, eventId);
      } catch (err) {
        onError(err instanceof Error ? err : null);
        return;
      }
      if (roomId !== prevRoomRef.current) return;
      const jump: PendingJump = {
        roomId,
        eventId,
        onLoad,
        timer: setTimeout(() => {
          if (!finishJump(jump)) return;
          setFocus(null);
          onError(null);
        }, PAGINATION_TIMEOUT_MS),
      };
      pendingJumpRef.current = jump;
      setFocus({ roomId, eventId });
    },
    [client, roomId, getEventIndex, finishJump]
  );

  return {
    timeline,
    entries,
    items,
    events,
    buildContext,
    range,
    eventsLength,
    liveTimelineLinked: focusEventId === null,
    canPaginateBack: !atStart,
    rangeAtStart: range.start === 0,
    rangeAtEnd: range.end === eventsLength,
    isPaginating: isPaginating || core.loading,
    timelineResetEpoch: currentWindow.epoch,
    firstUnreadEventId: unread.firstUnread,
    readUpToEventId: unread.readUpTo,
    clearUnreadDivider,
    setRange,
    handlePaginate,
    getEventAtIndex,
    getEventIndex,
    loadEventTimeline,
    setInitialTimeline,
  };
}
