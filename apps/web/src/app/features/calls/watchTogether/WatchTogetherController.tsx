import { useEffect, useReducer, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { callSessionAtom } from '@/app/store/atoms/call';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import {
  WATCH_TOPIC,
  expectedPosition,
  parseWatchMessage,
  watchActionsAtom,
  watchStateAtom,
  watchViewersAtom,
  watchingVideoIdAtom,
  isNewer,
  newQueueId,
  sameClock,
  HISTORY_LIMIT,
  QUEUE_LIMIT,
  type QueueItem,
  type WatchClock,
  type WatchMessage,
  type WatchState,
} from './watchTogether';
import { WatchTogetherDialog } from './WatchTogetherDialog';
import { playVoiceSound } from '@/app/features/voice/voiceSounds';

const LATE_JOIN_REQUEST_DELAY_MS = 1500;
const HEARTBEAT_MS = 10_000;
const OFFSET_SAMPLES = 10;
const START_SOUND_WINDOW_S = 5;
const ADVANCE_GUARD_MS = 5000;

export function WatchTogetherController() {
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const phase = snapshot?.phase;
  const participantsRef = useRef(snapshot?.participants ?? []);
  participantsRef.current = snapshot?.participants ?? [];
  const [state, setState] = useAtom(watchStateAtom);
  const setActions = useSetAtom(watchActionsAtom);
  const [watchingVideoId, setWatching] = useAtom(watchingVideoIdAtom);
  const watchingRef = useRef(watchingVideoId);
  watchingRef.current = watchingVideoId;
  const setViewers = useSetAtom(watchViewersAtom);
  const viewerVideosRef = useRef(new Map<string, string>());
  const [viewerTick, bumpViewers] = useReducer((n: number) => n + 1, 0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(null);
    setWatching(null);
    viewerVideosRef.current.clear();
    bumpViewers();
    if (!session) {
      setActions(null);
      return;
    }
    const myId = getMatrixClientOrNull()?.userId() ?? '';
    let clock: WatchClock | null = null;
    const send = (msg: WatchMessage) => {
      void session.sendData(WATCH_TOPIC, msg).catch(() => {});
    };
    const broadcast = (state: WatchState) => send({ t: 'state', state, sentAt: Date.now() });
    const apply = (next: WatchState | null) => {
      const previous = stateRef.current;
      stateRef.current = next;
      setState(next);
      if (next && previous && next.videoId !== previous.videoId) {
        if (watchingRef.current === previous.videoId) setWatching(next.videoId);
      }
    };
    const nextClock = (): WatchClock => ({ version: (clock?.version ?? 0) + 1, by: myId });
    const publish = (next: WatchState) => {
      clock = { version: next.version, by: next.by };
      apply(next);
      broadcast(next);
    };

    const offsets = new Map<string, number[]>();
    const clockOffset = (from: string, sentAt: number) => {
      const samples = [...(offsets.get(from) ?? []), Date.now() - sentAt].slice(-OFFSET_SAMPLES);
      offsets.set(from, samples);
      return Math.min(...samples);
    };

    const off = session.onData((topic, payload, from) => {
      if (topic !== WATCH_TOPIC) return;
      const msg = parseWatchMessage(payload);
      if (!msg) return;
      if (msg.t === 'viewer') {
        if (msg.videoId) viewerVideosRef.current.set(from, msg.videoId);
        else viewerVideosRef.current.delete(from);
        bumpViewers();
        return;
      }
      if (msg.t === 'who') {
        const videoId = watchingRef.current;
        if (videoId) send({ t: 'viewer', videoId });
        return;
      }
      if (msg.t === 'request') {
        const current = stateRef.current;
        if (current) broadcast({ ...current, position: expectedPosition(current), at: Date.now() });
        return;
      }
      if (msg.t === 'stop') {
        if (msg.version > 0 && !isNewer(msg, clock)) return;
        clock = msg.version > 0 ? { version: msg.version, by: msg.by } : nextClock();
        apply(null);
        return;
      }
      const current = stateRef.current;
      const sameVideo = current?.videoId === msg.state.videoId;
      const incoming: WatchState = {
        ...msg.state,
        at: msg.state.at + clockOffset(from, msg.sentAt),
        addedBy:
          msg.state.addedBy ?? (sameVideo ? current.addedBy : undefined) ?? msg.state.startedBy,
        queue: msg.state.queue ?? current?.queue ?? [],
        history: msg.state.history ?? current?.history ?? [],
      };
      if (incoming.version === 0) {
        Object.assign(incoming, nextClock(), { by: incoming.by });
      } else if (!isNewer(incoming, clock) && !sameClock(incoming, clock)) {
        return;
      }
      clock = { version: incoming.version, by: incoming.by };
      apply(incoming);
    });

    const change = (patch: Partial<WatchState>) => {
      const current = stateRef.current;
      if (!current) return;
      publish({
        ...current,
        position: expectedPosition(current),
        at: Date.now(),
        ...patch,
        ...nextClock(),
      });
    };
    const item = (videoId: string): QueueItem => ({ id: newQueueId(), videoId, addedBy: myId });
    const played = (current: WatchState): QueueItem[] =>
      [
        { id: newQueueId(), videoId: current.videoId, addedBy: current.addedBy },
        ...current.history,
      ].slice(0, HISTORY_LIMIT);
    const playItem = (next: QueueItem, queue: QueueItem[]) => {
      const current = stateRef.current;
      if (!current) return;
      publish({
        ...current,
        videoId: next.videoId,
        addedBy: next.addedBy,
        playing: true,
        position: 0,
        at: Date.now(),
        waitingFor: null,
        queue,
        history: played(current).filter((entry) => entry.id !== next.id),
        ...nextClock(),
      });
    };

    setActions({
      start: (videoIds) => {
        const [first, ...rest] = videoIds;
        if (!first) return;
        publish({
          videoId: first,
          startedBy: myId,
          addedBy: myId,
          playing: true,
          position: 0,
          at: Date.now(),
          rate: 1,
          waitingFor: null,
          queue: rest.slice(0, QUEUE_LIMIT).map(item),
          history: [],
          ...nextClock(),
        });
      },
      update: (patch) => {
        const current = stateRef.current;
        if (!current) return;
        const position = patch.position ?? expectedPosition(current);
        publish({
          ...current,
          ...patch,
          position,
          waitingFor:
            patch.waitingFor !== undefined
              ? patch.waitingFor
              : patch.playing !== undefined
                ? null
                : current.waitingFor,
          at: Date.now(),
          ...nextClock(),
        });
      },
      stop: () => {
        const next = nextClock();
        clock = next;
        apply(null);
        send({ t: 'stop', sentAt: Date.now(), ...next });
      },
      enqueue: (videoIds) => {
        const current = stateRef.current;
        if (!current) return videoIds.length;
        const room = Math.max(0, QUEUE_LIMIT - current.queue.length);
        if (room > 0) change({ queue: [...current.queue, ...videoIds.slice(0, room).map(item)] });
        return Math.max(0, videoIds.length - room);
      },
      remove: (id) => {
        const current = stateRef.current;
        if (current) change({ queue: current.queue.filter((entry) => entry.id !== id) });
      },
      reorder: (ids) => {
        const current = stateRef.current;
        if (!current) return;
        const byId = new Map(current.queue.map((entry) => [entry.id, entry]));
        const ordered = ids.flatMap((id) => byId.get(id) ?? []);
        const rest = current.queue.filter((entry) => !ids.includes(entry.id));
        change({ queue: [...ordered, ...rest] });
      },
      playNext: (id) => {
        const current = stateRef.current;
        const entry = current?.queue.find((e) => e.id === id);
        if (!current || !entry) return;
        change({ queue: [entry, ...current.queue.filter((e) => e.id !== id)] });
      },
      playNow: (next) => {
        const current = stateRef.current;
        if (!current) return;
        playItem(
          next,
          current.queue.filter((entry) => entry.id !== next.id)
        );
      },
      shuffle: () => {
        const current = stateRef.current;
        if (!current) return;
        const queue = [...current.queue];
        for (let i = queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [queue[i], queue[j]] = [queue[j], queue[i]];
        }
        change({ queue });
      },
      clear: () => change({ queue: [] }),
      skip: () => {
        const current = stateRef.current;
        if (!current) return;
        const [next, ...queue] = current.queue;
        if (next) playItem(next, queue);
        else change({ playing: false });
      },
      advance: (fromVideoId) => {
        const current = stateRef.current;
        if (!current || current.videoId !== fromVideoId) return false;
        const [next, ...queue] = current.queue;
        if (!next) return false;
        const justStarted =
          current.playing && current.position < 1 && Date.now() - current.at < ADVANCE_GUARD_MS;
        if (justStarted) return true;
        playItem(next, queue);
        return true;
      },
    });

    const heartbeat = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const present = participantsRef.current
        .filter((p) => p.connected)
        .sort((a, b) => (a.identity < b.identity ? -1 : 1));
      const leader = present.find((p) => p.userId === current.startedBy) ?? present[0];
      if (!leader?.isLocal) return;
      if (current.waitingFor && !present.some((p) => p.userId === current.waitingFor)) {
        publish({ ...current, playing: true, waitingFor: null, at: Date.now(), ...nextClock() });
        return;
      }
      broadcast({ ...current, position: expectedPosition(current), at: Date.now() });
    }, HEARTBEAT_MS);

    return () => {
      off();
      clearInterval(heartbeat);
      setActions(null);
    };
  }, [session, setState, setActions, setWatching]);

  useEffect(() => {
    if (!session) return;
    void session.sendData(WATCH_TOPIC, { t: 'viewer', videoId: watchingVideoId }).catch(() => {});
  }, [session, watchingVideoId]);

  const participants = snapshot?.participants;
  const videoId = state?.videoId ?? null;
  useEffect(() => {
    const ids: string[] = [];
    if (videoId) {
      for (const p of participants ?? []) {
        if (!p.connected || ids.includes(p.userId)) continue;
        const watched = p.isLocal ? watchingVideoId : viewerVideosRef.current.get(p.identity);
        if (watched === videoId) ids.push(p.userId);
      }
    }
    setViewers((prev) => (prev.join('\n') === ids.join('\n') ? prev : ids));
  }, [participants, videoId, watchingVideoId, viewerTick, setViewers]);

  const lastVideoRef = useRef<string | null>(null);
  useEffect(() => {
    const videoId = state?.videoId ?? null;
    if (state && lastVideoRef.current === null && expectedPosition(state) < START_SOUND_WINDOW_S) {
      playVoiceSound('watch-together-start');
    }
    lastVideoRef.current = videoId;
  }, [state]);

  useEffect(() => {
    if (!session || phase !== 'joined') return;
    const timer = setTimeout(() => {
      if (!stateRef.current) void session.sendData(WATCH_TOPIC, { t: 'request' }).catch(() => {});
      void session.sendData(WATCH_TOPIC, { t: 'who' }).catch(() => {});
    }, LATE_JOIN_REQUEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, phase]);

  return <WatchTogetherDialog />;
}
