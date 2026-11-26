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

interface View {
  s: number;
  x: number;
  y: number;
}

interface WebKitGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

const IDENTITY: View = { s: 1, x: 0, y: 0 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.25;
const clampZoom = (z: number) => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
const clampAxis = (pos: number, base: number, size: number, viewport: number) =>
  size <= viewport
    ? (viewport - size) / 2 - base
    : Math.min(Math.max(pos, viewport - size - base), -base);
const wheelUnit = (e: WheelEvent) => (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);

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
  const [view, setViewState] = useState<View>(IDENTITY);
  const viewRef = useRef<View>(IDENTITY);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedPlayback = useRef(false);

  const isCarousel = items && items.length > 0;
  const curIndex = isCarousel
    ? Math.max(0, Math.min(itemIndex, (items as LightboxMedia[]).length - 1))
    : 0;
  const current = isCarousel ? (items as LightboxMedia[])[curIndex] : null;
  const curSrc = isCarousel ? (current?.src ?? '') : src;
  const curFilename = isCarousel ? (current?.filename ?? '') : (filename ?? '');

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  useEffect(() => {
    pointersRef.current.clear();
    setView(IDENTITY);
  }, [curIndex, src, setView]);

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

  const canZoom = type === 'image' && !!curSrc && !(current?.isSpoiler && !current.revealed);

  const getBaseRect = useCallback(() => {
    const img = imgRef.current;
    const parent = img?.offsetParent;
    if (!img || !parent || !img.offsetWidth || !img.offsetHeight) return null;
    const p = parent.getBoundingClientRect();
    return {
      left: p.left + parent.clientLeft + img.offsetLeft,
      top: p.top + parent.clientTop + img.offsetTop,
      width: img.offsetWidth,
      height: img.offsetHeight,
    };
  }, []);

  const applyView = useCallback(
    (next: View) => {
      const base = getBaseRect();
      const overlay = overlayRef.current;
      if (!base || !overlay) return;
      const s = clampZoom(next.s);
      setView({
        s,
        x: clampAxis(next.x, base.left, base.width * s, overlay.clientWidth),
        y: clampAxis(next.y, base.top, base.height * s, overlay.clientHeight),
      });
    },
    [getBaseRect, setView]
  );

  const zoomTo = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const base = getBaseRect();
      if (!base) return;
      const cur = viewRef.current;
      const k = clampZoom(nextScale) / cur.s;
      applyView({
        s: cur.s * k,
        x: clientX - base.left - (clientX - base.left - cur.x) * k,
        y: clientY - base.top - (clientY - base.top - cur.y) * k,
      });
    },
    [getBaseRect, applyView]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const cur = viewRef.current;
      applyView({ s: cur.s, x: cur.x + dx, y: cur.y + dy });
    },
    [applyView]
  );

  const zoomAtCenter = useCallback(
    (nextScale: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      zoomTo(nextScale, overlay.clientWidth / 2, overlay.clientHeight / 2);
    },
    [zoomTo]
  );

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !canZoom) return undefined;

    let inGesture = false;
    let lastGestureScale = 1;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (inGesture) return;
        const delta = Math.min(Math.max(e.deltaY * wheelUnit(e), -50), 50);
        zoomTo(viewRef.current.s * Math.exp(-delta * 0.01), e.clientX, e.clientY);
      } else if (viewRef.current.s > 1) {
        e.preventDefault();
        panBy(-e.deltaX * wheelUnit(e), -e.deltaY * wheelUnit(e));
      }
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      inGesture = true;
      lastGestureScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as WebKitGestureEvent;
      zoomTo((viewRef.current.s * g.scale) / lastGestureScale, g.clientX, g.clientY);
      lastGestureScale = g.scale;
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      inGesture = false;
    };
    const onResize = () => applyView(viewRef.current);

    overlay.addEventListener('wheel', onWheel, { passive: false });
    overlay.addEventListener('gesturestart', onGestureStart);
    overlay.addEventListener('gesturechange', onGestureChange);
    overlay.addEventListener('gestureend', onGestureEnd);
    window.addEventListener('resize', onResize);
    return () => {
      overlay.removeEventListener('wheel', onWheel);
      overlay.removeEventListener('gesturestart', onGestureStart);
      overlay.removeEventListener('gesturechange', onGestureChange);
      overlay.removeEventListener('gestureend', onGestureEnd);
      window.removeEventListener('resize', onResize);
    };
  }, [canZoom, zoomTo, panBy, applyView]);

  const handleImgPointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!canZoom) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        return;
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    [canZoom]
  );

  const handleImgPointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      const pointers = pointersRef.current;
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (pointers.size === 1) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (viewRef.current.s > 1) panBy(e.clientX - prev.x, e.clientY - prev.y);
        return;
      }
      const [a, b] = [...pointers.values()];
      const beforeDist = Math.hypot(a.x - b.x, a.y - b.y);
      const beforeX = (a.x + b.x) / 2;
      const beforeY = (a.y + b.y) / 2;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...pointers.values()];
      const afterX = (c.x + d.x) / 2;
      const afterY = (c.y + d.y) / 2;
      if (beforeDist > 0) {
        const afterDist = Math.hypot(c.x - d.x, c.y - d.y);
        zoomTo((viewRef.current.s * afterDist) / beforeDist, afterX, afterY);
      }
      panBy(afterX - beforeX, afterY - beforeY);
    },
    [panBy, zoomTo]
  );

  const handleImgPointerUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    pointersRef.current.delete(e.pointerId);
  }, []);

  const handleImgDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!canZoom) return;
      if (viewRef.current.s > 1) setView(IDENTITY);
      else zoomTo(2.5, e.clientX, e.clientY);
    },
    [canZoom, setView, zoomTo]
  );

  const zoom = view.s;
  const imgStyle: React.CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
  };

  const { t } = useTranslation();
  const zoomPercent = zoom === 1 ? t('mediaLightbox.fit') : `${Math.round(zoom * 100)}%`;
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  const handleZoomIn = useCallback(() => {
    zoomAtCenter(viewRef.current.s * ZOOM_STEP);
  }, [zoomAtCenter]);

  const handleZoomOut = useCallback(() => {
    zoomAtCenter(viewRef.current.s / ZOOM_STEP);
  }, [zoomAtCenter]);

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
            onClick={() => setView(IDENTITY)}
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
      ref={overlayRef}
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
      <div className={css.mediaWrap}>
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
            className={zoom > 1 ? `${css.image} ${css.imagePannable}` : css.image}
            style={imgStyle}
            onPointerDown={handleImgPointerDown}
            onPointerMove={handleImgPointerMove}
            onPointerUp={handleImgPointerUp}
            onPointerCancel={handleImgPointerUp}
            onDoubleClick={handleImgDoubleClick}
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
