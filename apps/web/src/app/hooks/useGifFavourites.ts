import { useCallback, useEffect, useState } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';

export const GIF_FAVOURITES_CAP = 50;
const GIF_FAVOURITES_ACCOUNT_DATA = 'org.wizardchat.gif_favourites';

function parseFavourites(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const urls = (content as Record<string, unknown>).urls;
  if (!Array.isArray(urls)) return [];
  const valid = urls.filter(
    (url): url is string => typeof url === 'string' && /^https:\/\//.test(url)
  );
  return Array.from(new Set(valid)).slice(0, GIF_FAVOURITES_CAP);
}

function writeFavourites(client: WizardClient, urls: string[]): Promise<void> {
  return client.setAccountData(GIF_FAVOURITES_ACCOUNT_DATA, {
    urls: urls.slice(0, GIF_FAVOURITES_CAP),
  });
}

export function useGifFavourites(client: WizardClient | null | undefined): {
  favourites: string[];
  toggleFavourite: (url: string) => void;
} {
  const synced = useAccountData(GIF_FAVOURITES_ACCOUNT_DATA);
  const [favourites, setFavourites] = useState<string[]>([]);

  useEffect(() => setFavourites(parseFavourites(synced)), [synced]);

  const toggleFavourite = useCallback(
    (url: string) => {
      if (!client) return;
      const next = favourites.includes(url)
        ? favourites.filter((u) => u !== url)
        : [url, ...favourites].slice(0, GIF_FAVOURITES_CAP);
      const previous = favourites;
      setFavourites(next);
      writeFavourites(client, next).catch(() => setFavourites(previous));
    },
    [client, favourites]
  );

  return { favourites, toggleFavourite };
}
