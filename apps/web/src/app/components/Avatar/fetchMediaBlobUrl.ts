import type { WizardClient } from '@wizardchat/core';
import { getCachedBlobUrl, setCachedBlobUrl } from '@/app/features/timeline/message/mediaCache';
import { getSafeMimeType } from '@/util/safeMimeType';
import { sniffMimeType } from '@/util/sniffMimeType';

function isMxcUrl(url: string): boolean {
  return url.startsWith('mxc://');
}

const inFlightFetches = new Map<string, Promise<string | null>>();

export function mediaBlobCacheKey(
  mxcUrl: string,
  width?: number,
  height?: number,
  resizeMethod?: string
): string {
  if (!width && !height) return `mxc:${mxcUrl}`;
  return `mxc:${mxcUrl}:${width ?? ''}x${height ?? ''}:${resizeMethod ?? 'scale'}`;
}

export async function fetchMediaBlobUrl(
  mxcUrl: string,
  client: WizardClient,
  retries = 2,
  width?: number,
  height?: number,
  resizeMethod?: string
): Promise<string | null> {
  if (!isMxcUrl(mxcUrl)) return null;

  const cacheKey = mediaBlobCacheKey(mxcUrl, width, height, resizeMethod);
  const cached = getCachedBlobUrl(cacheKey);
  if (cached) return cached;

  if (cacheKey !== `mxc:${mxcUrl}`) {
    const fullSize = getCachedBlobUrl(`mxc:${mxcUrl}`);
    if (fullSize) return fullSize;
  }

  const pending = inFlightFetches.get(cacheKey);
  if (pending) {
    return pending;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const bytes =
          width || height
            ? await client.thumbnail(
                mxcUrl,
                width ?? height ?? 0,
                height ?? width ?? 0,
                resizeMethod === 'crop'
              )
            : await client.media({ url: mxcUrl });
        const type = sniffMimeType(bytes);
        // Never trust the content type: an SVG/HTML blob opened in a tab would run as the app
        const blob = new Blob([bytes as BlobPart], { type: getSafeMimeType(type ?? '') });
        const blobUrl = URL.createObjectURL(blob);
        setCachedBlobUrl(cacheKey, blobUrl, blob.type, blob.size);
        return blobUrl;
      } catch {
        if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    return null;
  })();

  inFlightFetches.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightFetches.delete(cacheKey);
  }
}
