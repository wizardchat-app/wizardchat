/**
 * Screen sharing on desktop with the app's own picker. The system webviews can't be told which
 * source `getDisplayMedia()` should use, so the desktop app captures the chosen screen or window
 * natively: JPEG frames are drawn onto a canvas that becomes the video track, and system audio
 * (48 kHz stereo float samples) plays through an audio worklet into the audio track.
 */
import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import i18n from '@/i18n';

interface NativeSource {
  id: string;
  name: string | null;
  thumbnail: string;
  appName: string | null;
}

type Choice = { id: string; name: string; audio: boolean } | null;

export const SHARE_PICKER_EVENT = 'share-picker-choice';

const pickerListeners = new Set<() => void>();
let pendingChoice: ((choice: Choice) => void) | null = null;

export async function getDesktopSources(options: {
  thumbnailSize?: { width: number; height: number };
}): Promise<DesktopSource[]> {
  const size = options.thumbnailSize ?? { width: 320, height: 180 };
  const sources = await invoke<NativeSource[]>('desktop_sources', size);
  let screen = 0;
  return sources.map((source) => ({
    id: source.id,
    name: source.name ?? i18n.t('desktopPicker.screenNumber', { number: String((screen += 1)) }),
    display_id: '',
    thumbnail: { dataUrl: source.thumbnail },
    appIcon: null,
  }));
}

export function onOpenDesktopPicker(listener: () => void): () => void {
  pickerListeners.add(listener);
  return () => pickerListeners.delete(listener);
}

export function selectDesktopSource(source: Record<string, unknown> | null) {
  const resolve = pendingChoice;
  pendingChoice = null;
  resolve?.(source ? (source as Choice) : null);
}

/**
 * Opens the picker, in the app or (when another app is in front, after the shortcut) in a small
 * window of its own; resolves with the chosen source, or null if cancelled
 */
function pickSource(): Promise<Choice> {
  selectDesktopSource(null);
  return new Promise((resolve) => {
    pendingChoice = resolve;
    if (document.hasFocus()) {
      pickerListeners.forEach((listener) => listener());
      return;
    }
    const listening = listen<Choice>(SHARE_PICKER_EVENT, ({ payload }) => {
      void listening.then((stop) => stop());
      if (pendingChoice === resolve) selectDesktopSource(payload);
    });
    invoke('open_share_picker', { title: i18n.t('desktopPicker.title') }).catch(() => {
      void listening.then((stop) => stop());
      pickerListeners.forEach((listener) => listener());
    });
  });
}

const AUDIO_WORKLET = `
class SharedAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.port.onmessage = (e) => {
      this.queue.push(e.data);
      // Keep at most ~0.5 s buffered so the shared audio doesn't drift behind the video
      while (this.queue.length > 50) this.queue.shift();
    };
  }
  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    for (let i = 0; i < left.length; i++) {
      const chunk = this.queue[0];
      if (!chunk) { left[i] = 0; right[i] = 0; continue; }
      left[i] = chunk[this.offset];
      right[i] = chunk[this.offset + 1];
      this.offset += 2;
      if (this.offset >= chunk.length) { this.queue.shift(); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor('shared-audio', SharedAudio);
`;

async function audioTrack(channel: Channel<ArrayBuffer>) {
  const context = new AudioContext({ sampleRate: 48000 });
  const url = URL.createObjectURL(new Blob([AUDIO_WORKLET], { type: 'text/javascript' }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(context, 'shared-audio', { outputChannelCount: [2] });
  const destination = context.createMediaStreamDestination();
  node.connect(destination);
  channel.onmessage = (buffer) => node.port.postMessage(new Float32Array(buffer));
  return { track: destination.stream.getAudioTracks()[0], close: () => void context.close() };
}

function videoTrack(channel: Channel<ArrayBuffer>) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  let decoding = false;
  channel.onmessage = (buffer) => {
    // Skip frames that arrive while the previous one is still decoding
    if (decoding || !context) return;
    decoding = true;
    void createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }))
      .then((bitmap) => {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch(() => {})
      .finally(() => {
        decoding = false;
      });
  };
  return canvas.captureStream(30).getVideoTracks()[0];
}

export interface NativeScreenShare {
  video: MediaStreamTrack;
  audio: MediaStreamTrack | null;
  stop(): void;
}

/**
 * Lets the user pick a screen or window and starts capturing it; null when cancelled, or when
 * this platform has no native capture (then the webview's own picker is used)
 */
const support = () => invoke<{ video: boolean; audio: boolean }>('screen_capture_supported');

/** Whether the picker should offer sharing system audio */
export async function screenShareAudioSupported(): Promise<boolean> {
  return (await support()).audio;
}

export async function startScreenShare(): Promise<NativeScreenShare | null | undefined> {
  const supported = await support();
  if (!supported.video) return undefined;
  const choice = await pickSource();
  if (!choice) return null;
  const frames = new Channel<ArrayBuffer>();
  const audioChunks = new Channel<ArrayBuffer>();
  const video = videoTrack(frames);
  const withAudio = choice.audio && supported.audio;
  const audio = withAudio ? await audioTrack(audioChunks) : null;
  await invoke('start_screen_capture', {
    id: choice.id,
    audio: withAudio,
    frames,
    audioOut: audioChunks,
  });
  let stopped = false;
  return {
    video,
    audio: audio?.track ?? null,
    stop() {
      if (stopped) return;
      stopped = true;
      void invoke('stop_screen_capture');
      video.stop();
      audio?.track.stop();
      audio?.close();
    },
  };
}
