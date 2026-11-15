import { memo, useMemo, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUiDensitySizes } from '@/app/hooks/useUiDensitySync';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import {
  currentRoomIdAtom,
  userProfileAtom,
  presenceVisibleAtom,
  ownPresenceAtom,
  userIdAtom,
} from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Avatar } from '@/app/components/Avatar';
import { useSyncReady } from '@/app/hooks/useSync';
import { useRoomSettings } from '@/app/data';
import { useMembers } from './useMembers';
import type { MemberEntry } from './useMembers';
import {
  buildRoleSections,
  getRoleKey,
  getRoleRank,
  getRoomCreators,
  isRoleHeader,
} from './memberRoles';
import type { RoleSectionItem } from './memberRoles';
import { useUserStatusText } from '@/app/features/status/customStatus';
import * as css from './MembersList.css';

const MemberRow = memo(function MemberRow({
  member,
  client,
  roomId,
  showPresence,
  ownPresence,
}: {
  member: MemberEntry;
  client: ReturnType<typeof getMatrixClientOrNull>;
  roomId: string | null;
  showPresence: boolean;
  ownPresence: PresenceState | undefined;
}) {
  const setProfile = useSetAtom(userProfileAtom);
  const localUserId = useAtomValue(userIdAtom);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!roomId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: member.userId,
        roomId,
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    },
    [member.userId, roomId, setProfile]
  );

  const statusText = useUserStatusText(client, member.userId, true);
  const presence = showPresence
    ? member.userId === localUserId
      ? ownPresence
      : member.presence
    : undefined;

  return (
    <Tooltip content={member.userId}>
      <div
        className={css.memberRow}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
      >
        <Avatar
          name={member.displayName}
          mxcUrl={member.avatarMxc}
          client={client ?? undefined}
          size="sm"
          placeholder="logo"
          presence={presence}
        />
        {statusText ? (
          <span className={css.memberText}>
            <span className={css.memberNameStacked}>{member.displayName}</span>
            <span className={css.memberStatus}>{statusText}</span>
          </span>
        ) : (
          <span className={css.memberName}>{member.displayName}</span>
        )}
      </div>
    </Tooltip>
  );
});

interface MembersListProps {
  roomId?: string | null;
}

export function MembersList({ roomId: propRoomId }: MembersListProps = {}) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const atomRoomId = useAtomValue(currentRoomIdAtom);
  const roomId = propRoomId ?? atomRoomId;
  const showPresence = useAtomValue(presenceVisibleAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const syncReady = useSyncReady();
  const ownPresenceGated: PresenceState | undefined =
    showPresence && syncReady ? ownPresence : undefined;
  const { members, loading } = useMembers(client, roomId);

  const { data: settings } = useRoomSettings(roomId);
  const creators = useMemo(() => getRoomCreators(settings), [settings]);

  const sortedMembers = useMemo(() => {
    return [...members]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .sort((a, b) => getRoleRank(getRoleKey(b, creators)) - getRoleRank(getRoleKey(a, creators)));
  }, [members, creators]);

  const roleSections = useMemo(
    () => buildRoleSections(sortedMembers, creators, t),
    [sortedMembers, creators, t]
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const { roleHeader: roleHeaderSize, memberRow: memberRowSize } = useUiDensitySizes();

  const virtualizer = useVirtualizer({
    count: roleSections.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (isRoleHeader(roleSections[index]) ? roleHeaderSize : memberRowSize),
    overscan: 5,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [roleHeaderSize, memberRowSize, virtualizer]);

  // Reset scroll position when switching rooms
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [roomId]);

  if (!roomId) return null;

  return (
    <div className={css.membersListContainer}>
      {loading && sortedMembers.length === 0 ? (
        <div className={css.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={css.skeletonRow}>
              <div className={css.skeletonAvatar} />
              <div className={css.skeletonLine} />
            </div>
          ))}
        </div>
      ) : sortedMembers.length === 0 ? (
        <div className={css.emptyState}>{t('room.noMembers')}</div>
      ) : (
        <div ref={scrollRef} className={css.membersScrollArea}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item: RoleSectionItem = roleSections[virtualRow.index];
              const rowStyle = {
                position: 'absolute' as const,
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              };

              if (isRoleHeader(item)) {
                return (
                  <div key={`role-${item.roleKey}`} className={css.roleHeader} style={rowStyle}>
                    <span className={css.roleHeaderLabel}>{item.label}</span>
                    <span className={css.roleHeaderCount}>{item.count}</span>
                  </div>
                );
              }

              return (
                <div key={item.member.userId} style={rowStyle}>
                  <MemberRow
                    member={item.member}
                    client={client}
                    roomId={roomId}
                    showPresence={showPresence}
                    ownPresence={ownPresenceGated}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
