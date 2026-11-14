import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEY_YOUTUBE_CONSENT } from '@/const/storageKeys';

export const WATCH_TOPIC = 'org.wizardchat.watch';
export const QUEUE_LIMIT = 100;
export const HISTORY_LIMIT = 20;

export interface QueueItem {
  id: string;
  videoId: string;
  addedBy: string;
}

export interface WatchState {
  videoId: string;
  startedBy: string;
  playing: boolean;
  position: number;
  at: number;
  rate: number;
  version: number;
  by: string;
  waitingFor: string | null;
  addedBy: string;
  queue: QueueItem[];
  history: QueueItem[];
}

export type IncomingWatchState = Omit<WatchState, 'addedBy' | 'queue' | 'history'> &
  Partial<Pick<WatchState, 'addedBy' | 'queue' | 'history'>>;

export interface WatchClock {
  version: number;
  by: string;
}

export type WatchMessage =
  | { t: 'state'; state: IncomingWatchState; sentAt: number }
  | { t: 'stop'; sentAt: number; version: number; by: string }
  | { t: 'request' }
  | { t: 'viewer'; videoId: string | null }
  | { t: 'who' };

export type WatchPatch = Partial<Pick<WatchState, 'playing' | 'position' | 'rate' | 'waitingFor'>>;

export interface WatchActions {
  start: (videoIds: string[]) => void;
  update: (patch: WatchPatch) => void;
  stop: () => void;
  enqueue: (videoIds: string[]) => number;
  remove: (id: string) => void;
  reorder: (ids: string[]) => void;
  playNext: (id: string) => void;
  playNow: (item: QueueItem) => void;
  shuffle: () => void;
  clear: () => void;
  skip: () => void;
  advance: (fromVideoId: string) => boolean;
}

export const watchStateAtom = atom<WatchState | null>(null);
export const watchActionsAtom = atom<WatchActions | null>(null);
export const watchDialogOpenAtom = atom(false);
export const watchQueueOpenAtom = atom(false);

export const watchingVideoIdAtom = atom<string | null>(null);
export const watchViewersAtom = atom<string[]>([]);

export const youtubeConsentAtom = atomWithStorage(STORAGE_KEY_YOUTUBE_CONSENT, false);

export function youtubeWatchUrl(videoId: string, seconds = 0): string {
  const t = Math.floor(seconds);
  return `https://www.youtube.com/watch?v=${videoId}${t > 0 ? `&t=${t}s` : ''}`;
}

export function expectedPosition(state: WatchState, now = Date.now()): number {
  return state.playing ? state.position + ((now - state.at) / 1000) * state.rate : state.position;
}

export function isNewer(a: WatchClock, b: WatchClock | null): boolean {
  if (!b) return true;
  return a.version > b.version || (a.version === b.version && a.by > b.by);
}

export function sameClock(a: WatchClock, b: WatchClock | null): boolean {
  return !!b && a.version === b.version && a.by === b.by;
}

const ID_RE = /^[\w-]{11}$/;
const LIST_RE = /^[\w-]{10,64}$/;

export function newQueueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export interface YouTubeLink {
  videoId: string | null;
  listId: string | null;
}

export function parseYouTubeLink(input: string): YouTubeLink | null {
  const text = input.trim();
  if (ID_RE.test(text)) return { videoId: text, listId: null };
  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const youtube = ['youtu.be', 'youtube.com', 'youtube-nocookie.com'].includes(host);
  const list = youtube ? url.searchParams.get('list') : null;
  const listId = list && LIST_RE.test(list) ? list : null;
  const videoId = parseYouTubeId(text);
  return videoId || listId ? { videoId, listId } : null;
}

function parseQueue(value: unknown): QueueItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: QueueItem[] = [];
  for (const raw of value.slice(0, QUEUE_LIMIT)) {
    const item = raw as Record<string, unknown> | null;
    if (
      item &&
      typeof item.id === 'string' &&
      typeof item.videoId === 'string' &&
      ID_RE.test(item.videoId) &&
      typeof item.addedBy === 'string'
    ) {
      items.push({ id: item.id, videoId: item.videoId, addedBy: item.addedBy });
    }
  }
  return items;
}

export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id =
      url.searchParams.get('v') ??
      /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ??
      null;
  }
  return id && ID_RE.test(id) ? id : null;
}

export function parseWatchMessage(payload: unknown): WatchMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const msg = payload as Record<string, unknown>;
  if (msg.t === 'request') return { t: 'request' };
  if (msg.t === 'who') return { t: 'who' };
  if (msg.t === 'viewer') {
    return {
      t: 'viewer',
      videoId: typeof msg.videoId === 'string' && ID_RE.test(msg.videoId) ? msg.videoId : null,
    };
  }
  if (msg.t === 'stop' && typeof msg.sentAt === 'number') {
    return {
      t: 'stop',
      sentAt: msg.sentAt,
      version: typeof msg.version === 'number' ? msg.version : 0,
      by: typeof msg.by === 'string' ? msg.by : '',
    };
  }
  if (msg.t !== 'state' || typeof msg.sentAt !== 'number') return null;
  const s = msg.state as Record<string, unknown> | undefined;
  if (
    !s ||
    typeof s.videoId !== 'string' ||
    !ID_RE.test(s.videoId) ||
    typeof s.startedBy !== 'string' ||
    typeof s.playing !== 'boolean' ||
    typeof s.position !== 'number' ||
    !Number.isFinite(s.position) ||
    typeof s.at !== 'number'
  ) {
    return null;
  }
  return {
    t: 'state',
    sentAt: msg.sentAt,
    state: {
      videoId: s.videoId,
      startedBy: s.startedBy,
      playing: s.playing,
      position: Math.max(0, s.position),
      at: s.at,
      rate: typeof s.rate === 'number' && s.rate >= 0.25 && s.rate <= 2 ? s.rate : 1,
      version: typeof s.version === 'number' ? s.version : 0,
      by: typeof s.by === 'string' ? s.by : s.startedBy,
      waitingFor: typeof s.waitingFor === 'string' ? s.waitingFor : null,
      addedBy: typeof s.addedBy === 'string' ? s.addedBy : undefined,
      queue: parseQueue(s.queue),
      history: parseQueue(s.history)?.slice(0, HISTORY_LIMIT),
    },
  };
}
