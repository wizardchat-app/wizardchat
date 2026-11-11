import { useCallback, memo } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAtomValue } from 'jotai';
import { showPresenceDotsAtom } from '@/app/store/atoms/settings';
import type { PresenceState } from '@/app/store/atoms';
import { useAvatarBlobUrl } from './useAvatarBlobUrl';
import { mediaBlobCacheKey } from './fetchMediaBlobUrl';
import { getCachedBlobUrl } from '@/app/features/timeline/message/mediaCache';
import { getInitialAndHue } from './avatarHue';
import { WizardMark } from './WizardMark';
import { Tooltip } from '@/app/components/Tooltip';
import * as css from './Avatar.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: css.avatarXs,
  sm: css.avatarSm,
  md: css.avatar,
  lg: css.avatarLg,
  xl: css.avatarXl,
  fill: css.avatarFill,
};

const THUMBNAIL_PIXELS: Record<AvatarSize, number> = {
  xs: 64,
  sm: 64,
  md: 64,
  lg: 128,
  xl: 192,
  fill: 512,
};

const PRESENCE_DOT_CLASS: Record<AvatarSize, string> = {
  xs: css.presenceDotXs,
  sm: css.presenceDotSm,
  md: css.presenceDotMd,
  lg: css.presenceDotLg,
  xl: css.presenceDotXl,
  fill: css.presenceDotFill,
};

const PRESENCE_COLOR_CLASS: Record<PresenceState, string> = {
  online: css.presenceOnline,
  unavailable: css.presenceUnavailable,
  offline: css.presenceOffline,
};

interface Props {
  name: string;
  mxcUrl?: string | null;
  src?: string | null;
  client?: MatrixClient | null;
  size?: AvatarSize;
  className?: string;
  presence?: PresenceState;
  presenceDotLabel?: string;
  onPresenceDotClick?: (e: React.MouseEvent) => void;
  onAvatarClick?: (e: React.MouseEvent) => void;
  placeholder?: 'initial' | 'logo';
}

export const Avatar = memo(function Avatar({
  name,
  mxcUrl,
  src,
  client,
  size = 'md',
  className,
  presence,
  presenceDotLabel,
  onPresenceDotClick,
  onAvatarClick,
  placeholder = 'initial',
}: Props) {
  const { initial, hue } = getInitialAndHue(name);
  const pixels = THUMBNAIL_PIXELS[size];
  const { data: sharpSrc, refetch } = useAvatarBlobUrl(mxcUrl, client, pixels);
  const imgSrc =
    src ??
    sharpSrc ??
    (pixels > 64 && mxcUrl?.startsWith('mxc://')
      ? (getCachedBlobUrl(mediaBlobCacheKey(mxcUrl, 64, 64, 'crop')) ?? undefined)
      : undefined);

  const handleImgError = useCallback(() => {
    refetch();
  }, [refetch]);

  const sizeClass = SIZE_CLASS[size];
  const combinedClass = className ? `${sizeClass} ${className}` : sizeClass;
  const wrapClass = size === 'fill' ? css.avatarWrapFill : css.avatarWrap;

  const wrapProps = onAvatarClick
    ? {
        className: `${wrapClass} ${css.avatarWrapClickable}`,
        onClick: onAvatarClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onAvatarClick(e as unknown as React.MouseEvent);
        },
      }
    : { className: wrapClass };

  const showDots = useAtomValue(showPresenceDotsAtom);
  const dot =
    presence && showDots ? (
      onPresenceDotClick ? (
        <Tooltip content={presenceDotLabel ?? presence}>
          <button
            type="button"
            className={`${PRESENCE_DOT_CLASS[size]} ${PRESENCE_COLOR_CLASS[presence]} ${css.presenceDotButton}`}
            aria-label={presenceDotLabel ?? presence}
            onClick={(e) => {
              e.stopPropagation();
              onPresenceDotClick(e);
            }}
          />
        </Tooltip>
      ) : (
        <span
          className={`${PRESENCE_DOT_CLASS[size]} ${PRESENCE_COLOR_CLASS[presence]}`}
          aria-label={presence}
        />
      )
    ) : null;

  if (imgSrc) {
    return (
      <div {...wrapProps}>
        <div className={combinedClass}>
          <img src={imgSrc} alt={name} className={css.avatarImg} onError={handleImgError} />
        </div>
        {dot}
      </div>
    );
  }

  return (
    <div {...wrapProps}>
      <div
        className={combinedClass}
        style={{ backgroundColor: `hsl(${hue}, 60%, 42%)` }}
        aria-label={name}
      >
        {placeholder === 'logo' ? <WizardMark className={css.placeholderMark} /> : initial}
      </div>
      {dot}
    </div>
  );
});
