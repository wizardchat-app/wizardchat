import { useState, useEffect, useRef } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  PushPinIcon,
  PhoneIcon,
  HashStraightIcon,
  SpeakerHighIcon,
  UsersIcon,
  ChatDotsIcon,
  ClockCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import { membersPanelOpenAtom, threadsPanelViewAtom } from '@/app/store/atoms';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { useHasUnreadThreads } from '@/app/hooks/useHasUnreadThreads';
import { useRoom } from '@/app/data';
import { isVoiceRoom } from '@/util/matrix';
import { isModOnly } from '@/app/features/keyboardShortcuts/keyEvents';
import { PinnedMessagesPopover } from './PinnedMessagesPopover';
import { JumpToDateDialog } from './JumpToDateDialog';
import * as css from './RoomHeader.css';

interface RoomHeaderProps {
  client: MatrixClient;
  roomId: string;
  onJumpToEvent?: (eventId: string) => void;
  onStartCall?: (roomId: string, ring: boolean) => void;
  callActive?: boolean;
  othersInCall?: boolean;
  inCallElsewhere?: boolean;
}

export function RoomHeader({
  client,
  roomId,
  onJumpToEvent,
  onStartCall,
  callActive = false,
  othersInCall = false,
  inCallElsewhere = false,
}: RoomHeaderProps) {
  const { t } = useTranslation();
  const toggleMembersPanel = useSetAtom(membersPanelOpenAtom);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);
  const membersPanelOpen = useAtomValue(membersPanelOpenAtom);
  const threadsPanelView = useAtomValue(threadsPanelViewAtom);
  const hasUnreadThreads = useHasUnreadThreads(roomId);
  const room = useRoom(roomId);
  const [showPinned, setShowPinned] = useState(false);

  useEffect(() => {
    if (!onJumpToEvent) return;
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isModOnly(e) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      setShowPinned((v) => !v);
      setShowTopic(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onJumpToEvent]);
  const [showJumpToDate, setShowJumpToDate] = useState(false);
  const [showTopic, setShowTopic] = useState(false);
  // Calls are available in any joined room (DM or group) that isn't a space.
  const can = useCanSendState(roomId);
  const canJoinCall = can('org.matrix.msc3401.call.member');
  const callSupported = (() => {
    if (!room) return false;
    return !room.isInvite;
  })();
  // Voice rooms are joined from the sidebar, so the header button is not an entry point there.
  const isVoice = isVoiceRoom(room);
  const joinsRunningCall = othersInCall || inCallElsewhere;
  const callLive = callActive || joinsRunningCall;
  const callDisabled = callActive || isVoice || !canJoinCall;
  const callLabel = isVoice
    ? t('room.joinVoice')
    : callActive
      ? t('call.callActive')
      : inCallElsewhere
        ? t('call.joinHere')
        : othersInCall
          ? t('call.joinCall')
          : t('call.startCall');
  const callTooltip =
    inCallElsewhere && !callActive && !isVoice ? (
      <>
        {t('call.inCallElsewhere')}
        <br />
        {callLabel}
      </>
    ) : (
      callLabel
    );
  const hasLeftHeaderActions =
    (callSupported && onStartCall !== undefined) || onJumpToEvent !== undefined;

  const pinnedAnchorRef = useRef<HTMLDivElement>(null);

  const topicPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTopic) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      const target = e.target as Node;
      if (e.type === 'keydown') {
        if ((e as KeyboardEvent).key === 'Escape') setShowTopic(false);
        return;
      }
      if (
        topicPanelRef.current &&
        !topicPanelRef.current.contains(target) &&
        !(target instanceof Element && target.closest('[data-topic-trigger]'))
      ) {
        setShowTopic(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [showTopic]);

  useEffect(() => {
    setShowTopic(false);
  }, [roomId]);

  const roomName = room?.name ?? roomId;
  const topic = room?.topic?.trim() ?? '';

  return (
    <div className={css.headerWrapper}>
      {/* Main header bar */}
      <div className={css.header}>
        <div className={css.nameContainer}>
          <div className={css.nameRow}>
            {isVoice ? (
              <SpeakerHighIcon size={16} className={css.roomIcon} weight="fill" />
            ) : (
              <HashStraightIcon size={16} className={css.roomIcon} />
            )}
            <Tooltip content={roomId}>
              <h1 className={css.roomName}>{roomName}</h1>
            </Tooltip>
          </div>
          {topic && (
            <>
              <span className={css.topicDivider} />
              <button
                type="button"
                className={css.topicTrigger}
                data-topic-trigger="true"
                aria-expanded={showTopic}
                onClick={() => {
                  setShowTopic((v) => !v);
                  setShowPinned(false);
                }}
              >
                {topic}
              </button>
            </>
          )}
        </div>

        {/* Call button - available in DM and group rooms */}
        {callSupported && onStartCall && (
          <Tooltip content={callTooltip}>
            <button
              type="button"
              className={callLive ? css.headerBtnActive : css.headerBtn}
              aria-label={callLabel}
              onClick={() => onStartCall(roomId, !joinsRunningCall)}
              disabled={callDisabled}
            >
              <PhoneIcon size={16} weight={callLive ? 'fill' : 'regular'} />
            </button>
          </Tooltip>
        )}

        {/* Pinned button */}
        {onJumpToEvent && (
          <div ref={pinnedAnchorRef} className={css.headerBtnAnchor}>
            <Tooltip content={t('room.header.pinnedMessages')}>
              <button
                type="button"
                className={showPinned ? css.headerBtnActive : css.headerBtn}
                aria-label={t('room.header.pinnedMessages')}
                onClick={() => {
                  setShowPinned((v) => !v);
                  setShowTopic(false);
                }}
              >
                <PushPinIcon size={16} weight={showPinned ? 'fill' : 'regular'} />
              </button>
            </Tooltip>
          </div>
        )}

        {onJumpToEvent && (
          <Tooltip content={t('room.header.jumpToDate')}>
            <button
              type="button"
              className={css.headerBtn}
              aria-label={t('room.header.jumpToDate')}
              onClick={() => setShowJumpToDate(true)}
            >
              <ClockCounterClockwiseIcon size={16} />
            </button>
          </Tooltip>
        )}

        <div className={css.headerPanelButtons}>
          {hasLeftHeaderActions && <div className={`${css.headerDivider} ${css.hideOnMobile}`} />}

          {/* Threads toggle button */}
          <Tooltip content={t('timeline.threads')}>
            <button
              type="button"
              className={threadsPanelView ? css.headerBtnActive : css.headerBtn}
              aria-label={t('timeline.threads')}
              onClick={() => setThreadsPanelView((prev) => (prev ? null : { type: 'list' }))}
            >
              <span className={css.headerThreadIconWrap}>
                <ChatDotsIcon size={16} weight={threadsPanelView ? 'fill' : 'regular'} />
                {hasUnreadThreads && <span className={css.headerThreadDot} />}
              </span>
            </button>
          </Tooltip>

          {/* Members toggle button */}
          <Tooltip content={t('common.members')}>
            <button
              type="button"
              className={membersPanelOpen ? css.headerBtnActive : css.headerBtn}
              aria-label={t('common.members')}
              onClick={() => toggleMembersPanel((v) => !v)}
            >
              <UsersIcon size={16} weight={membersPanelOpen ? 'fill' : 'regular'} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Pinned messages */}
      {showPinned && onJumpToEvent && (
        <PinnedMessagesPopover
          client={client}
          roomId={roomId}
          open
          onClose={() => setShowPinned(false)}
          anchorRef={pinnedAnchorRef}
          onJumpTo={onJumpToEvent}
        />
      )}

      {onJumpToEvent && (
        <JumpToDateDialog
          client={client}
          roomId={roomId}
          open={showJumpToDate}
          onClose={() => setShowJumpToDate(false)}
          onJump={onJumpToEvent}
        />
      )}

      {showTopic && (
        <div ref={topicPanelRef}>
          <div className={css.topicPanel}>
            <p className={css.topicPanelText}>{topic}</p>
          </div>
        </div>
      )}
    </div>
  );
}
