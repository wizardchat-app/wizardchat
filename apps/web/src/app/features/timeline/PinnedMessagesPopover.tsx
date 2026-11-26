import { useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from '@/app/hooks/useTimeFormat';
import type { RoomTimeline, WizardClient as MatrixClient } from '@wizardchat/core';
import { ArrowBendDownRightIcon, PushPinIcon, PushPinSlashIcon } from '@phosphor-icons/react';
import { Popover } from '@/app/components/Popover/Popover';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { useRoomDetails, useTimeline } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { formatShortDateLabel } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { togglePin } from './message/pinning';
import { ReplyMediaThumb, isReplyMediaEvent } from './message/ReplyMediaThumb';
import { entryBody, isEventEntry, type EventEntry as MatrixEvent } from './message/entry';
import { useLoadedMembers } from './message/members';
import { SkeletonRow } from './SkeletonRow';
import * as css from './PinnedMessagesPopover.css';

const PINNED_KIND = { type: 'pinned' } as const;

function usePinnedEvents(
  client: MatrixClient,
  roomId: string,
  ids: readonly string[]
): { pinned: MatrixEvent[]; timeline: RoomTimeline | null; loading: boolean } {
  const { entries, timeline, loading } = useTimeline(client, roomId, PINNED_KIND);
  const pinned = useMemo(() => {
    const byId = new Map<string, MatrixEvent>();
    for (const entry of entries) {
      if (isEventEntry(entry) && entry.eventId) byId.set(entry.eventId, entry);
    }
    return [...ids]
      .reverse()
      .map((id) => byId.get(id))
      .filter((event): event is MatrixEvent => !!event);
  }, [entries, ids]);
  return { pinned, timeline, loading: ids.length > 0 && (timeline === null || loading) };
}

const NO_IDS: string[] = [];

interface PinnedMessagesPopoverProps {
  client: MatrixClient;
  roomId: string;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onJumpTo: (eventId: string) => void;
}

export function PinnedMessagesPopover({
  client,
  roomId,
  open,
  onClose,
  anchorRef,
  onJumpTo,
}: PinnedMessagesPopoverProps) {
  const { t } = useTranslation();
  const details = useRoomDetails(roomId);
  const { pinned, timeline, loading } = usePinnedEvents(
    client,
    roomId,
    details?.pinnedEventIds ?? NO_IDS
  );
  const canPin = details?.permissions.pin ?? false;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-end"
      shiftCrossAxis
      role="dialog"
      labelledBy="pinned-messages-title"
      className={css.panel}
    >
      <div className={css.header} id="pinned-messages-title">
        <PushPinIcon size={16} weight="fill" className={css.headerIcon} />
        {t('room.header.pinnedMessages')}
      </div>
      <div className={css.list}>
        {pinned.length === 0 && loading ? (
          <>
            <SkeletonRow width1="40%" width2="70%" />
            <SkeletonRow width1="35%" width2="55%" />
          </>
        ) : pinned.length === 0 ? (
          <div className={css.empty}>{t('room.header.noPinnedMessages')}</div>
        ) : (
          pinned.map((event) => (
            <PinnedItem
              key={event.id}
              client={client}
              roomId={roomId}
              timeline={timeline}
              event={event}
              canUnpin={canPin}
              onJumpTo={() => {
                onJumpTo(event.eventId ?? '');
                onClose();
              }}
            />
          ))
        )}
      </div>
    </Popover>
  );
}

interface PinnedItemProps {
  client: MatrixClient;
  roomId: string;
  timeline: RoomTimeline | null;
  event: MatrixEvent;
  canUnpin: boolean;
  onJumpTo: () => void;
}

function PinnedItem({ client, roomId, timeline, event, canUnpin, onJumpTo }: PinnedItemProps) {
  const { t, i18n } = useTranslation();
  const timeFormat = useTimeFormat();
  const toast = useToast();
  const [unpinning, setUnpinning] = useState(false);
  const members = useLoadedMembers(roomId);
  const senderId = event.sender;
  const member = members.get(senderId);
  const senderName = member?.displayName ?? event.senderName ?? formatUserId(senderId);
  const ts = event.timestamp;
  const body = entryBody(event);

  const unpin = () => {
    if (!timeline || !event.eventId) return;
    setUnpinning(true);
    togglePin(timeline, event.eventId, true)
      .catch((err) => toast.error(t('timeline.pinFailed', { error: getErrorMessage(err) })))
      .finally(() => setUnpinning(false));
  };

  let content;
  if (event.content.type === 'redacted') {
    content = <div className={css.textMuted}>{t('timeline.messageDeleted')}</div>;
  } else if (event.content.type === 'unableToDecrypt') {
    content = <div className={css.textMuted}>{t('timeline.couldNotDecrypt')}</div>;
  } else if (isReplyMediaEvent(event)) {
    content = (
      <ReplyMediaThumb
        event={event}
        client={client}
        roomId={roomId}
        body={body}
        thumbClassName={css.media}
        thumbWrapClassName={css.mediaWrap}
        rowClassName={css.mediaRow}
        animate
      />
    );
  } else {
    content = <div className={css.text}>{body}</div>;
  }

  return (
    <div className={css.item}>
      <Avatar
        name={senderName}
        mxcUrl={member?.avatarUrl ?? event.senderAvatar}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.body}>
        <div className={css.meta}>
          <span className={css.sender}>{senderName}</span>
          <span className={css.time}>
            {formatShortDateLabel(ts, t, i18n.language)}, {timeFormat.time(ts)}
          </span>
        </div>
        {content}
      </div>
      <div className={css.actions}>
        <Tooltip content={t('room.header.jumpToMessage')}>
          <button
            type="button"
            className={css.actionBtn}
            onClick={onJumpTo}
            aria-label={t('room.header.jumpToMessage')}
          >
            <ArrowBendDownRightIcon size={15} />
          </button>
        </Tooltip>
        {canUnpin && (
          <Tooltip content={t('timeline.unpin')}>
            <button
              type="button"
              className={css.actionBtn}
              onClick={unpin}
              disabled={unpinning}
              aria-label={t('timeline.unpin')}
            >
              <PushPinSlashIcon size={15} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
