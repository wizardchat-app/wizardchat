import { useCallback, useEffect, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { fetchMediaBlobUrl, mediaBlobCacheKey } from './fetchMediaBlobUrl';
import { deleteCachedBlobUrl, getCachedBlobUrl } from '@/app/features/timeline/message/mediaCache';

export interface MediaBlobOptions {
  width?: number;
  height?: number;
  resizeMethod?: string;
}

export interface MediaBlobResult {
  src: string | undefined;
  failed: boolean;
  refetch: () => void;
}

const RETRY_WINDOW_MS = 30_000;
const lastRetryAt = new Map<string, number>();
const failedKeys = new Set<string>();

function resolveInitialSrc(
  mxcUrl: string | undefined | null,
  cacheKey: string | null
): string | undefined {
  if (!mxcUrl) return undefined;
  if (!mxcUrl.startsWith('mxc://')) return undefined;
  if (cacheKey && failedKeys.has(cacheKey)) return undefined;
  return cacheKey ? (getCachedBlobUrl(cacheKey) ?? undefined) : undefined;
}

export function useMediaBlobUrl(
  client: MatrixClient | null | undefined,
  mxcUrl: string | undefined | null,
  options: MediaBlobOptions = {}
): MediaBlobResult {
  const { width, height, resizeMethod } = options;
  const isMxc = !!mxcUrl && mxcUrl.startsWith('mxc://');
  const cacheKey = isMxc ? mediaBlobCacheKey(mxcUrl as string, width, height, resizeMethod) : null;

  const [state, setState] = useState<{
    key: string | null;
    src: string | undefined;
    failed?: boolean;
  }>(() => ({
    key: cacheKey,
    src: resolveInitialSrc(mxcUrl, cacheKey),
  }));
  const [nonce, setNonce] = useState(0);

  if (state.key !== cacheKey) {
    setState({ key: cacheKey, src: resolveInitialSrc(mxcUrl, cacheKey) });
  }

  useEffect(() => {
    if (!mxcUrl || !client || !isMxc || !cacheKey) return;
    if (failedKeys.has(cacheKey) || getCachedBlobUrl(cacheKey)) return;

    let alive = true;
    fetchMediaBlobUrl(mxcUrl, client, 2, width, height, resizeMethod).then((url) => {
      if (!alive) return;
      setState((prev) =>
        prev.key !== cacheKey ? prev : url ? { key: prev.key, src: url } : { ...prev, failed: true }
      );
    });
    return () => {
      alive = false;
    };
  }, [mxcUrl, client, isMxc, cacheKey, width, height, resizeMethod, nonce]);

  const refetch = useCallback(() => {
    if (!cacheKey) return;
    deleteCachedBlobUrl(cacheKey);
    const now = Date.now();
    if (
      failedKeys.has(cacheKey) ||
      now - (lastRetryAt.get(cacheKey) ?? -Infinity) < RETRY_WINDOW_MS
    ) {
      failedKeys.add(cacheKey);
      setState((prev) => (prev.key === cacheKey ? { key: prev.key, src: undefined } : prev));
      return;
    }
    lastRetryAt.set(cacheKey, now);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  const failed = !!state.failed || (!!cacheKey && failedKeys.has(cacheKey));
  return { src: state.src, failed, refetch };
}
