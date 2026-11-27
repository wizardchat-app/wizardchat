import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useDecryptedMedia } from './encryption';
import { getMediaAnimates } from './media';
import { getMediaInfoSpoiler } from './spoiler';
import { entryEventId, entryMedia, type EventEntry as MatrixEvent } from './entry';
import { MediaSpoiler } from './MediaSpoiler';
import { AnimatedImage } from './AnimatedImage';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import * as css from '../Timeline.css';

const MAX_VISIBLE = 8;

interface GalleryReady {
  src: string | null;
  requestFullRes: () => Promise<string | null>;
}

interface GalleryImageProps {
  index: number;
  event: MatrixEvent;
  client: MatrixClient;
  style?: CSSProperties;
  className?: string;
  revealed?: boolean;
  onReveal?: (index: number) => void;
  onReady?: (index: number, ready: GalleryReady) => void;
  onOpen?: (index: number) => void;
  forceCovered?: boolean;
  hidden?: boolean;
  coverLabel?: string;
  onRevealCover?: (index: number) => void;
  eager?: boolean;
}

function GalleryImage({
  index,
  event,
  client,
  style,
  className,
  revealed = false,
  onReveal,
  onReady,
  onOpen,
  forceCovered = false,
  hidden = false,
  coverLabel,
  onRevealCover,
  eager = false,
}: GalleryImageProps) {
  const { t } = useTranslation();
  const media = entryMedia(event);
  const mediaSpoiler = getMediaInfoSpoiler(media);
  const isCovered = hidden || (!revealed && (forceCovered || mediaSpoiler.isSpoiler));
  const tileRef = useRef<HTMLButtonElement>(null);
  const { mediaSrc, requestFullRes } = useDecryptedMedia(event, client, {
    enabled: !isCovered,
    targetRef: eager ? undefined : tileRef,
  });
  const src = isCovered ? null : mediaSrc;
  const body = media?.caption ?? media?.filename ?? 'image';

  useEffect(() => {
    onReady?.(index, { src: mediaSrc, requestFullRes });
  }, [index, onReady, mediaSrc, requestFullRes]);

  const handleClick = useCallback(() => {
    if (isCovered) {
      (onRevealCover ?? onReveal)?.(index);
      return;
    }
    onOpen?.(index);
  }, [isCovered, index, onReveal, onRevealCover, onOpen]);

  const hasReason = typeof mediaSpoiler.reason === 'string' && mediaSpoiler.reason.length > 0;
  const chipLabel = (forceCovered || hidden ? coverLabel : undefined) ?? t('timeline.spoilerMedia');
  const ariaLabel = isCovered
    ? hasReason
      ? `${chipLabel}: ${mediaSpoiler.reason}`
      : chipLabel
    : body;

  return (
    <button
      ref={tileRef}
      type="button"
      className={className ?? css.galleryTile}
      style={style}
      onClick={handleClick}
      aria-label={ariaLabel}
      title={body}
    >
      {isCovered ? (
        <MediaSpoiler label={chipLabel} reason={mediaSpoiler.reason} interactive={false} />
      ) : src ? (
        <AnimatedImage
          src={src}
          alt={body}
          mimeType={media?.mimetype ?? undefined}
          className={css.galleryTileImg}
          wrapperClassName={css.animatedImageFill}
          isAnimated={getMediaAnimates(media)}
          requestFullRes={requestFullRes}
        />
      ) : (
        <div className={css.galleryTileSkeleton} />
      )}
    </button>
  );
}

const MemoGalleryImage = memo(GalleryImage);

interface MessageGalleryProps {
  events: MatrixEvent[];
  client: MatrixClient;
  senderName: string;
  senderAvatar: string | null;
  forceCovered?: boolean;
  hiddenEventIds?: ReadonlySet<string>;
  coverLabel?: string;
  onRevealTile?: (eventId: string) => void;
}

export function MessageGallery({
  events,
  client,
  senderName,
  senderAvatar,
  forceCovered = false,
  hiddenEventIds,
  coverLabel,
  onRevealTile,
}: MessageGalleryProps) {
  const count = events.length;
  const visibleCount = Math.min(count, MAX_VISIBLE);
  const extras = count > MAX_VISIBLE ? count - MAX_VISIBLE : 0;
  const cols = count >= 5 ? 3 : 2;

  const srcsRef = useRef<Array<GalleryReady | undefined>>([]);
  const [tick, setTick] = useState(0);
  const [revealedIndices, setRevealedIndices] = useState<ReadonlySet<number>>(() => new Set());

  const handleReady = useCallback((index: number, ready: GalleryReady) => {
    srcsRef.current[index] = ready;
    setTick((n) => n + 1);
  }, []);

  const handleReveal = useCallback((index: number) => {
    setRevealedIndices((prev) => new Set(prev).add(index));
  }, []);

  const handleRevealTile = useCallback(
    (index: number) => {
      const ev = events[index];
      const id = ev ? entryEventId(ev) : '';
      setRevealedIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
      if (id !== '') onRevealTile?.(id);
    },
    [events, onRevealTile]
  );

  const isTileCovered = useCallback(
    (index: number) => {
      const ev = events[index];
      if (ev == null) return false;
      if (hiddenEventIds?.has(entryEventId(ev))) return true;
      if (revealedIndices.has(index)) return false;
      return forceCovered || getMediaInfoSpoiler(entryMedia(ev)).isSpoiler;
    },
    [events, hiddenEventIds, forceCovered, revealedIndices]
  );

  // Lightbox items are derived directly from the events array on every render, so
  // the count and the image at each index can never drift from the grid.
  const items = useMemo(
    () =>
      events.map((e, i) => {
        const media = entryMedia(e);
        const spoiler = getMediaInfoSpoiler(media);
        const coveredByFlag = hiddenEventIds?.has(entryEventId(e)) === true;
        const covered = isTileCovered(i);
        return {
          src: covered ? null : (srcsRef.current[i]?.src ?? null),
          filename: (media?.caption ?? media?.filename ?? 'image') || 'image',
          isSpoiler: covered,
          spoilerReason: spoiler.reason,
          label:
            coveredByFlag || (forceCovered && !revealedIndices.has(i)) ? coverLabel : undefined,
          revealed: revealedIndices.has(i),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, tick, isTileCovered, revealedIndices, forceCovered, hiddenEventIds, coverLabel]
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxTick, setLightboxTick] = useState(0);
  const [loadingFullIndex, setLoadingFullIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => {
    setRevealedIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
    setLightboxIndex(index);
  }, []);

  // Mount hidden decrypters for every out-of-view image once the lightbox opens,
  // so each slide resolves to the correct source.
  useEffect(() => {
    if (lightboxIndex === null) return;
    setLightboxTick((n) => n + 1);
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    const ready = srcsRef.current[lightboxIndex];
    if (!ready?.src) return undefined;
    let current = true;
    setLoadingFullIndex(lightboxIndex);
    void (async () => {
      const full = await ready.requestFullRes();
      if (full && srcsRef.current[lightboxIndex]?.src !== full) {
        srcsRef.current[lightboxIndex] = { ...ready, src: full };
        setTick((n) => n + 1);
      }
      if (current) setLoadingFullIndex((i) => (i === lightboxIndex ? null : i));
    })();
    return () => {
      current = false;
    };
  }, [lightboxIndex, lightboxTick, tick]);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i === null ? i : (i - 1 + count) % count));
  }, [count]);

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i === null ? i : (i + 1) % count));
  }, [count]);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  };

  return (
    <>
      <div className={css.gallery} style={gridStyle}>
        {events.slice(0, visibleCount).map((event, idx) => {
          const isTall = count === 3 && idx === 0;
          return (
            <MemoGalleryImage
              key={event.id ?? idx}
              index={idx}
              event={event}
              client={client}
              style={isTall ? { gridRow: 'span 2' } : { aspectRatio: '1 / 1' }}
              revealed={revealedIndices.has(idx)}
              onReveal={handleReveal}
              onReady={handleReady}
              onOpen={openLightbox}
              forceCovered={forceCovered}
              hidden={hiddenEventIds?.has(entryEventId(event)) === true}
              coverLabel={coverLabel}
              onRevealCover={handleRevealTile}
            />
          );
        })}
        {extras > 0 && (
          <button
            type="button"
            className={css.galleryMore}
            style={{ aspectRatio: '1 / 1' }}
            onClick={() =>
              isTileCovered(visibleCount)
                ? handleRevealTile(visibleCount)
                : openLightbox(visibleCount)
            }
            aria-label={`+${extras}`}
          >
            +{extras}
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={items}
          itemIndex={lightboxIndex}
          onPrev={goPrev}
          onNext={goNext}
          name={senderName}
          avatarMxc={senderAvatar}
          client={client}
          onRevealItem={handleRevealTile}
          loadingFull={loadingFullIndex === lightboxIndex}
          onClose={closeLightbox}
        />
      )}

      {lightboxIndex !== null &&
        Array.from({ length: count }, (_, i) => i)
          .filter((i) => i >= visibleCount)
          .map((i) => (
            <span key={i} style={{ display: 'none' }}>
              <MemoGalleryImage
                index={i}
                event={events[i]}
                client={client}
                revealed={revealedIndices.has(i)}
                onReveal={handleReveal}
                onReady={handleReady}
                forceCovered={forceCovered}
                hidden={events[i] ? hiddenEventIds?.has(entryEventId(events[i])) === true : false}
                coverLabel={coverLabel}
                onRevealCover={handleRevealTile}
                eager
              />
            </span>
          ))}
    </>
  );
}
