import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { autoplayGifsAtom } from '@/app/store/atoms';
import { animatedImageBadge } from '../Timeline.css';
import { firstFrameToBlobUrl, mayBeAnimated } from '../utils/imageAnimation';

const stillCache = new Map<string, string>();
const MAX_STILL_CACHE = 500;

function cacheStill(key: string, url: string): void {
  const existing = stillCache.get(key);
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing);
  }
  if (stillCache.size >= MAX_STILL_CACHE) {
    const lruKey = stillCache.keys().next().value;
    if (lruKey !== undefined) {
      const evicted = stillCache.get(lruKey);
      if (evicted) URL.revokeObjectURL(evicted);
      stillCache.delete(lruKey);
    }
  }
  stillCache.set(key, url);
}

interface AnimatedImageProps {
  src: string;
  alt?: string;
  mimeType?: string;
  isAnimated?: boolean;
  className?: string;
  wrapperClassName?: string;
  preferAutoplay?: boolean;
  alwaysStatic?: boolean;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  onClick?: () => void;
  onLoad?: (img: HTMLImageElement) => void;
  requestFullRes?: () => Promise<string | null>;
}

export function AnimatedImage({
  src,
  alt,
  mimeType,
  isAnimated,
  className,
  wrapperClassName,
  preferAutoplay = false,
  alwaysStatic = false,
  style,
  loading = 'lazy',
  onClick,
  onLoad,
  requestFullRes,
}: AnimatedImageProps) {
  const autoplayGifs = useAtomValue(autoplayGifsAtom);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [animatedSrc, setAnimatedSrc] = useState<string | null>(null);
  const fetchedFullResRef = useRef(false);

  const isAnimationCandidate = isAnimated === true || mayBeAnimated(mimeType);

  const staticMode = !preferAutoplay && !autoplayGifs;
  const wantsStill = (alwaysStatic || staticMode) && isAnimationCandidate;

  useEffect(() => {
    if (!wantsStill) {
      setStillUrl(null);
      return;
    }
    let cancelled = false;
    const cached = stillCache.get(src);
    if (cached) {
      setStillUrl(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      void firstFrameToBlobUrl(img, mimeType).then((url) => {
        if (cancelled || url === null) return;
        cacheStill(src, url);
        setStillUrl(url);
      });
      img.src = '';
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.src = '';
    };
  }, [src, mimeType, wantsStill]);

  // An animated image shown from a still thumbnail animates from the original on first hover
  useEffect(() => {
    if (alwaysStatic || !isAnimationCandidate || !hovering || !requestFullRes) return;
    if (fetchedFullResRef.current) return;
    fetchedFullResRef.current = true;
    let cancelled = false;
    void requestFullRes().then((url) => {
      if (!cancelled && url) setAnimatedSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [alwaysStatic, isAnimationCandidate, hovering, requestFullRes]);

  const effectiveSrc = animatedSrc ?? src;
  const showStill = wantsStill && !!stillUrl && (alwaysStatic || !hovering);
  const showBadge = !alwaysStatic && staticMode && isAnimationCandidate && !hovering;
  const skipAnimatedFallback = alwaysStatic && isAnimationCandidate && !stillUrl;

  return (
    <span
      className={wrapperClassName}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {!skipAnimatedFallback && (
        <img
          src={showStill ? stillUrl : effectiveSrc}
          alt={alt}
          draggable={false}
          className={className}
          style={style}
          loading={loading}
          onClick={onClick}
          onLoad={onLoad && ((e) => onLoad(e.currentTarget))}
        />
      )}
      {showBadge && <span className={animatedImageBadge}>GIF</span>}
    </span>
  );
}
