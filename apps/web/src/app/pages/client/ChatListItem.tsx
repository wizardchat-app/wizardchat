import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SpeakerHighIcon,
  HashStraightIcon,
  BellSlashIcon,
  DotsThreeVerticalIcon,
  PhoneIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import { RoomVoiceParticipants } from '@/app/features/voice/VoiceParticipants';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useTouchUi } from '@/app/hooks/useUiDensitySync';
import { isMenuOpenKey, syntheticMouseEvent } from '@/app/hooks/useContextMenu';
import * as css from './ChatListItem.css';
import { vars } from '@/theme/vars.css';

interface ChatListItemProps {
  name: string;
  roomId: string;
  avatarMxc?: string | null;
  avatarUrl?: string | null;
  avatarPlaceholder?: 'initial' | 'logo';
  isActive: boolean;
  unread?: number;
  hasNotif?: boolean;
  hasVoiceRoom?: boolean;
  hasActiveCall?: boolean;
  isInCall?: boolean;
  isMuted?: boolean;
  showTypeBadge?: boolean;
  hideAvatar?: boolean;
  voiceMembers?: string[];
  compactVoice?: boolean;
  preview?: string | null;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMenuClick?: (e: React.MouseEvent) => void;
}

export function ChatListItem({
  name,
  roomId,
  avatarMxc,
  avatarUrl,
  avatarPlaceholder,
  isActive,
  unread,
  hasNotif,
  hasVoiceRoom,
  hasActiveCall,
  isInCall,
  isMuted,
  showTypeBadge,
  hideAvatar,
  voiceMembers,
  compactVoice,
  preview,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMenuClick,
}: ChatListItemProps) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const touchUi = useTouchUi();
  const itemClass = css.roomItem;
  const prevUnreadRef = useRef<number | undefined>(undefined);
  const [bumping, setBumping] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const badgeCount = Math.max(unread ?? 0, hasNotif ? 1 : 0);

  const openMenuAt = useCallback(
    (x: number, y: number) => {
      onMenuClick?.(syntheticMouseEvent(x, y, rowRef.current));
    },
    [onMenuClick]
  );

  useEffect(() => {
    if (prevUnreadRef.current !== undefined && (unread ?? 0) > prevUnreadRef.current) {
      setBumping(true);
      const timer = setTimeout(() => setBumping(false), 150);
      prevUnreadRef.current = unread;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unread;
  }, [unread]);

  return (
    <div>
      <div
        ref={rowRef}
        className={itemClass}
        data-active={isActive}
        data-has-notif={!isMuted && (hasNotif || (unread ?? 0) > 0) ? 'true' : undefined}
        data-in-call={isInCall ? 'true' : undefined}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        onKeyDown={(e) => {
          if (isMenuOpenKey(e)) {
            e.preventDefault();
            openMenuAt(0, 0);
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {/* Avatar with optional type badge */}
        {showTypeBadge && hideAvatar ? (
          <span
            className={hasVoiceRoom && isInCall ? css.roomTypeIconVoice : css.roomTypeIcon}
            style={
              hasVoiceRoom && isInCall
                ? { color: vars.color.success }
                : isActive
                  ? { color: vars.color.textPrimary }
                  : undefined
            }
            title={hasVoiceRoom ? t('room.joinVoice') : undefined}
          >
            {hasVoiceRoom ? (
              <SpeakerHighIcon size={20} weight="fill" />
            ) : (
              <HashStraightIcon size={20} weight="bold" />
            )}
          </span>
        ) : (
          <span className={css.avatarWrap}>
            <span className={css.chatAvatar}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className={css.chatAvatarImg} />
              ) : (
                <Avatar
                  name={name}
                  mxcUrl={avatarMxc ?? null}
                  client={client ?? undefined}
                  size={touchUi ? 'fill' : 'sm'}
                  placeholder={avatarPlaceholder}
                />
              )}
            </span>
            {showTypeBadge && (
              <span
                className={hasVoiceRoom && isInCall ? css.roomTypeBadgeVoice : css.roomTypeBadge}
                style={
                  hasVoiceRoom && isInCall
                    ? { color: vars.color.success }
                    : isActive
                      ? { color: vars.color.textPrimary }
                      : undefined
                }
                title={hasVoiceRoom ? t('room.joinVoice') : undefined}
              >
                {hasVoiceRoom ? (
                  <SpeakerHighIcon size={11} weight="fill" />
                ) : (
                  <HashStraightIcon size={11} weight="bold" />
                )}
              </span>
            )}
          </span>
        )}

        {preview ? (
          <span className={css.chatTextStack}>
            <span className={css.chatTextContent}>{name}</span>
            <span className={css.chatPreview}>{preview}</span>
          </span>
        ) : (
          <span className={css.chatTextContent}>{name}</span>
        )}

        <span className={css.itemBadges}>
          {hasActiveCall && (
            <span className={css.callBadge} title={t('call.joinCall')}>
              <PhoneIcon size={14} weight="fill" />
            </span>
          )}

          {isMuted && (
            <span className={css.mutedBadge} title={t('room.notifications.mute')}>
              <BellSlashIcon size={13} />
            </span>
          )}

          {badgeCount > 0 ? (
            <span
              className={[hasNotif ? css.roomBadgeNotif : css.roomBadge, bumping && css.badgeBump]
                .filter(Boolean)
                .join(' ')}
            >
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </span>

        {onMenuClick && (
          <Tooltip content={t('common.menu')}>
            <button
              type="button"
              className={css.itemMenuButton}
              aria-label={t('common.menu')}
              onClick={onMenuClick}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </button>
          </Tooltip>
        )}
      </div>
      {/* Voice participants list: only mounted for rooms that actually have a voice room */}
      {hasVoiceRoom && !!voiceMembers && voiceMembers.length > 0 && (
        <RoomVoiceParticipants userIds={voiceMembers} roomId={roomId} compact={compactVoice} />
      )}
    </div>
  );
}
