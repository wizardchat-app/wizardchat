import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaInfo, MediaSource, WizardClient } from '@wizardchat/core';
import { useSyncState } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { getSafeMimeType } from '@/util/safeMimeType';
import { sniffMimeType } from '@/util/sniffMimeType';
import { mediaBlobCacheKey } from '@/app/components/Avatar/fetchMediaBlobUrl';
import {
  getMediaCacheKey,
  getCachedMedia,
  setCachedMedia,
  getCachedBlobUrl,
  retainBlobUrl,
} from './mediaCache';
import { isAbortError, loadMediaUrl } from './mediaQueue';
import { isInViewport, useNearViewport } from './nearViewport';
import { plainMediaUrl } from './media';
import { entryMedia, type EventEntry } from './entry';

const DOWNLOAD_TIMEOUT_MS = 30000;
const THUMBNAIL_SIZE = 800;
// matrix-sdk's default MediaRetentionPolicy keeps files up to this size in its own media store;
// only bigger ones are worth a second copy in ours
const SDK_CACHED_MAX_BYTES = 20 * 1024 * 1024;
const LOCAL_MXC_PREFIX = 'mxc://send-queue.localhost/';

interface MediaLoad {
  key: string;
  encrypted: boolean;
  fetchBlob: () => Promise<Blob>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Media download timed out')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function toBlob(bytes: Uint8Array, mimeType: string | null | undefined): Blob {
  const type = getSafeMimeType(sniffMimeType(bytes) ?? mimeType ?? '');
  return new Blob([bytes as BlobPart], { type });
}

function encryptedLoad(
  client: WizardClient,
  source: MediaSource,
  mimeType: string | null | undefined,
  size: number | null | undefined
): MediaLoad | null {
  if (!('file' in source)) return null;
  const file = source.file as { url?: unknown; iv?: unknown } | null;
  if (!file || typeof file.url !== 'string') return null;
  const key = getMediaCacheKey({ url: file.url, iv: typeof file.iv === 'string' ? file.iv : '' });
  const persist =
    typeof size === 'number' &&
    size > SDK_CACHED_MAX_BYTES &&
    !file.url.startsWith(LOCAL_MXC_PREFIX);
  return {
    key,
    encrypted: true,
    fetchBlob: async () => {
      if (persist) {
        const cached = await getCachedMedia(key);
        if (cached) return new Blob([cached.data], { type: cached.mimeType });
      }
      const bytes = await withTimeout(client.media(source), DOWNLOAD_TIMEOUT_MS);
      const blob = toBlob(bytes, mimeType);
      if (persist) void setCachedMedia(key, bytes.slice().buffer as ArrayBuffer, blob.type);
      return blob;
    },
  };
}

async function fetchPlain(
  client: WizardClient,
  url: string,
  mimeType: string | null | undefined,
  size?: number
): Promise<Blob> {
  const fetchOnce = () => (size ? client.media({ url }, size, size) : client.media({ url }));
  let bytes: Uint8Array;
  try {
    bytes = await fetchOnce();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    bytes = await fetchOnce();
  }
  return toBlob(bytes, mimeType);
}

function plainLoad(
  client: WizardClient,
  url: string,
  mimeType: string | null | undefined,
  thumbnail = false
): MediaLoad {
  if (!thumbnail || url.startsWith(LOCAL_MXC_PREFIX)) {
    return {
      key: mediaBlobCacheKey(url),
      encrypted: false,
      fetchBlob: () => fetchPlain(client, url, mimeType),
    };
  }
  return {
    key: mediaBlobCacheKey(url, THUMBNAIL_SIZE, THUMBNAIL_SIZE, 'scale'),
    encrypted: false,
    fetchBlob: () =>
      fetchPlain(client, url, mimeType, THUMBNAIL_SIZE).catch(() =>
        fetchPlain(client, url, mimeType)
      ),
  };
}

function sourceLoad(
  client: WizardClient,
  source: unknown,
  mimeType: string | null | undefined,
  size?: number | null,
  thumbnail = false
): MediaLoad | null {
  if (!source || typeof source !== 'object') return null;
  const url = plainMediaUrl(source as MediaInfo['source']);
  if (url) return url.startsWith('mxc://') ? plainLoad(client, url, mimeType, thumbnail) : null;
  return encryptedLoad(client, source as MediaSource, mimeType, size);
}

interface MediaLoads {
  full: MediaLoad | null;
  primary: MediaLoad | null;
  poster: MediaLoad | null;
}

function mediaLoads(
  client: WizardClient,
  type: EventEntry['content']['type'],
  media: MediaInfo | null,
  previewOnly: boolean
): MediaLoads {
  if (!media) return { full: null, primary: null, poster: null };
  const full = sourceLoad(client, media.source, media.mimetype, media.size);
  const thumb = sourceLoad(client, media.thumbnailSource, null);
  switch (type) {
    case 'image': {
      if (media.mimetype === 'image/svg+xml') return { full, primary: null, poster: null };
      if (media.isAnimated || (full && getCachedBlobUrl(full.key))) {
        return { full, primary: full, poster: null };
      }
      const primary =
        thumb ?? sourceLoad(client, media.source, media.mimetype, media.size, true) ?? full;
      return { full, primary, poster: null };
    }
    case 'sticker':
      return { full, primary: full, poster: null };
    case 'video':
      return { full, primary: previewOnly ? null : full, poster: thumb };
    case 'audio': {
      const needsWaveform = media.voice && !(media.waveform && media.waveform.length > 0);
      return { full, primary: needsWaveform && !previewOnly ? full : null, poster: null };
    }
    default:
      return { full, primary: null, poster: null };
  }
}

function useMediaSlot(
  load: MediaLoad | null,
  active: boolean,
  targetRef: RefObject<Element | null> | undefined,
  retryTick: number,
  onError: (err: unknown) => void
): { src: string | null; loading: boolean; failed: boolean } {
  const [loaded, setLoaded] = useState<{ key: string; src: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const key = load?.key ?? null;
  // Once something is shown it stays: the sender's local echo keeps its local copy when the
  // remote echo swaps the source
  const cached = !loaded && active && key ? getCachedBlobUrl(key) : null;
  const shown = loaded ?? (cached && key ? { key, src: cached } : null);
  const shownKey = shown?.key ?? null;

  useEffect(() => (shownKey ? retainBlobUrl(shownKey) : undefined), [shownKey]);

  useEffect(() => setFailedKey(null), [retryTick]);

  const near = useNearViewport(targetRef, active && key !== null && shown === null);

  const hasShown = shown !== null;
  useEffect(() => {
    const current = loadRef.current;
    if (!active || !near || !current || hasShown || failedKey === current.key) return;
    const controller = new AbortController();
    setLoading(true);
    loadMediaUrl(current.key, current.fetchBlob, {
      priority: isInViewport(targetRef?.current) ? 'high' : 'low',
      signal: controller.signal,
    })
      .then((src) => {
        if (!controller.signal.aborted) setLoaded({ key: current.key, src });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setFailedKey(current.key);
        if (current.encrypted) onErrorRef.current(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      setLoading(false);
    };
  }, [key, active, near, hasShown, failedKey, targetRef]);

  return {
    src: shown?.src ?? null,
    loading,
    failed: failedKey !== null && failedKey === key && load?.encrypted === true,
  };
}

interface MediaOptions {
  enabled?: boolean;
  showErrors?: boolean;
  /** Loading waits until this element nears the viewport; without it, loads right away */
  targetRef?: RefObject<Element | null>;
  /** Only what a reply preview shows: no video or voice message files */
  previewOnly?: boolean;
}

// The timeline shows thumbnails where there are any (the original only for animated images,
// stickers and videos); originals of everything else load on demand through requestFullRes
export function useDecryptedMedia(
  event: EventEntry,
  client: WizardClient,
  options: MediaOptions = {}
): {
  mediaSrc: string | null;
  thumbnailSrc: string | null;
  isDecrypting: boolean;
  hasFailed: boolean;
  requestFullRes: () => Promise<string | null>;
} {
  const { enabled = true, showErrors = true, targetRef, previewOnly = false } = options;
  const { t } = useTranslation();
  const toast = useToast();
  const syncState = useSyncState();
  const [retryTick, setRetryTick] = useState(0);

  const { full, primary, poster } = mediaLoads(
    client,
    event.content.type,
    entryMedia(event),
    previewOnly
  );

  const onError = useCallback(
    (err: unknown) => {
      if (showErrors) toast.error(t('timeline.decryptFailed', { error: getErrorMessage(err) }));
    },
    [showErrors, toast, t]
  );

  const main = useMediaSlot(primary, enabled, targetRef, retryTick, onError);
  const posterSlot = useMediaSlot(poster, enabled, targetRef, retryTick, onError);

  useEffect(() => {
    if (syncState === 'running') setRetryTick((n) => n + 1);
  }, [syncState]);

  const fullRef = useRef(full);
  fullRef.current = full;
  const fullKey = full?.key ?? null;
  const releasesRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const releases = releasesRef.current;
    return () => {
      for (const release of releases.values()) release();
      releases.clear();
    };
  }, []);

  const requestFullRes = useCallback(async (): Promise<string | null> => {
    const target = fullRef.current;
    if (!target || !fullKey) return null;
    try {
      const url = await loadMediaUrl(target.key, target.fetchBlob, { priority: 'high' });
      if (!releasesRef.current.has(target.key)) {
        releasesRef.current.set(target.key, retainBlobUrl(target.key));
      }
      return url;
    } catch (err) {
      if (target.encrypted) onError(err);
      return null;
    }
  }, [fullKey, onError]);

  return {
    mediaSrc: main.src,
    thumbnailSrc: posterSlot.src,
    isDecrypting: main.loading || posterSlot.loading,
    hasFailed: main.failed || posterSlot.failed,
    requestFullRes,
  };
}
