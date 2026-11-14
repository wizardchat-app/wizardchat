export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { video_id?: string; title?: string };
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getLoadedFraction(): number | null;
  supportsRate(): boolean;
  destroy(): void;
}

const SOURCE = 'wizardchat-youtube';
const BRIDGE_TIMEOUT_MS = 10_000;

function bridgeUrl(): URL {
  if (!window.desktopAPI) return new URL('/youtube-player.html', window.location.origin);
  const host = import.meta.env.APP_VERSION?.includes('-next') ? 'next' : 'app';
  return new URL(`https://${host}.wizardchat.org/youtube-player.html`);
}

interface PlayerOptions {
  videoId: string;
  autoplay: boolean;
  start: number;
  onReady: () => void;
  onStateChange: (state: number, videoId?: string) => void;
  onRateChange?: (rate: number) => void;
  onError: (kind: 'video' | 'bridge') => void;
}

export function createYouTubePlayer(host: HTMLElement, options: PlayerOptions): YTPlayer {
  const url = bridgeUrl();
  const iframe = document.createElement('iframe');
  iframe.src = url.href;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.style.visibility = 'hidden';
  host.appendChild(iframe);

  const status = {
    time: options.start,
    state: YT_STATE.UNSTARTED as number,
    duration: 0,
    videoId: options.videoId,
    rate: 1,
    loaded: null as number | null,
    reportsRate: false,
  };
  const send = (command: Record<string, unknown>) =>
    iframe.contentWindow?.postMessage({ ...command, target: SOURCE }, url.origin);

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== SOURCE) return;
    if (data.type === 'loaded') {
      clearTimeout(bridgeTimeout);
      iframe.style.visibility = '';
      send({
        type: 'init',
        videoId: options.videoId,
        autoplay: options.autoplay,
        start: options.start,
      });
    } else if (data.type === 'ready') {
      options.onReady();
    } else if (data.type === 'status') {
      if (typeof data.time === 'number') status.time = data.time;
      if (typeof data.state === 'number') status.state = data.state;
      if (typeof data.duration === 'number') status.duration = data.duration;
      if (typeof data.videoId === 'string') status.videoId = data.videoId;
      if (typeof data.rate === 'number') {
        status.rate = data.rate;
        status.reportsRate = true;
      }
      if (typeof data.loaded === 'number') status.loaded = data.loaded;
    } else if (data.type === 'rate' && typeof data.rate === 'number') {
      status.rate = data.rate;
      options.onRateChange?.(data.rate);
    } else if (data.type === 'state' && typeof data.state === 'number') {
      status.state = data.state;
      options.onStateChange(
        data.state,
        typeof data.videoId === 'string' ? data.videoId : undefined
      );
    } else if (data.type === 'error') {
      options.onError('video');
    }
  };
  window.addEventListener('message', onMessage);
  const bridgeTimeout = setTimeout(() => options.onError('bridge'), BRIDGE_TIMEOUT_MS);

  return {
    playVideo: () => send({ type: 'play' }),
    pauseVideo: () => send({ type: 'pause' }),
    seekTo: (seconds) => {
      status.time = seconds;
      send({ type: 'seek', seconds });
    },
    loadVideoById: ({ videoId, startSeconds = 0 }) => {
      status.videoId = videoId;
      status.time = startSeconds;
      send({ type: 'load', videoId, seconds: startSeconds });
    },
    cueVideoById: ({ videoId, startSeconds = 0 }) => {
      status.videoId = videoId;
      status.time = startSeconds;
      send({ type: 'cue', videoId, seconds: startSeconds });
    },
    getCurrentTime: () => status.time,
    getDuration: () => status.duration,
    getPlayerState: () => status.state,
    getVideoData: () => ({ video_id: status.videoId }),
    setPlaybackRate: (rate) => send({ type: 'rate', rate }),
    getPlaybackRate: () => status.rate,
    getLoadedFraction: () => status.loaded,
    supportsRate: () => status.reportsRate,
    destroy: () => {
      clearTimeout(bridgeTimeout);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };
}

const PLAYLIST_TIMEOUT_MS = 20_000;

export function fetchPlaylistIds(listId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = bridgeUrl();
    const iframe = document.createElement('iframe');
    iframe.src = url.href;
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed',
      width: '320px',
      height: '180px',
      left: '-10000px',
      top: '0',
      visibility: 'hidden',
    });
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timeout'));
    }, PLAYLIST_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== SOURCE) return;
      if (data.type === 'loaded') {
        iframe.contentWindow?.postMessage(
          { type: 'init', playlist: listId, target: SOURCE },
          url.origin
        );
      } else if (data.type === 'playlist') {
        done();
        const ids = Array.isArray(data.ids)
          ? data.ids.filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id))
          : [];
        if (ids.length > 0) resolve(ids);
        else reject(new Error('empty'));
      } else if (data.type === 'error') {
        done();
        reject(new Error('error'));
      }
    };
    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
  });
}

export interface VideoInfo {
  title: string;
  author: string;
}

export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  const response = await fetch(`https://www.youtube.com/oembed?url=${watch}&format=json`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error(String(response.status));
  const data = (await response.json()) as { title?: unknown; author_name?: unknown };
  return {
    title: typeof data.title === 'string' ? data.title : videoId,
    author: typeof data.author_name === 'string' ? data.author_name : '',
  };
}
