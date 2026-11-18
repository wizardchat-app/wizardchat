import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { CallMedia, NoiseFilter, PreferredDevices } from '@/call/media';
import { roomsByIdAtom } from '@/app/data/atoms';
import {
  STORAGE_KEY_CALL_DEVICES,
  STORAGE_KEY_CALL_VOLUMES,
  STORAGE_KEY_NOISE_FILTER,
  STORAGE_KEY_SHARE_SCREEN_AUDIO,
  STORAGE_KEY_CALL_SERVER,
  STORAGE_KEY_CALL_USER_AUDIO,
} from '@/const/storageKeys';
import { atomWithAccountStorage } from './accountStorage';
import { currentRoomIdAtom } from './rooms';
import { keybindsAtom, pushToTalkEnabledAtom } from './settings';

export type CallPhase = 'idle' | 'joining' | 'joined';

export type CallPresentation = 'hidden' | 'tile' | 'room' | 'fullscreen';

export type CallView = 'hidden' | 'docked' | 'tile' | 'fullscreen';

export interface IncomingCall {
  roomId: string;
  /** The ring event, to decline */
  eventId: string;
  callerId: string;
  callerName: string;
  voiceOnly: boolean;
  /** Ring audibly (DMs and small rooms); otherwise it's a quiet "call started" notice */
  ring: boolean;
  /** Set for group rooms, which name the room too */
  roomName: string | null;
}

export interface CallUiState {
  roomId: string | null;
  phase: CallPhase;
  voiceOnly: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isSpotlight: boolean;
  hideMembers: boolean;
  presentation: CallPresentation;
  incoming: IncomingCall | null;
}

export const CALL_INITIAL_STATE: CallUiState = {
  roomId: null,
  phase: 'idle',
  voiceOnly: false,
  isMuted: false,
  isDeafened: false,
  isVideoMuted: false,
  isScreenSharing: false,
  isSpotlight: true,
  hideMembers: false,
  presentation: 'hidden',
  incoming: null,
};

export const callUiAtom = atom<CallUiState>(CALL_INITIAL_STATE);

export const pendingCallRoomIdAtom = atom<string | null>(null);

export const leavingCallRoomIdAtom = atom<string | null>(null);

// The running call (LiveKit media plus the core's MatrixRTC session)
export const callSessionAtom = atom<CallMedia | null>(null);

export const callPanelAtom = atom<'reactions' | 'soundboard' | null>(null);

export const showNonVideoParticipantsAtom = atom(true);

export const showOwnScreenShareAtom = atom(false);

export interface CallUserAudio {
  volume: number;
  muted: boolean;
  streamVolume?: number;
}
export const callUserAudioAtom = atomWithAccountStorage<Record<string, CallUserAudio>>(
  STORAGE_KEY_CALL_USER_AUDIO,
  {}
);

export const callDevicesAtom = atomWithStorage<PreferredDevices>(STORAGE_KEY_CALL_DEVICES, {});

export interface CallVolumes {
  input: number;
  output: number;
}
export const callVolumesAtom = atomWithStorage<CallVolumes>(STORAGE_KEY_CALL_VOLUMES, {
  input: 1,
  output: 1,
});

export const noiseFilterAtom = atomWithStorage<NoiseFilter>(STORAGE_KEY_NOISE_FILTER, 'standard');

export const shareScreenAudioAtom = atomWithStorage<boolean>(STORAGE_KEY_SHARE_SCREEN_AUDIO, true);

export const isInCallAtom = atom((get) => get(callUiAtom).roomId !== null);

export const callRoomIdAtom = atom((get) => get(callUiAtom).roomId);

export const callIsVoiceRoomAtom = atom((get) => {
  const roomId = get(callUiAtom).roomId;
  return !!roomId && !!get(roomsByIdAtom).get(roomId)?.isVoice;
});

export const callEffectiveViewAtom = atom<CallView>((get) => {
  const { roomId, presentation } = get(callUiAtom);
  if (roomId === null) return 'hidden';
  if (presentation === 'hidden') return 'hidden';
  if (presentation === 'tile') return 'tile';
  if (get(currentRoomIdAtom) !== roomId) return 'hidden';
  if (presentation === 'fullscreen') return 'fullscreen';
  return get(callIsVoiceRoomAtom) ? 'fullscreen' : 'docked';
});

export interface CallActions {
  start: (
    roomId: string,
    opts?: {
      voiceOnly?: boolean;
      presentation?: CallPresentation;
      /** Starting a call, not joining or answering one; the core skips it for running calls */
      ring?: boolean;
    }
  ) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  setMicrophone: (enabled: boolean) => void;
  toggleDeafen: () => void;
  toggleVideo: () => void;
  toggleScreenshare: () => void;
  setSpotlight: (spotlight: boolean) => void;
  openReactions: () => void;
  openSoundboard: () => void;
  setPresentation: (presentation: CallPresentation) => void;
  copyCallLog: () => void;
}

export const callActionsAtom = atom<CallActions | null>(null);

export const MATRIX_ORG_CALL_SERVER = 'https://livekit-jwt.call.matrix.org';

// A LiveKit service the user picked, used instead of the homeserver's
export const callServerOverrideAtom = atomWithAccountStorage<string | null>(
  STORAGE_KEY_CALL_SERVER,
  null
);

export interface CommandActions {
  placeCall?: (roomId: string) => Promise<void> | void;
  joinVoice?: (roomId: string) => Promise<void> | void;
  hangup?: () => void;
}

export const commandActionsAtom = atom<CommandActions | null>(null);

export const pushToTalkModeAtom = atom(
  (get) => get(pushToTalkEnabledAtom) && !!get(keybindsAtom).pushToTalk
);
export const pushToTalkHeldAtom = atom(false);

export type GlobalKeyStatus = 'active' | 'taken' | 'no-permission' | 'unsupported';
export const globalKeyStatusAtom = atom<Partial<Record<string, GlobalKeyStatus>>>({});
