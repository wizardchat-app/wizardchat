import { useCallback, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/app/components/Tooltip';
import { MicrophoneSlashIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { useProfile, useRoom } from '@/app/data';
import type { VoiceParticipant } from '@/app/features/calls/types';
import { userProfileAtom } from '@/app/store/atoms';
import { callUiAtom } from '@/app/store/atoms/call';
import { useCallLiveState } from '@/app/features/calls/useCallParticipants';
import { useMemberLookup } from '@/app/features/calls/useMemberLookup';
import { Avatar } from '@/app/components/Avatar';
import { UserCallMenu, type UserMenuAnchor } from '@/app/features/calls/stage/UserCallMenu';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import * as css from './VoiceParticipants.css';

function ParticipantRow({
  p,
  isDominant,
  showIcons,
  roomId,
}: {
  p: VoiceParticipant;
  isDominant: boolean;
  showIcons: boolean;
  roomId?: string;
}) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const setProfile = useSetAtom(userProfileAtom);
  const [menu, setMenu] = useState<UserMenuAnchor | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const room = useRoom(roomId);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!p.userId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: p.userId,
        roomId,
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    },
    [p.userId, roomId, setProfile]
  );

  return (
    <>
      <div
        className={isDominant ? css.entrySpeaking : css.entry}
        onClick={handleClick}
        onContextMenu={
          p.userId && room
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({ userId: p.userId, x: rect.right + 8, y: rect.top });
              }
            : undefined
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
      >
        <div className={isDominant ? css.avatarRingSpeaking : css.avatarRing}>
          <Avatar
            name={p.name}
            mxcUrl={p.mxcAvatar}
            client={client ?? undefined}
            size="xs"
            placeholder="logo"
          />
        </div>

        <span className={css.name}>{p.name}</span>

        {showIcons && (
          <div className={css.icons}>
            {p.muted && (
              <span className={css.iconMicMuted}>
                <MicrophoneSlashIcon size={12} />
              </span>
            )}
            {!p.videoMuted && (
              <span className={css.iconCamera}>
                <VideoCameraIcon size={12} weight="fill" />
              </span>
            )}
            {p.screensharing && <span className={css.livePill}>{t('call.live')}</span>}
          </div>
        )}
      </div>
      {menu && room && (
        <UserCallMenu
          anchor={menu}
          roomId={room.id}
          isSelf={menu.userId === client?.userId()}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

const COMPACT_VISIBLE = 6;

function CompactParticipants({
  participants,
  roomId,
}: {
  participants: VoiceParticipant[];
  roomId?: string;
}) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const setProfile = useSetAtom(userProfileAtom);
  const visible = participants.slice(0, COMPACT_VISIBLE);
  const rest = participants.length - visible.length;

  return (
    <div className={css.compactWrap}>
      {visible.map((p) => (
        <Tooltip key={p.userId ?? p.name} content={p.name}>
          <button
            type="button"
            className={p.speaking ? css.compactAvatarSpeaking : css.compactAvatar}
            aria-label={p.name}
            onClick={(e) => {
              if (!p.userId) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setProfile({
                userId: p.userId,
                roomId,
                anchorRect: {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                },
              });
            }}
          >
            <Avatar
              name={p.name}
              mxcUrl={p.mxcAvatar}
              client={client ?? undefined}
              size="xs"
              placeholder="logo"
            />
          </button>
        </Tooltip>
      ))}
      {rest > 0 && (
        <span className={css.compactMore} aria-label={t('call.moreParticipants', { count: rest })}>
          +{rest}
        </span>
      )}
    </div>
  );
}

export function VoiceParticipants({
  participants,
  localInCall,
  roomId,
  compact,
}: {
  participants: VoiceParticipant[];
  localInCall: boolean;
  roomId?: string;
  compact?: boolean;
}) {
  if (participants.length === 0) return null;
  if (compact) return <CompactParticipants participants={participants} roomId={roomId} />;

  return (
    <div className={css.wrap}>
      {participants.map((p) => (
        <ParticipantRow
          key={p.userId ?? p.name}
          p={p}
          isDominant={p.speaking}
          showIcons={localInCall}
          roomId={roomId}
        />
      ))}
    </div>
  );
}

export function RoomVoiceParticipants({
  userIds,
  roomId,
  compact,
}: {
  userIds: string[];
  roomId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const callUi = useAtomValue(callUiAtom);
  const client = getMatrixClientOrNull();
  const room = useRoom(roomId);
  const lookup = useMemberLookup(roomId);
  const liveState = useCallLiveState(roomId);
  const localInCall = callUi.roomId === roomId;
  const ownProfile = useProfile(client?.userId()).data;
  const ownOtherDevice = !!room?.inCallElsewhere;

  const participants = useMemo<VoiceParticipant[]>(() => {
    const myUserId = client?.userId();

    return userIds.map((userId) => {
      const live = liveState.get(userId);
      const isLocal = userId === myUserId;
      const member = lookup(userId);
      const name = (isLocal ? ownProfile?.displayName : null) ?? member.name;

      return {
        userId,
        name: isLocal && ownOtherDevice ? t('call.ownOtherDevice', { name }) : name,
        mxcAvatar: member.avatarUrl ?? (isLocal ? (ownProfile?.avatarUrl ?? null) : null),
        muted: localInCall ? (live ? live.muted : isLocal ? callUi.isMuted : false) : false,
        videoMuted: localInCall
          ? live
            ? live.videoMuted
            : isLocal
              ? callUi.isVideoMuted
              : true
          : true,
        screensharing: localInCall ? (live?.screensharing ?? false) : false,
        speaking: localInCall ? (live?.speaking ?? false) : false,
      };
    });
  }, [
    userIds,
    client,
    lookup,
    ownProfile,
    ownOtherDevice,
    liveState,
    localInCall,
    callUi.isMuted,
    callUi.isVideoMuted,
    t,
  ]);

  if (participants.length === 0) return null;

  return (
    <VoiceParticipants
      participants={participants}
      localInCall={localInCall}
      roomId={roomId}
      compact={compact}
    />
  );
}
