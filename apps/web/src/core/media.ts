import { useEffect, useState } from 'react';
import type { MediaSource, WizardClient } from '@wizardchat/core';
import { getSafeMimeType } from '@/util/safeMimeType';
import { sniffMimeType } from '@/util/sniffMimeType';

const cache = new Map<string, Promise<string | null>>();

function load(key: string, fetchBytes: () => Promise<Uint8Array>, mimetype?: string | null) {
  let request = cache.get(key);
  if (!request) {
    request = fetchBytes()
      .then((bytes) => {
        const type = mimetype || sniffMimeType(bytes) || '';
        return URL.createObjectURL(new Blob([bytes as BlobPart], { type: getSafeMimeType(type) }));
      })
      .catch((error: unknown) => {
        cache.delete(key);
        console.warn('[wizardchat] media failed to load', error);
        return null;
      });
    cache.set(key, request);
  }
  return request;
}

function useBlobUrl(
  key: string | null,
  fetchBytes: () => Promise<Uint8Array>,
  mimetype?: string | null
) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!key) return;
    let cancelled = false;
    void load(key, fetchBytes, mimetype).then((value) => !cancelled && setUrl(value));
    return () => {
      cancelled = true;
    };
    // fetchBytes is derived from the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mimetype]);
  return url;
}

/** A blob URL for message media, decrypted by the core; with a size, a thumbnail */
export function useMediaUrl(
  client: WizardClient | null,
  source: MediaSource | null,
  options: { thumbnail?: number; mimetype?: string | null; enabled?: boolean } = {}
) {
  const { thumbnail, mimetype, enabled = true } = options;
  const key =
    client && source && enabled ? `${JSON.stringify(source)}@${thumbnail ?? 'full'}` : null;
  return useBlobUrl(
    key,
    () =>
      client!.media(
        source!,
        thumbnail ? thumbnail * 2 : undefined,
        thumbnail ? thumbnail * 2 : undefined
      ),
    mimetype
  );
}

/** Saves a media file to disk */
export async function downloadMedia(
  client: WizardClient,
  source: MediaSource,
  filename: string,
  mimetype?: string | null
) {
  const url = await load(`${JSON.stringify(source)}@full`, () => client.media(source), mimetype);
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}
