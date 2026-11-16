import type { MediaInfo } from '@wizardchat/core';

export function plainMediaUrl(source: MediaInfo['source'] | null | undefined): string | null {
  return source && 'url' in source && typeof source.url === 'string' ? source.url : null;
}

export function getMediaAnimates(media: MediaInfo | null | undefined): boolean {
  return media?.isAnimated ?? false;
}
