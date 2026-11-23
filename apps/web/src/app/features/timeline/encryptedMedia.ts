import { encodeBlurhash } from '@/util/blurhash';
import { probeIsAnimated, stillExportFormat } from './utils/imageAnimation';

export interface MediaThumbnail {
  data: Uint8Array;
  mimetype: string;
  width: number;
  height: number;
}

export interface MediaDetails {
  thumbnail?: MediaThumbnail;
  width?: number;
  height?: number;
  durationMs?: number;
  isAnimated?: boolean;
  blurhash?: string;
}

const MAX_THUMB_DIM = 800;

function fitWithinMax(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function createImageThumbnail(
  file: File
): Promise<{ blob: Blob | null; w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    if (file.type === 'image/svg+xml') {
      return null;
    }
    const bitmap = await createImageBitmap(file);
    const origW = bitmap.width;
    const origH = bitmap.height;
    const scale = Math.min(1, MAX_THUMB_DIM / Math.max(origW, origH));
    if (scale >= 1) {
      bitmap.close();
      return { blob: null, w: origW, h: origH };
    }
    const { w, h } = fitWithinMax(origW, origH, MAX_THUMB_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, stillExportFormat(file.type), 0.8)
    );
    if (!blob) return { blob: null, w: origW, h: origH };
    return { blob, w, h };
  } catch {
    return null;
  }
}

function waitForMediaEvent(
  target: HTMLMediaElement,
  event: string,
  timeoutMs = 6000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      fn();
    };
    const onEvent = finish(() => resolve());
    const onError = finish(() => reject(new Error(`Media error while waiting for ${event}`)));
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
  });
}

async function createVideoThumbnail(file: File): Promise<{
  blob: Blob;
  w: number;
  h: number;
  videoWidth: number;
  videoHeight: number;
  durationMs: number;
} | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await waitForMediaEvent(video, 'loadeddata');

    const duration = isFinite(video.duration) ? video.duration : 0;
    if (duration > 0) {
      const target = Math.min(1, duration * 0.1);
      if (video.currentTime < target) {
        try {
          video.currentTime = target;
          await waitForMediaEvent(video, 'seeked', 3000);
        } catch {
          // Fall through and draw the current frame instead of failing.
        }
      }
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw <= 0 || vh <= 0) return null;

    const { w, h } = fitWithinMax(vw, vh, MAX_THUMB_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );
    if (!blob) return null;
    return { blob, w, h, videoWidth: vw, videoHeight: vh, durationMs: Math.round(duration * 1000) };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

const RENDERABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/apng',
  'image/webp',
  'image/avif',
]);

export async function getImageDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(blob);
    const dims = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    if (dims.w > 0 && dims.h > 0) return dims;
  } catch {
    // Not every image format decodes via createImageBitmap; fall back to no dimensions.
  }
  return null;
}

export async function getMediaDetails(file: File): Promise<MediaDetails> {
  const fileType = file.type;
  let thumb: {
    blob: Blob | null;
    w: number;
    h: number;
    videoWidth?: number;
    videoHeight?: number;
    durationMs?: number;
  } | null = null;
  if (fileType.startsWith('video/')) {
    thumb = await createVideoThumbnail(file);
  } else if (RENDERABLE_IMAGE_TYPES.has(fileType)) {
    thumb = await createImageThumbnail(file);
  }

  const details: MediaDetails = {
    width: thumb?.videoWidth,
    height: thumb?.videoHeight,
    durationMs: thumb?.durationMs,
    isAnimated: await probeIsAnimated(fileType, file),
  };
  const preview = thumb?.blob ?? (thumb ? file : null);
  const blurhash = preview ? await encodeBlurhash(preview) : null;
  if (blurhash) details.blurhash = blurhash;
  if (thumb?.blob) {
    details.thumbnail = {
      data: new Uint8Array(await thumb.blob.arrayBuffer()),
      mimetype: thumb.blob.type || stillExportFormat(fileType),
      width: thumb.w,
      height: thumb.h,
    };
  }
  return details;
}
