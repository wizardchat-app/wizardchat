import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';

const SOUND_MAP = {
  mute: '/assets/sounds/mute.wav',
  unmute: '/assets/sounds/unmute.wav',
  deafen: '/assets/sounds/deafen.wav',
  undeafen: '/assets/sounds/undeafen.wav',
  'camera-on': '/assets/sounds/camera_on.wav',
  'camera-off': '/assets/sounds/camera_off.wav',
  alert: '/assets/sounds/alert.wav',
  'call-join': '/assets/sounds/call_join.wav',
  'call-leave': '/assets/sounds/call_leave.wav',
  'raise-hand': '/assets/sounds/raise_hand.wav',
  'screenshare-start': '/assets/sounds/screenshare_start.wav',
  'screenshare-stop': '/assets/sounds/screenshare_stop.wav',
  reaction: '/assets/sounds/reaction.wav',
  'call-declined': '/assets/sounds/call_declined.wav',
  'call-no-answer': '/assets/sounds/call_no_answer.wav',
  ringback: '/assets/sounds/ringback.wav',
  ringtone: '/assets/sounds/ringtone.wav',
  'watch-together-start': '/assets/sounds/watch_together_start.wav',
} as const;

export type VoiceSound = keyof typeof SOUND_MAP;

export const VOICE_SOUND_TOGGLES = {
  mute: ['mute', 'unmute'],
  deafen: ['deafen', 'undeafen'],
  camera: ['camera-on', 'camera-off'],
  screenshare: ['screenshare-start', 'screenshare-stop'],
  join: ['call-join'],
  leave: ['call-leave'],
  ringtone: ['ringtone'],
  ringback: ['ringback'],
  callEnded: ['call-declined', 'call-no-answer'],
  raiseHand: ['raise-hand'],
  reaction: ['reaction'],
  watchTogether: ['watch-together-start'],
} as const satisfies Record<string, readonly VoiceSound[]>;

export type VoiceSoundToggle = keyof typeof VOICE_SOUND_TOGGLES;

const TOGGLE_OF = new Map<VoiceSound, VoiceSoundToggle>(
  Object.entries(VOICE_SOUND_TOGGLES).flatMap(([toggle, sounds]) =>
    sounds.map((sound) => [sound, toggle as VoiceSoundToggle] as const)
  )
);

function isEnabled(type: VoiceSound): boolean {
  const toggle = TOGGLE_OF.get(type);
  if (!toggle) return true;
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}') as {
      voiceSounds?: Partial<Record<VoiceSoundToggle, boolean>>;
    };
    return prefs.voiceSounds?.[toggle] !== false;
  } catch {
    return true;
  }
}

const VOLUME = 0.5;

// If http(s) isnt available (the desktop apps own URL scheme), play through blob: URLs for WebKitGTK
const NEEDS_BLOB = !/^https?:$/.test(window.location.protocol);
const blobSources = new Map<VoiceSound, Promise<string>>();

function blobSource(type: VoiceSound): Promise<string> {
  let source = blobSources.get(type);
  if (!source) {
    source = fetch(SOUND_MAP[type])
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    source.catch(() => blobSources.delete(type));
    blobSources.set(type, source);
  }
  return source;
}

function startSound(type: VoiceSound, loop: boolean): HTMLAudioElement {
  const audio = new Audio();
  audio.loop = loop;
  audio.volume = VOLUME;
  const play = (src: string) => {
    audio.src = src;
    audio.play().catch(() => {});
  };
  if (NEEDS_BLOB) blobSource(type).then(play, () => {});
  else play(SOUND_MAP[type]);
  return audio;
}

export function playVoiceSound(type: VoiceSound): void {
  if (!isEnabled(type)) return;
  try {
    startSound(type, false);
  } catch {
    // ignore
  }
}

export function loopVoiceSound(type: VoiceSound): () => void {
  let audio: HTMLAudioElement | null = null;
  if (!isEnabled(type)) return () => {};
  try {
    audio = startSound(type, true);
  } catch {
    // ignore
  }
  return () => {
    if (!audio) return;
    audio.loop = false;
    audio.muted = true;
    audio.pause();
    audio = null;
  };
}
