import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { TimelineEntry, WizardClient } from '@wizardchat/core';
import {
  XIcon,
  ArrowLeftIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  UploadIcon,
  ChatDotsIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { formatUserId } from '@/util/matrix';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { useMembers, useTimeline } from '@/app/data';
import { Composer } from '@/app/features/timeline';
import { Message } from '@/app/features/timeline/message/Message';
import {
  threadLastSeenAtom,
  editMessageAtom,
  emojiPickerAtom,
  messageLayoutAtom,
  sendReadReceiptsAtom,
  reportMessageAtom,
  userProfileAtom,
  threadPanelWidthAtom,
  threadPanelExpandedAtom,
  THREAD_PANEL_WIDTH_MIN,
  THREAD_PANEL_WIDTH_MAX,
  THREAD_PANEL_WIDTH_DEFAULT,
} from '@/app/store/atoms';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import { useWidgets } from '@/app/hooks/useWidgets';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { PanelResizer } from '@/app/components/PanelResizer/PanelResizer';
import { buildItems, useBuildContext } from '@/app/hooks/useTimeline';
import type { TimelineItem } from '@/app/hooks/useTimeline';
import { useMessageHover } from '@/app/features/timeline/useMessageHover';
import {
  editStateFor,
  publishTimelineEntries,
} from '@/app/features/timeline/message/editNavigation';
import { ImagePacksProvider } from '@/app/hooks/useImagePacks';
import { useFileDrop } from '@/app/features/timeline/useFileDrop';
import { SkeletonRow } from '@/app/features/timeline/SkeletonRow';
import { chatDropZone } from '@/app/features/timeline/Timeline.css';
import * as css from './ThreadPanel.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const MAX_PAGES = 10;

type EventEntry = Extract<TimelineEntry, { kind: 'event' }>;

interface ThreadPanelProps {
  client: WizardClient;
  roomId: string;
  rootEventId: string;
  className?: string;
  onClose: () => void;
  onBack?: () => void;
}

export function ThreadPanel({
  client,
  roomId,
  rootEventId,
  className,
  onClose,
  onBack,
}: ThreadPanelProps) {
  const { t, i18n } = useTranslation();
  const [droppedFile, setDroppedFile] = useState<File[] | null>(null);
  const clearDroppedFile = useCallback(() => setDroppedFile(null), []);
  const { isDragging, dropProps } = useFileDrop(setDroppedFile);
  const toast = useToast();
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const confirmDialog = useConfirm();
  const [, setEditMessage] = useAtom(editMessageAtom);
  const [, setEmojiPicker] = useAtom(emojiPickerAtom);

  const [hoveredEventId, handleHover] = useMessageHover();
  const [replyTo, setReplyTo] = useState<EventEntry | null>(null);
  const rootId = rootEventId;
  const setThreadLastSeen = useSetAtom(threadLastSeenAtom);
  const setReport = useSetAtom(reportMessageAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const colorFor = useUsernameColor();
  const [threadPanelWidth, setThreadPanelWidth] = useAtom(threadPanelWidthAtom);
  const [expanded, setExpanded] = useAtom(threadPanelExpandedAtom);
  const isDesktop = useMediaQuery('(min-width: 769px)');

  const { entries, atStart, loading, loadOlder, timeline } = useTimeline(client, roomId, {
    type: 'thread',
    rootEventId,
  });
  useEffect(() => publishTimelineEntries(roomId, rootId, entries), [roomId, rootId, entries]);
  const [loaded, setLoaded] = useState(false);
  const pagesRef = useRef(0);
  const { data: members } = useMembers(roomId);
  const layout = useAtomValue(messageLayoutAtom);

  useEffect(() => {
    setLoaded(false);
    setReplyTo(null);
    pagesRef.current = 0;
  }, [roomId, rootEventId]);

  useEffect(() => {
    if (!timeline || loading) return;
    if (!atStart && pagesRef.current < MAX_PAGES) {
      pagesRef.current += 1;
      void loadOlder();
      return;
    }
    setLoaded(true);
  }, [timeline, loading, atStart, loadOlder]);

  const buildContext = useBuildContext(client, roomId);
  const items = useMemo<TimelineItem[]>(
    () => buildItems(entries, buildContext, t, i18n.language),
    [entries, buildContext, t, i18n.language]
  );
  const replyCount = useMemo(
    () => items.filter((item) => item.event.eventId !== rootId).length,
    [items, rootId]
  );

  const { stickerWidget } = useWidgets(client, roomId);

  const markRead = useCallback(
    (entry: EventEntry) => {
      setThreadLastSeen((prev) => ({ ...prev, [rootId]: String(entry.timestamp) }));
      timeline?.markAsRead(!sendReadReceipts).catch(() => {});
    },
    [timeline, rootId, sendReadReceipts, setThreadLastSeen]
  );

  useEffect(() => {
    if (items.length === 0) return;
    const lastItem = items[items.length - 1];
    markRead(lastItem.event);
  }, [items, markRead]);

  const memberById = useMemo(() => new Map((members ?? []).map((m) => [m.userId, m])), [members]);

  const starter =
    items[0]?.event.eventId === rootId
      ? items.find((item) => item.event.eventId !== rootId)
      : undefined;
  const starterName = starter
    ? (memberById.get(starter.senderId)?.displayName ?? starter.senderName)
    : null;

  const receiptUsersOf = useCallback(
    (entry: EventEntry): ReceiptUser[] =>
      entry.readBy
        .filter((r) => r.userId !== client.userId())
        .map((r) => {
          const member = memberById.get(r.userId);
          return {
            userId: r.userId,
            displayName: member?.displayName ?? formatUserId(r.userId),
            avatarUrl: member?.avatarUrl ?? null,
            ts: r.timestamp ?? 0,
          };
        }),
    [client, memberById]
  );

  const handleEdit = useCallback(
    (event: EventEntry) => {
      if (event.sendState === 'failed') {
        toast.info(t('timeline.editNotSent'));
        return;
      }
      setEditMessage(editStateFor(event, roomId, rootId || null));
    },
    [roomId, rootId, setEditMessage, toast, t]
  );

  const handleDelete = useCallback(
    (event: EventEntry) => {
      confirmDialog({
        title: t('timeline.deleteMessage'),
        message: t('timeline.deleteMessageConfirm'),
        danger: true,
      }).then(async (ok) => {
        if (!ok || !timeline) return;
        try {
          await timeline.redact(event.itemKey);
        } catch (err) {
          toast.error(t('timeline.deleteFailed', { error: getErrorMessage(err) }));
        }
      });
    },
    [timeline, confirmDialog, toast, t]
  );

  const handleReport = useCallback(
    (event: EventEntry) => {
      const eventId = event.eventId;
      if (!eventId) return;
      new Promise<string | null>((resolve) => {
        setReport({
          open: true,
          roomId,
          eventId,
          senderId: event.sender,
          resolve,
        });
      }).then((reason) => {
        if (reason === null) return;
        client
          .reportEvent(roomId, eventId, reason)
          .catch((err) => toast.error(t('timeline.reportFailed', { error: getErrorMessage(err) })));
      });
    },
    [client, roomId, setReport, toast, t]
  );

  const handleResend = useCallback(
    (event: EventEntry) => {
      timeline?.retrySend(event.itemKey).catch((err) => {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      });
    },
    [timeline, toast, t]
  );

  const handleCancel = useCallback(
    (event: EventEntry) => {
      timeline?.redact(event.itemKey).catch((err) => {
        console.error('[ThreadPanel] cancelling the send failed', err);
      });
    },
    [timeline]
  );

  const handleReact = useCallback(
    (event: EventEntry, anchorEl?: HTMLElement) => {
      let anchorRect: { x: number; y: number; width: number; height: number } | null = null;
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        anchorRect = { x: r.left, y: r.top, width: r.width, height: r.height };
      }
      setEmojiPicker({
        anchor: anchorEl ?? null,
        anchorRect,
        client,
        roomId,
        onPick: async (emoji: string, mxcUrl?: string) => {
          try {
            const reactionKey = mxcUrl ?? emoji;
            await timeline?.toggleReaction(event.itemKey, reactionKey);
          } catch (err) {
            toast.error(t('timeline.reactFailedShort', { error: getErrorMessage(err) }));
          }
        },
      });
    },
    [client, roomId, timeline, setEmojiPicker, toast, t]
  );

  const replyListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = replyListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length]);

  return (
    <aside
      data-swipe-back="panel"
      className={`${css.threadPanel}${className ? ` ${className}` : ''}${expanded ? ` ${css.threadPanelExpanded}` : ''}`}
      aria-label={t('timeline.threadPanel')}
      style={isDesktop && !expanded ? { width: `${threadPanelWidth}px` } : undefined}
      {...dropProps}
    >
      {isDragging && (
        <div className={chatDropZone}>
          <UploadIcon size={32} />
          <span>{t('timeline.dropToUploadThread')}</span>
        </div>
      )}
      {isDesktop && !expanded && (
        <PanelResizer
          width={threadPanelWidth}
          onWidthChange={setThreadPanelWidth}
          defaultWidth={THREAD_PANEL_WIDTH_DEFAULT}
          min={THREAD_PANEL_WIDTH_MIN}
          max={THREAD_PANEL_WIDTH_MAX}
        />
      )}
      <div className={css.threadPanelHeader}>
        {onBack ? (
          <button
            type="button"
            className={css.threadPanelBack}
            onClick={onBack}
            aria-label={t('common.back')}
          >
            <ArrowLeftIcon size={16} />
          </button>
        ) : null}
        <h2 className={css.threadPanelLabel}>{t('timeline.threadPanel')}</h2>
        <span className={css.threadPanelDivider} />
        <span className={css.threadPanelTitle}>
          {t('timeline.threadReplies', { count: replyCount })}
        </span>
        {isDesktop && (
          <Tooltip content={expanded ? t('common.collapse') : t('common.expand')}>
            <button
              type="button"
              className={css.threadPanelClose}
              onClick={() => setExpanded((prev) => !prev)}
              aria-label={expanded ? t('common.collapse') : t('common.expand')}
            >
              {expanded ? <ArrowsInSimpleIcon size={16} /> : <ArrowsOutSimpleIcon size={16} />}
            </button>
          </Tooltip>
        )}
        <Tooltip content={t('common.close')}>
          <button
            type="button"
            className={css.threadPanelClose}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <XIcon size={16} />
          </button>
        </Tooltip>
      </div>

      {!loaded ? (
        <div className={css.threadLoading} aria-busy="true" aria-label={t('common.loading')}>
          <SkeletonRow width1="45%" width2="65%" />
          <SkeletonRow width1="60%" width2="35%" />
          <SkeletonRow width1="40%" width2="55%" />
        </div>
      ) : (
        <ImagePacksProvider client={client} roomId={roomId}>
          <div ref={replyListRef} className={css.threadReplyList}>
            {starter && starterName && (
              <div className={css.threadStartedBy}>
                <ChatDotsIcon size={14} />
                <span>
                  <Trans
                    i18nKey="timeline.threadStartedBy"
                    values={{ name: starterName }}
                    components={{
                      name: (
                        <button
                          type="button"
                          className={css.threadStartedByName}
                          style={{ color: colorFor(starter.senderId) }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setProfile({
                              userId: starter.senderId,
                              roomId,
                              anchorRect: {
                                top: rect.top,
                                left: rect.left,
                                width: rect.width,
                                height: rect.height,
                              },
                            });
                          }}
                        />
                      ),
                    }}
                  />
                </span>
              </div>
            )}
            {items.map((item) => {
              const eventId = item.event.eventId ?? item.event.itemKey;
              return (
                <div key={eventId}>
                  {item.showDateSep && <div className={css.dateSeparator}>{item.dateSepLabel}</div>}
                  <Message
                    roomId={roomId}
                    timeline={timeline}
                    event={item.event}
                    isOwn={item.isOwn}
                    senderId={item.senderId}
                    senderName={item.senderName}
                    senderAvatar={item.senderAvatar}
                    isGrouped={item.isGrouped}
                    variant={layout}
                    isSystemMessage={item.isSystemMessage}
                    isEdited={item.isEdited}
                    isRedacted={item.isRedacted}
                    isPinned={item.isPinned}
                    canEdit={item.canEdit}
                    canRedact={item.canRedact}
                    canPin={item.canPin}
                    isDecrypting={item.isDecrypting}
                    isUndecryptable={item.isUndecryptable}
                    isSending={item.isSending}
                    isFailed={item.isFailed}
                    sendError={item.sendError}
                    client={client}
                    receiptUsers={receiptUsersOf(item.event)}
                    onReply={setReplyTo}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReport={handleReport}
                    onReact={handleReact}
                    onResend={handleResend}
                    onCancel={handleCancel}
                    hideThreadBadge
                    isHovered={hoveredEventId === eventId}
                    onHover={handleHover}
                  />
                </div>
              );
            })}
            {replyCount === 0 && <div className={css.threadEmpty}>{t('timeline.threadEmpty')}</div>}
          </div>
        </ImagePacksProvider>
      )}

      <Composer
        client={client}
        roomId={roomId}
        threadId={rootId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        stickerWidget={stickerWidget}
        className={css.threadComposerBg}
        onSent={() => {}}
        droppedFile={droppedFile}
        onDroppedFileConsumed={clearDroppedFile}
      />
    </aside>
  );
}
