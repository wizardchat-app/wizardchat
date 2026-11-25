import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  XIcon,
  DownloadSimpleIcon,
  PlusIcon,
  MinusIcon,
  UploadSimpleIcon,
  TrashIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/app/components/Avatar';
import { MediaSpoiler } from '@/app/features/timeline/message/MediaSpoiler';
import * as css from './MediaLightbox.css';

interface LightboxMedia {
  src: string | null;
  filename?: string;
  isSpoiler?: boolean;
  spoilerReason?: string;
  label?: string;
  revealed?: boolean;
}

interface MediaLightboxProps {
  src?: string;
  name?: string;
  filename?: string;
  client?: MatrixClient | null;
  avatarMxc?: string | null;
  type?: 'image' | 'video';
  initialTime?: number;
  onClose: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
  items?: LightboxMedia[];
  itemIndex?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onRevealItem?: (index: number) => void;
}

export function MediaLightbox({
  src,
  name,
  filename,
  client,
  avatarMxc,
  type = 'image',
  initialTime = 0,
  onClose,
  onReplace,
  onRemove,
  items,
  itemIndex = 0,
  onPrev,
  onNext,
  onRevealItem,
}: MediaLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [fitW, setFitW] = useState(0);
  const [fitH, setFitH] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedPlayback = useRef(false);

  const isCarousel = items && items.length > 0;
  const curIndex = isCarousel
    ? Math.max(0, Math.min(itemIndex, (items as LightboxMedia[]).length - 1))
    : 0;
  const current = isCarousel ? (items as LightboxMedia[])[curIndex] : null;
  const curSrc = isCarousel ? (current?.src ?? '') : src;
  const curFilename = isCarousel ? (current?.filename ?? '') : (filename ?? '');

  useEffect(() => {
    setZoom(1);
    setFitW(0);
    setFitH(0);
  }, [curIndex, src]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isCarousel && e.key === 'ArrowLeft') onPrev?.();
      if (isCarousel && e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext, isCarousel]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const pressedOverlayRef = useRef(false);
  const handleOverlayPointerDown = useCallback((e: React.PointerEvent) => {
    pressedOverlayRef.current = e.target === e.currentTarget;
  }, []);
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && pressedOverlayRef.current) onClose();
      pressedOverlayRef.current = false;
    },
    [onClose]
  );

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFitW(rect.width);
    setFitH(rect.height);
  }, []);

  const isZoomed = zoom > 1 && fitW > 0 && fitH > 0;

  let imgClassName = css.image;
  let imgStyle: React.CSSProperties = {};

  if (isZoomed) {
    imgClassName = css.imageZoomed;
    imgStyle.width = fitW * zoom;
    imgStyle.height = fitH * zoom;
    imgStyle.flexShrink = 0;
  }

  const { t } = useTranslation();
  const zoomPercent = zoom === 1 ? t('mediaLightbox.fit') : `${Math.round(zoom * 100)}%`;
  const canZoomOut = zoom > 1;
  const canZoomIn = zoom < 10;

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.25, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.25, 1));
  }, []);

  const toolbarContent = (
    <div className={css.toolbar}>
      {name ? (
        <>
          <Avatar name={name} mxcUrl={avatarMxc} client={client} size="xs" placeholder="logo" />
          <div className={css.toolbarMeta}>
            <span className={css.senderName}>{name}</span>
            {curFilename && <span className={css.imageName}>{curFilename}</span>}
          </div>
        </>
      ) : (
        curFilename && (
          <div className={css.toolbarMeta}>
            <span className={css.imageName}>{curFilename}</span>
          </div>
        )
      )}

      {isCarousel && (
        <>
          <span className={css.counter}>
            {curIndex + 1}/{items?.length}
          </span>
          <button
            type="button"
            className={css.navBtn}
            onClick={onPrev}
            aria-label={t('mediaLightbox.previous')}
          >
            <CaretLeftIcon size={18} weight="bold" />
          </button>
          <button
            type="button"
            className={css.navBtn}
            onClick={onNext}
            aria-label={t('mediaLightbox.next')}
          >
            <CaretRightIcon size={18} weight="bold" />
          </button>
        </>
      )}

      {type !== 'video' && (
        <>
          <button
            type="button"
            className={css.zoomBtn}
            onClick={handleZoomOut}
            disabled={!canZoomOut}
            aria-label={t('mediaLightbox.zoomOut')}
          >
            <MinusIcon size={14} />
          </button>

          <button
            type="button"
            className={css.zoomLabel}
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
          >
            {zoomPercent}
          </button>

          <button
            type="button"
            className={css.zoomBtn}
            onClick={handleZoomIn}
            disabled={!canZoomIn}
            aria-label={t('mediaLightbox.zoomIn')}
          >
            <PlusIcon size={14} />
          </button>
        </>
      )}

      {onReplace && (
        <button type="button" className={css.actionBtn} onClick={onReplace}>
          <UploadSimpleIcon size={14} /> {t('mediaLightbox.replace')}
        </button>
      )}
      {onRemove && (
        <button type="button" className={css.actionBtn} onClick={onRemove}>
          <TrashIcon size={14} /> {t('common.remove')}
        </button>
      )}
      {curSrc && (
        <a href={curSrc} download={curFilename || 'image.png'} className={css.downloadBtn}>
          <DownloadSimpleIcon size={14} />
          {t('common.download')}
        </a>
      )}
    </div>
  );

  return createPortal(
    <div
      className={css.overlay}
      role="presentation"
      onPointerDown={handleOverlayPointerDown}
      onClick={handleOverlayClick}
      onContextMenu={handleContextMenu}
    >
      <button
        type="button"
        className={css.closeBtn}
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <XIcon size={20} />
      </button>
      <div className={css.mediaWrap} style={{ overflow: isZoomed ? 'auto' : 'hidden' }}>
        {isCarousel && current?.isSpoiler && !current.revealed ? (
          <div className={css.spoilerSlide}>
            <MediaSpoiler
              reason={current.spoilerReason}
              label={current.label}
              onReveal={() => onRevealItem?.(curIndex)}
            />
          </div>
        ) : curSrc && type === 'video' ? (
          <video
            ref={videoRef}
            src={curSrc}
            className={css.video}
            controls
            autoPlay
            playsInline
            onPlay={() => {
              hasStartedPlayback.current = true;
            }}
            onLoadedMetadata={() => {
              const el = videoRef.current;
              if (el && initialTime > 0 && !hasStartedPlayback.current) {
                el.currentTime = initialTime;
              }
            }}
            onContextMenu={(e) => e.stopPropagation()}
          />
        ) : curSrc ? (
          <img
            ref={imgRef}
            src={curSrc}
            alt=""
            className={imgClassName}
            style={imgStyle}
            onLoad={handleImgLoad}
            draggable={false}
          />
        ) : (
          <div className={css.loading} />
        )}
      </div>
      {toolbarContent}
    </div>,
    document.body
  );
}
