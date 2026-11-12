export const SOUNDBOARD_TOPIC = 'moe.crafty.soundboard';
export const SOUNDBOARD_COOLDOWN_MS = 1500;

const SOUNDBOARD_EMOJI: Record<string, string> = {
  applause: '👏',
  laugh: '😂',
  rimshot: '🥁',
  drumroll: '🪘',
  tada: '🎉',
  airhorn: '📯',
  crickets: '🦗',
  sad_trombone: '🎺',
};

export const SOUNDBOARD_EMOJI_KEY = 'org.wizardchat.emoji';
const MAX_EMOJI_BYTES = 32;

export function soundboardEmoji(shortcode: string | undefined, emoji?: string | null): string {
  return emoji || (shortcode && SOUNDBOARD_EMOJI[shortcode]) || '🔊';
}

const MAX_MESSAGE_BYTES = 1024;
const MAX_SHORTCODE_BYTES = 100;
const MAX_DURATION_S = 15;
const MIN_INTERVAL_MS = 400;
const MAX_PLAYING = 3;

export interface SoundboardPlay {
  url: string;
  shortcode?: string;
  emoji?: string;
}

export function parseSoundboardPlay(data: Uint8Array): SoundboardPlay | null {
  if (data.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown> | null;
    const url = value?.url;
    if (typeof url !== 'string' || !url.startsWith('mxc://')) return null;
    const shortcode = value?.shortcode;
    const emoji = value?.[SOUNDBOARD_EMOJI_KEY];
    return {
      emoji:
        typeof emoji === 'string' && new TextEncoder().encode(emoji).byteLength <= MAX_EMOJI_BYTES
          ? emoji
          : undefined,
      url,
      shortcode:
        typeof shortcode === 'string' &&
        new TextEncoder().encode(shortcode).byteLength <= MAX_SHORTCODE_BYTES
          ? shortcode
          : undefined,
    };
  } catch {
    return null;
  }
}

type AudioWithSink = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

export class SoundboardPlayer {
  private sources = new Map<string, Promise<string>>();
  private lastPlayed = new Map<string, number>();
  private playing = new Map<string, Set<HTMLAudioElement>>();
  private disposed = false;

  constructor(private readonly fetchSound: (url: string) => Promise<Uint8Array>) {}

  private source(url: string): Promise<string> {
    let source = this.sources.get(url);
    if (!source) {
      source = this.fetchSound(url).then((data) =>
        URL.createObjectURL(new Blob([data as BlobPart]))
      );
      source.catch(() => this.sources.delete(url));
      this.sources.set(url, source);
    }
    return source;
  }

  prefetch(url: string) {
    void this.source(url).catch(() => {});
  }

  async play(
    url: string,
    sender: string,
    volume: number,
    sinkId: string | undefined,
    events: { onStart: () => void; onEnd: () => void }
  ) {
    const now = Date.now();
    if (now - (this.lastPlayed.get(sender) ?? 0) < MIN_INTERVAL_MS) return;
    const playing = this.playing.get(sender) ?? new Set<HTMLAudioElement>();
    if (playing.size >= MAX_PLAYING) return;
    this.lastPlayed.set(sender, now);
    let audio: AudioWithSink;
    try {
      audio = new Audio(await this.source(url));
    } catch {
      return;
    }
    if (this.disposed) return;
    audio.volume = Math.min(Math.max(volume, 0), 1);
    let ended = false;
    const done = () => {
      audio.pause();
      playing.delete(audio);
      if (!playing.size) this.playing.delete(sender);
      if (ended) return;
      ended = true;
      events.onEnd();
    };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration > MAX_DURATION_S) done();
    });
    playing.add(audio);
    this.playing.set(sender, playing);
    if (sinkId && audio.setSinkId) await audio.setSinkId(sinkId).catch(() => {});
    await audio.play().then(events.onStart, done);
  }

  dispose() {
    this.disposed = true;
    for (const audios of this.playing.values()) for (const audio of audios) audio.pause();
    this.playing.clear();
    for (const source of this.sources.values()) void source.then(URL.revokeObjectURL, () => {});
    this.sources.clear();
  }
}
