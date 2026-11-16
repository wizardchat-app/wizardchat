import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { EntryContent, TimelineEntry, WizardClient } from '@wizardchat/core';
import {
  XIcon,
  ArrowLeftIcon,
  LockIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { formatTime } from '@/util/format';
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
import * as css from './ThreadPanel.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const MAX_PAGES = 10;

type EventEntry = Extract<TimelineEntry, { kind: 'event' }>;

interface RootInfo {
  sender: string;
  senderName: string | null;
  senderAvatar: string | null;
  timestamp: number;
  body: string;
  undecryptable: boolean;
}

function contentBody(content: EntryContent): string {
  switch (content.type) {
    case 'text':
    case 'notice':
    case 'emote':
    case 'sticker':
    case 'location':
      return content.body;
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
      return content.media.caption ?? content.media.filename;
    case 'poll':
      return content.poll.question;
    default:
      return '';
  }
}

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
  const colorFor = useUsernameColor();
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

  const rootEntry = useMemo(
    () => entries.find((e): e is EventEntry => e.kind === 'event' && e.eventId === rootId) ?? null,
    [entries, rootId]
  );
  const replies = useMemo(
    () => entries.filter((e) => !(e.kind === 'event' && e.eventId === rootId)),
    [entries, rootId]
  );

  const [fetchedRoot, setFetchedRoot] = useState<RootInfo | null>(null);
  useEffect(() => {
    setFetchedRoot(null);
    if (rootEntry || !loaded) return;
    let cancelled = false;
    client
      .eventSource(roomId, rootId)
      .then((source) => {
        if (cancelled) return;
        const ev = source.decrypted ?? source.original;
        setFetchedRoot({
          sender: String(source.original.sender ?? ''),
          senderName: null,
          senderAvatar: null,
          timestamp: Number(source.original.origin_server_ts ?? 0),
          body: String(ev.content?.body ?? ''),
          undecryptable: !source.decrypted && source.original.type === 'm.room.encrypted',
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, roomId, rootId, rootEntry, loaded]);

  const root: RootInfo | null = rootEntry
    ? {
        sender: rootEntry.sender,
        senderName: rootEntry.senderName,
        senderAvatar: rootEntry.senderAvatar,
        timestamp: rootEntry.timestamp,
        body:
          rootEntry.content.type === 'unableToDecrypt'
            ? t('timeline.couldNotDecrypt')
            : contentBody(rootEntry.content),
        undecryptable: rootEntry.content.type === 'unableToDecrypt',
      }
    : fetchedRoot;

  const buildContext = useBuildContext(client, roomId);
  const items = useMemo<TimelineItem[]>(
    () => buildItems(replies, buildContext, t, i18n.language),
    [replies, buildContext, t, i18n.language]
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

  const rootSenderId = root?.sender ?? '';
  const rootMember = memberById.get(rootSenderId);
  const rootSenderName = rootMember?.displayName ?? root?.senderName ?? formatUserId(rootSenderId);
  const rootSenderAvatar = rootMember?.avatarUrl ?? root?.senderAvatar ?? null;
  const rootBody = root?.body ?? '';
  const rootIsUndecryptable = root?.undecryptable ?? false;

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
  }, [replies.length]);

  return (
    <aside
      data-swipe-back="panel"
      className={`${css.threadPanel}${className ? ` ${className}` : ''}${expanded ? ` ${css.threadPanelExpanded}` : ''}`}
      aria-label={t('timeline.threadPanel')}
      style={isDesktop && !expanded ? { width: `${threadPanelWidth}px` } : undefined}
    >
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
          {t('timeline.threadReplies', { count: items.length })}
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

      <div className={css.threadRootWrap}>
        <div className={css.threadRootMeta}>
          <Avatar
            name={rootSenderName}
            mxcUrl={rootSenderAvatar}
            client={client}
            size="sm"
            placeholder="logo"
          />
          <span className={css.threadRootSender} style={{ color: colorFor(rootSenderId) }}>
            {rootSenderName}
          </span>
          <span className={css.threadRootTime}>
            {root ? formatTime(root.timestamp, i18n.language) : ''}
          </span>
        </div>
        <div className={css.threadRootContent}>
          {rootIsUndecryptable ? (
            <span className={css.threadRootUndecryptable}>
              <LockIcon size={14} /> {rootBody}
            </span>
          ) : (
            rootBody
          )}
        </div>
      </div>

      {!loaded ? (
        <div className={css.threadLoading}>{t('common.loading')}</div>
      ) : (
        <ImagePacksProvider client={client} roomId={roomId}>
          <div ref={replyListRef} className={css.threadReplyList}>
            {items.length === 0 && (
              <div className={css.threadEmpty}>{t('timeline.threadEmpty')}</div>
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
      />
    </aside>
  );
}
