import { useSyncExternalStore } from 'react';
import { useAtomValue } from 'jotai';
import type { CallParticipant, CallSnapshot } from '@/call/media';
import { callSessionAtom } from '@/app/store/atoms/call';

const noopSubscribe = () => () => {};
const getNull = () => null;

export function useCallSnapshot(): CallSnapshot | null {
  const session = useAtomValue(callSessionAtom);
  return useSyncExternalStore(
    session ? session.subscribe : noopSubscribe,
    session ? session.getSnapshot : getNull
  );
}

export function shownParticipants(snapshot: CallSnapshot | null): CallParticipant[] {
  return snapshot?.participants.filter((p) => !p.stale) ?? [];
}

export interface CallLiveState {
  muted: boolean;
  videoMuted: boolean;
  screensharing: boolean;
  speaking: boolean;
}

export function liveStateByUser(snapshot: CallSnapshot): Map<string, CallLiveState> {
  const byUser = new Map<string, CallLiveState>();
  for (const p of snapshot.participants) {
    const prev = byUser.get(p.userId);
    byUser.set(p.userId, {
      muted: (prev?.muted ?? true) && p.audioMuted,
      videoMuted: (prev?.videoMuted ?? true) && !p.cameraShared,
      screensharing: (prev?.screensharing ?? false) || p.screenShared,
      speaking: (prev?.speaking ?? false) || p.speaking,
    });
  }
  return byUser;
}
