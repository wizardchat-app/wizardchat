import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, SpinnerGapIcon, StarIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useRoom } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { Tooltip } from '@/app/components/Tooltip';
import { useCoarsePointer } from '@/app/hooks/useCoarsePointer';
import { probeIsAnimated } from '../utils/imageAnimation';
import { getImageDimensions } from './imageDimensions';
import { sendRawEvent, type ReplyTarget } from './sendMessageContent';
import { useComposerTimeline } from './composerTimeline';
import { getErrorMessage } from '@/util/error';
import { GIF_FAVOURITES_CAP, useGifFavourites } from '@/app/hooks/useGifFavourites';
import * as css from './GifPicker.css';

const GIF_API = `${import.meta.env.GIF_API_URL}/v1/gifs`;

interface GiphyImage {
  url: string;
  width: string;
  height: string;
  size?: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: GiphyImage;
    fixed_width?: GiphyImage;
    downsized?: GiphyImage;
    original: GiphyImage;
  };
}

function getThumb(gif: GiphyGif): GiphyImage {
  return gif.images.fixed_width || gif.images.fixed_height;
}

function getAspect(gif: GiphyGif): number {
  const thumb = getThumb(gif);
  const w = Number(thumb.width) || 1;
  const h = Number(thumb.height) || 1;
  return h === 0 ? 1 : w / h;
}

interface GridItem {
  key: string;
  src: string;
  alt: string;
  aspect: number;
}

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  naked?: boolean;
  onClose: () => void;
  onStatusChange?: (sending: boolean) => void;
  replyTo?: ReplyTarget | null;
  onReplySent?: () => void;
}

export function GifPicker({
  client,
  roomId,
  threadId,
  naked,
  onClose,
  onStatusChange,
  replyTo,
  onReplySent,
}: Props) {
  const { t } = useTranslation();
  const coarse = useCoarsePointer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GiphyGif[]>([]);
  const [trending, setTrending] = useState<GiphyGif[]>([]);
  const [searching, setSearching] = useState(false);
  const { favourites, toggleFavourite } = useGifFavourites(client);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'trending' | 'favourites'>('trending');
  const wrapRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const getTimeline = useComposerTimeline(client, roomId, threadId);
  const isEncrypted = useRoom(roomId)?.isEncrypted ?? false;
  const mounted = useRef(false);

  // Fetch trending GIFs on mount
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    (async () => {
      try {
        const res = await fetch(`${GIF_API}/trending?limit=30`);
        const data = await res.json();
        setTrending(data.data || []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Search on query change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${GIF_API}/search?q=${encodeURIComponent(query)}&limit=30`);
        const data = await res.json();
        setResults(data.data || []);
      } catch {
        // ignore
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (naked) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, naked]);

  const sendImage = useCallback(
    async (url: string) => {
      onClose();
      onStatusChange?.(true);
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const fileName = url.split('/').pop() || 'gif';
        const file = new File([blob], fileName, { type: blob.type || 'image/gif' });

        const mimetype = file.type || 'image/gif';
        const bytes = new Uint8Array(await file.arrayBuffer());
        const source = isEncrypted
          ? { file: await client.uploadEncryptedMedia(bytes) }
          : { url: await client.uploadMedia(bytes, mimetype) };
        const isAnimated = await probeIsAnimated(mimetype, file);

        const dims = await getImageDimensions(file);
        const info: Record<string, unknown> = {
          mimetype,
          size: file.size,
        };
        if (typeof isAnimated === 'boolean') info.is_animated = isAnimated;
        if (dims) {
          info.w = dims.w;
          info.h = dims.h;
        }

        const content: Record<string, unknown> = {
          body: 'GIF',
          info,
          ...source,
        };

        await sendRawEvent('m.sticker', content, {
          timeline: await getTimeline(),
          threadId,
          replyTo,
          myId: client.userId() ?? '',
        });
        if (replyTo) onReplySent?.();
      } catch (err) {
        toast.error(t('room.settings.widgets.stickerSendFailed', { error: getErrorMessage(err) }));
      } finally {
        onStatusChange?.(false);
      }
    },
    [
      client,
      isEncrypted,
      threadId,
      getTimeline,
      onClose,
      onStatusChange,
      replyTo,
      onReplySent,
      toast,
      t,
    ]
  );

  const isFavourite = useCallback((url: string) => favourites.includes(url), [favourites]);

  const apiItem = useCallback(
    (gif: GiphyGif): GridItem => ({
      key: gif.id,
      src: gif.images.downsized?.url ?? gif.images.original.url,
      alt: gif.title,
      aspect: getAspect(gif),
    }),
    []
  );

  const buildColumns = (items: GridItem[]): [GridItem[], GridItem[]] => {
    const col1: GridItem[] = [];
    const col2: GridItem[] = [];
    let h1 = 0;
    let h2 = 0;
    for (const item of items) {
      if (h1 <= h2) {
        col1.push(item);
        h1 += item.aspect;
      } else {
        col2.push(item);
        h2 += item.aspect;
      }
    }
    return [col1, col2];
  };

  const renderItem = (item: GridItem) => {
    const fav = isFavourite(item.src);
    const full = !fav && favourites.length >= GIF_FAVOURITES_CAP;
    const favLabel = fav
      ? t('composer.removeFavourite')
      : full
        ? t('composer.favouritesFull')
        : t('composer.addFavourite');
    return (
      <div
        key={item.key}
        className={css.gifItem}
        style={{ aspectRatio: String(item.aspect) }}
        role="button"
        tabIndex={0}
        onClick={() => sendImage(item.src)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            sendImage(item.src);
          }
        }}
      >
        <img
          className={css.gifImg}
          src={item.src}
          alt={item.alt}
          loading="lazy"
          onLoad={(e) => {
            if (!isFavourite(item.src)) return;
            const img = e.currentTarget;
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            if (w > 0 && h > 0) {
              const ar = w / h;
              setAspects((prev) => (prev[item.src] === ar ? prev : { ...prev, [item.src]: ar }));
            }
          }}
        />
        <Tooltip content={favLabel} placement="top">
          <button
            type="button"
            className={css.favBtn}
            data-active={fav}
            data-coarse={coarse}
            aria-disabled={full}
            onClick={(e) => {
              e.stopPropagation();
              if (full) return;
              toggleFavourite(item.src);
            }}
            aria-label={favLabel}
          >
            <StarIcon size={14} weight={fav ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
      </div>
    );
  };

  const renderMasonry = (items: GridItem[]) => {
    const [col1, col2] = buildColumns(items);
    return (
      <div className={css.masonry}>
        <div className={css.masonryCol}>{col1.map(renderItem)}</div>
        <div className={css.masonryCol}>{col2.map(renderItem)}</div>
      </div>
    );
  };

  const hasQuery = !!query.trim();
  const trendingItems = trending.map(apiItem);
  const searchItems = results.map(apiItem);
  const favouriteItems: GridItem[] = favourites.map((url) => ({
    key: url,
    src: url,
    alt: t('composer.gif'),
    aspect: aspects[url] ?? 1,
  }));
  const displayItems = hasQuery
    ? searchItems
    : activeTab === 'trending'
      ? trendingItems
      : favouriteItems;

  return (
    <div ref={wrapRef} className={naked ? css.popoverNaked : css.popover}>
      <div className={css.searchWrap}>
        <div className={css.searchInner}>
          <input
            className={css.searchInput}
            placeholder={t('composer.searchGifs')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={!coarse}
          />
          <button
            type="button"
            className={css.searchClearBtn}
            onClick={() => setQuery('')}
            aria-label={t('common.clear')}
            style={{ visibility: query ? 'visible' : 'hidden' }}
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>
      {!hasQuery && (
        <div className={css.tabsSub} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'trending'}
            className={`${css.tabSub} ${activeTab === 'trending' ? css.tabSubActive : ''}`}
            onClick={() => setActiveTab('trending')}
          >
            {t('composer.trending')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'favourites'}
            className={`${css.tabSub} ${activeTab === 'favourites' ? css.tabSubActive : ''}`}
            onClick={() => setActiveTab('favourites')}
          >
            {t('composer.favourites')}
          </button>
        </div>
      )}
      <div className={css.gridWrap}>
        {hasQuery && searching && (
          <div className={css.loadingState}>
            <SpinnerGapIcon size={20} className="icon-spin" />
          </div>
        )}
        {hasQuery && !searching && results.length === 0 && (
          <div className={css.emptyState}>{t('composer.noResults')}</div>
        )}
        {!hasQuery && activeTab === 'trending' && trending.length === 0 && !searching && (
          <div className={css.emptyState}>{t('composer.searchGifsHint')}</div>
        )}
        {!hasQuery && activeTab === 'favourites' && favourites.length === 0 && (
          <div className={css.emptyState}>{t('composer.noFavourites')}</div>
        )}
        {displayItems.length > 0 && (hasQuery && searching ? null : renderMasonry(displayItems))}
      </div>
    </div>
  );
}
