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
  sameClock,
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
      stateRef.current = next;
      setState(next);
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
      const incoming = { ...msg.state, at: msg.state.at + clockOffset(from, msg.sentAt) };
      if (incoming.version === 0) {
        Object.assign(incoming, nextClock(), { by: incoming.by });
      } else if (!isNewer(incoming, clock) && !sameClock(incoming, clock)) {
        return;
      }
      clock = { version: incoming.version, by: incoming.by };
      apply(incoming);
    });

    setActions({
      start: (videoId) =>
        publish({
          videoId,
          startedBy: myId,
          playing: true,
          position: 0,
          at: Date.now(),
          rate: 1,
          waitingFor: null,
          ...nextClock(),
        }),
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
    if (
      state &&
      videoId !== lastVideoRef.current &&
      expectedPosition(state) < START_SOUND_WINDOW_S
    ) {
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
