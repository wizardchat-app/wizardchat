import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { RoomTimeline, WizardClient as MatrixClient } from '@wizardchat/core';
import { SmileyIcon, WarningIcon, ChatDotsIcon, ArrowBendUpLeftIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { MessageActionToolbar } from './MessageActionToolbar';
import { ViewSourceModal } from './ViewSourceModal';
import { EditHistoryModal } from './EditHistoryModal';
import { formatTime } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { useContextMenu, isMenuOpenKey, syntheticMouseEvent } from '@/app/hooks/useContextMenu';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import { isThreadInfoUnread } from '@/app/hooks/useHasUnreadThreads';
import { CallHistoryDisplay } from './callEvents';
import { SystemMessageDisplay } from './systemMessages';
import {
  buildReactionMap,
  buildGalleryReactionMap,
  useReactionHandler,
  useGalleryReactionHandler,
  getReactionSenderNames,
} from './reactions';
import { useImagePacksContext } from '@/app/hooks/useImagePacks';
import { emojiToShortcode } from '@/app/features/timeline/emojiData';
import { togglePin } from './pinning';
import { openMessageContextMenu } from './contextMenu';
import { useSwipeToReply } from '@/app/hooks/useTouchGestures';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';
import type { ImagePackImage } from '@/app/hooks/useImagePacks';
import { MessageContent } from './content';
import { MessageGallery } from './GalleryGrid';
import { useDecryptedMedia } from './encryption';
import { getMediaInfoSpoiler } from './spoiler';
import type { MediaCover } from './MediaSpoiler';
import { markdownToHtml, plainTextToHtml } from '@/util/markdownToHtml';
import { emojiPickerAtom } from '@/app/store/atoms/ui';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import {
  entryEventId,
  entryHtml,
  entryMedia,
  useTimelineEntry,
  type EventEntry as MatrixEvent,
} from './entry';
import { useMediaCoveredByPreference } from './privacy';
import { useLoadedMembers } from './members';

function findMxcShortcode(packs: Map<string, ImagePackImage>, mxcUrl: string): string | null {
  for (const [shortcode, img] of packs) {
    if (img.url === mxcUrl) return shortcode;
  }
  return null;
}

const MAX_REACTOR_NAMES = 6;

const MAX_HIDDEN_MEDIA_EVENTS = 500;

function wrapShortcode(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith(':') ? value : `:${value}:`;
}

function formatReactors(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= MAX_REACTOR_NAMES) {
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, MAX_REACTOR_NAMES - 1).join(', ');
  const others = names.length - (MAX_REACTOR_NAMES - 1);
  return `${shown} and ${others} others`;
}

import {
  buildReplyContent,
  isCaptionEditable,
  isEditableEvent,
  type ReplyContent,
} from './textContent';
import { ReceiptAvatar } from './receiptAvatar';
import { ReadReceiptsPopover, useReadReceiptsPopover } from './readReceiptsPopover';
import {
  editMessageAtom,
  userProfileAtom,
  mentionInsertAtom,
  developerModeAtom,
  threadLastSeenAtom,
  hiddenMediaAtom,
  forwardMessageAtom,
  type MessageLayout,
} from '@/app/store/atoms';
import { PollCreatorModal } from '@/app/features/timeline/composer/PollCreatorModal';
import { EditMessageComposer } from './EditMessageComposer';
import { ReplyMediaThumb, isReplyMediaEvent } from './ReplyMediaThumb';
import { extractPollData } from './PollViewer';
import * as css from '../Timeline.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const FLOATING_OVERLAY_SELECTOR =
  '[data-emoji-picker], [data-popover], [role="menu"], [role="listbox"], [role="dialog"]';

function isFloatingOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FLOATING_OVERLAY_SELECTOR) !== null;
}

export interface MessageProps {
  event: MatrixEvent;
  roomId: string;
  timeline: RoomTimeline | null;
  isOwn: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  isGrouped: boolean;
  variant: MessageLayout;
  isSystemMessage: boolean;
  isEdited: boolean;
  isRedacted: boolean;
  isPinned: boolean;
  canEdit: boolean;
  canRedact: boolean;
  canPin: boolean;
  isDecrypting: boolean;
  isUndecryptable: boolean;
  isSending?: boolean;
  isFailed?: boolean;
  sendError?: string | null;
  optimisticBody?: string | null;
  galleryEvents?: MatrixEvent[] | null;
  client: MatrixClient;
  searchQuery?: string;
  receiptUsers?: ReceiptUser[];
  reactionVersion?: number;
  isFlashing?: boolean;
  onReply: (event: MatrixEvent) => void;
  onEdit: (event: MatrixEvent) => void;
  onDelete: (event: MatrixEvent) => void;
  onReport: (event: MatrixEvent) => void;
  onReact: (event: MatrixEvent, anchor?: HTMLElement) => void;
  onThreadClick?: (event: MatrixEvent) => void;
  onResend?: (event: MatrixEvent) => void;
  onCancel?: (event: MatrixEvent) => void;
  onJumpToEvent?: (eventId: string) => void;
  hideReplyQuote?: boolean;
  hideThreadBadge?: boolean;
  isHovered: boolean;
  onHover: (eventId: string | null) => void;
}

const FORWARD_STRIPPED_KEYS = ['m.relates_to', 'm.replace', 'm.new_content', 'm.mentions'];

export const Message = memo(function Message({
  event,
  roomId,
  timeline,
  isOwn,
  senderId,
  senderName,
  senderAvatar,
  isGrouped,
  variant,
  isSystemMessage,
  isEdited,
  isRedacted,
  isPinned,
  canEdit,
  canRedact,
  canPin,
  isDecrypting,
  isUndecryptable,
  isSending = false,
  isFailed = false,
  optimisticBody = null,
  galleryEvents = null,
  client,
  searchQuery = '',
  receiptUsers = [],
  isFlashing = false,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onReact,
  onResend,
  onCancel,
  onJumpToEvent,
  onThreadClick,
  hideReplyQuote = false,
  hideThreadBadge = false,
  isHovered,
  onHover,
}: MessageProps) {
  const { t, i18n } = useTranslation();
  const msgRowRef = useRef<HTMLDivElement>(null);
  const swipeContentRef = useRef<HTMLDivElement>(null);
  const swipeIconRef = useRef<HTMLSpanElement>(null);
  const toast = useToast();
  const emojiPicker = useAtomValue(emojiPickerAtom);
  const contextMenu = useAtomValue(contextMenuAtom);
  const pickerOpenForThisRow =
    emojiPicker?.anchor != null && msgRowRef.current?.contains(emojiPicker.anchor) === true;
  const menuOpenForThisRow =
    contextMenu?.opener != null && msgRowRef.current?.contains(contextMenu.opener) === true;
  const showActions = isHovered || pickerOpenForThisRow || menuOpenForThisRow;
  const [lightboxItem, setLightboxItem] = useState<{
    src: string;
    type: 'image' | 'video';
    initialTime?: number;
  } | null>(null);
  const [viewSourceEvent, setViewSourceEvent] = useState<MatrixEvent | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const openEditHistory = useCallback(() => setEditHistoryOpen(true), []);
  const [devModeEnabled] = useAtom(developerModeAtom);
  const threadLastSeen = useAtomValue(threadLastSeenAtom);
  const { openContextMenu } = useContextMenu();
  const setProfile = useSetAtom(userProfileAtom);
  const setMentionInsert = useSetAtom(mentionInsertAtom);
  const confirmDialog = useConfirm();
  const receipts = useReadReceiptsPopover();
  const members = useLoadedMembers(roomId);
  const eventKey = entryEventId(event);

  const colorFor = useUsernameColor();
  const senderColor = colorFor(senderId);
  const senderNameStyle = useMemo(
    () => (senderColor ? { color: senderColor } : undefined),
    [senderColor]
  );

  const handleNameClick = useCallback(() => {
    setMentionInsert({ text: `@${senderName} `, displayName: senderName, userId: senderId });
  }, [senderName, senderId, setMentionInsert]);

  const handleOpenProfile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: senderId,
        roomId,
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    },
    [senderId, roomId, setProfile]
  );

  const handleMouseEnter = useCallback(() => {
    onHover(eventKey);
  }, [onHover, eventKey]);
  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleRowFocus = useCallback(() => {
    onHover(eventKey);
  }, [onHover, eventKey]);

  const handleRowBlur = useCallback(
    (e: React.FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      if (isFloatingOverlayTarget(next)) return;
      onHover(null);
    },
    [onHover]
  );

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (isMenuOpenKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      handleContextMenu(syntheticMouseEvent(0, 0, e.currentTarget));
    }
  };

  const contentType = event.content.type;
  const media = entryMedia(event);
  const hasCodeBlock = (entryHtml(event) ?? '').includes('<pre');
  const ts = event.timestamp;
  const myId = client.userId() ?? '';
  const isPollEvent = contentType === 'poll';
  const poll = event.content.type === 'poll' ? event.content.poll : null;
  const isCaptionEvent = isCaptionEditable(event);
  const canEditMessageType =
    (isEditableEvent(event) && !(isCaptionEvent && (galleryEvents?.length ?? 0) >= 2)) ||
    isPollEvent;

  const pollData = useMemo(() => {
    if (!isPollEvent) return null;
    const data = extractPollData(event);
    return {
      question: data.questionText,
      answers: data.answers.map((a) => ({ id: a.id, text: a.label })),
      kind: (poll?.undisclosed ? 'undisclosed' : 'disclosed') as 'disclosed' | 'undisclosed',
    };
  }, [event, isPollEvent, poll]);

  const canEndPoll = isPollEvent && isOwn && !!poll && !poll.ended && !!event.eventId;

  const handleEndPoll = useCallback(
    async (ev: MatrixEvent) => {
      const eventId = ev.eventId;
      if (!eventId || !timeline) return;
      const question = extractPollData(ev).questionText;
      const ok = await confirmDialog({
        title: `${t('timeline.poll.end')}?`,
        message: t('timeline.poll.endConfirmMessage', { question }),
        danger: true,
      });
      if (!ok) return;
      try {
        await timeline.endPoll(eventId);
      } catch (err) {
        toast.error(t('timeline.poll.endFailed', { error: getErrorMessage(err) }));
      }
    },
    [timeline, confirmDialog, toast, t]
  );

  // Decrypted media (encrypted attachments)
  const mediaSpoiler = getMediaInfoSpoiler(media);
  const isMediaType = contentType === 'image' || contentType === 'video';
  const isGallery = galleryEvents != null && galleryEvents.length >= 2;
  const hasMedia = isMediaType || isGallery;

  const hiddenMedia = useAtomValue(hiddenMediaAtom);
  const setHiddenMedia = useSetAtom(hiddenMediaAtom);
  const setForwardMessage = useSetAtom(forwardMessageAtom);
  const [mediaRevealed, setMediaRevealed] = useState(false);

  // Hiding from the toolbar covers every event in the group, but a hidden image can
  // then be revealed one at a time from the grid.
  const mediaEventIds = useMemo(
    () => (isGallery ? (galleryEvents ?? []) : [event]).map((ev) => entryEventId(ev)),
    [isGallery, galleryEvents, event]
  );
  const isMediaHidden =
    mediaEventIds.length > 0 && mediaEventIds.every((id) => hiddenMedia[id] === true);
  const isCoveredByPreference = useMediaCoveredByPreference(hasMedia ? roomId : null);
  const galleryHiddenEventIds = useMemo(
    () => new Set(mediaEventIds.filter((id) => hiddenMedia[id] === true)),
    [mediaEventIds, hiddenMedia]
  );
  const galleryForceCovered = isCoveredByPreference && !mediaRevealed;

  const mediaCover: MediaCover | null =
    hasMedia && !mediaRevealed && (mediaSpoiler.isSpoiler || isCoveredByPreference || isMediaHidden)
      ? {
          label: mediaSpoiler.isSpoiler ? t('timeline.spoilerMedia') : t('timeline.showMedia'),
          reason: mediaSpoiler.isSpoiler ? mediaSpoiler.reason : undefined,
        }
      : null;
  const mediaEnabled = !hasMedia || mediaCover == null;

  const {
    mediaSrc,
    thumbnailSrc,
    isDecrypting: isFileDecrypting,
    hasFailed: mediaFailed,
    setMediaSrc,
    requestFullRes,
  } = useDecryptedMedia(event, client, mediaEnabled);

  const handleRevealMedia = useCallback(() => {
    setMediaRevealed(true);
    setHiddenMedia((prev) => {
      if (!mediaEventIds.some((id) => prev[id] === true)) return prev;
      const next = { ...prev };
      for (const id of mediaEventIds) delete next[id];
      return next;
    });
  }, [mediaEventIds, setHiddenMedia]);

  const handleRevealMediaEvent = useCallback(
    (eventId: string) => {
      setHiddenMedia((prev) => {
        if (prev[eventId] !== true) return prev;
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    },
    [setHiddenMedia]
  );

  const handleHideMedia = useCallback(() => {
    setMediaRevealed(false);
    setHiddenMedia((prev) => {
      if (mediaEventIds.length === 0) return prev;
      const next = { ...prev };
      for (const id of mediaEventIds) next[id] = true;
      const keys = Object.keys(next);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_HIDDEN_MEDIA_EVENTS))) {
        delete next[key];
      }
      return next;
    });
  }, [mediaEventIds, setHiddenMedia]);

  const handleMediaClick = useCallback(
    (src: string, type: 'image' | 'video' = 'image', opts?: { currentTime?: number }) => {
      if (type === 'video') {
        setLightboxItem({ src, type, initialTime: opts?.currentTime ?? 0 });
        return;
      }
      setLightboxItem({ src, type });
      requestFullRes().then((full) => {
        if (!full) return;
        setLightboxItem((prev) => (prev?.src === src ? { src: full, type } : prev));
      });
    },
    [requestFullRes]
  );

  const handleLightboxClose = useCallback(() => {
    setLightboxItem(null);
  }, []);

  // For galleries, reactions from every member image are merged into one deduped row.
  const reactionMap = useMemo(
    () =>
      isGallery && galleryEvents ? buildGalleryReactionMap(galleryEvents) : buildReactionMap(event),
    [isGallery, event, galleryEvents]
  );
  const singleReactionHandler = useReactionHandler(event, timeline);
  const galleryReactionHandler = useGalleryReactionHandler(galleryEvents ?? [], timeline);
  const handleReactionClick = isGallery ? galleryReactionHandler : singleReactionHandler;

  const imagePacks = useImagePacksContext();

  const [failedReactions, setFailedReactions] = useState<Set<string>>(new Set());
  const markFailed = useCallback((key: string) => {
    setFailedReactions((prev) => new Set(prev).add(key));
  }, []);

  const renderReactionKey = useCallback(
    (key: string) => {
      if (failedReactions.has(key)) return <>{key}</>;

      let imgUrl: string | null = null;

      const shortcode = key.replace(/^:/, '').replace(/:$/, '');
      const pack = imagePacks.get(shortcode);

      if (pack) {
        imgUrl = pack.url;
      } else if (key.startsWith('mxc://')) {
        for (const img of imagePacks.values()) {
          if (img.url === key) {
            imgUrl = key;
            break;
          }
        }
        if (!imgUrl) imgUrl = key;
      }

      if (imgUrl) {
        return (
          <AuthMediaImg
            client={client}
            mxcUrl={imgUrl}
            alt={key}
            className={css.reactionImg}
            onError={() => markFailed(key)}
          />
        );
      }
      return <>{key}</>;
    },
    [client, imagePacks, failedReactions, markFailed]
  );

  const threadSummary = event.thread;
  const threadBadge = useMemo(() => {
    if (hideThreadBadge || isRedacted || isUndecryptable) return null;
    if (!threadSummary || threadSummary.replies === 0) return null;
    const eventId = event.eventId;
    if (!eventId) return null;

    const count = threadSummary.replies;
    const hasNewReplies = isThreadInfoUnread(
      { rootEventId: eventId, ...threadSummary },
      myId,
      threadLastSeen
    );

    const lastEvent = threadSummary.latestSender !== null;
    let previewSenderId = '';
    let previewSenderName = '';
    let previewSenderAvatar: string | null = null;
    let previewBody = '';
    if (lastEvent) {
      previewSenderId = threadSummary.latestSender ?? '';
      const member = previewSenderId ? members.get(previewSenderId) : undefined;
      previewSenderName =
        member?.displayName ||
        threadSummary.latestSenderName ||
        formatUserId(previewSenderId) ||
        t('common.unknown');
      previewSenderAvatar = member?.avatarUrl ?? null;
      const firstLine = (threadSummary.latestSummary ?? '').split('\n')[0].trim();
      previewBody = threadSummary.latestRedacted
        ? t('timeline.messageDeleted')
        : firstLine ||
          (threadSummary.latestUndecryptable
            ? t('timeline.couldNotDecrypt')
            : t('common.newMessage'));
    }

    return {
      count,
      hasNewReplies,
      lastEvent,
      previewSenderId,
      previewSenderName,
      previewSenderAvatar,
      previewBody,
    };
  }, [
    hideThreadBadge,
    isRedacted,
    isUndecryptable,
    threadSummary,
    event.eventId,
    myId,
    members,
    threadLastSeen,
    t,
  ]);

  const handleReactionDelegate = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-reaction-key]');
      if (!btn) return;
      const key = btn.dataset.reactionKey;
      if (!key) return;
      const reaction = reactionMap.get(key);
      if (reaction) handleReactionClick(reaction);
    },
    [reactionMap, handleReactionClick]
  );

  // Pinning
  const handlePin = useCallback(() => {
    const eventId = event.eventId;
    if (!timeline || !eventId) return;
    togglePin(timeline, eventId, isPinned).catch((err) => {
      toast.error(t('timeline.pinFailed', { error: getErrorMessage(err) }));
    });
  }, [timeline, event.eventId, isPinned, toast, t]);

  // View Source
  const handleViewSource = useCallback((ev: MatrixEvent) => {
    setViewSourceEvent(ev);
  }, []);

  const handleForward = useCallback(
    (ev: MatrixEvent) => {
      const eventId = ev.eventId;
      if (!eventId) return;
      client
        .eventSource(roomId, eventId)
        .then((source) => {
          const clear = source.decrypted ?? source.original;
          const raw = (clear.content ?? {}) as Record<string, unknown>;
          const base = (raw['m.new_content'] as Record<string, unknown> | undefined) ?? raw;
          const content = { ...base };
          for (const key of FORWARD_STRIPPED_KEYS) delete content[key];
          setForwardMessage({ open: true, eventType: String(clear.type ?? ''), content });
        })
        .catch((err) => toast.error(getErrorMessage(err)));
    },
    [client, roomId, setForwardMessage, toast]
  );

  const handleViewSourceClose = useCallback(() => {
    setViewSourceEvent(null);
  }, []);

  // Context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    openMessageContextMenu(e, event, {
      roomId,
      canEdit: canEdit && canEditMessageType,
      canRedact,
      canPin,
      canEndPoll,
      canHideMedia: hasMedia && !isMediaHidden,
      isDecrypting,
      isUndecryptable,
      isRedacted,
      isPinned,
      devModeEnabled,
      t,
      openContextMenu,
      callbacks: {
        onReply,
        onThreadClick,
        onEdit,
        onDelete,
        onReport,
        onEndPoll: handleEndPoll,
        onReact: (ev, anchorEl) => onReact(ev, anchorEl),
        onPin: handlePin,
        onHideMedia: handleHideMedia,
        onViewSource: handleViewSource,
        onEditHistory: isEdited ? openEditHistory : undefined,
        onForward: isPollEvent ? undefined : handleForward,
      },
    });
  };

  const handleToolbarContextMenu = (e: React.MouseEvent) => {
    const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (!el) {
      handleContextMenu(e);
      return;
    }
    const rect = (el.parentElement ?? el).getBoundingClientRect();
    handleContextMenu(
      syntheticMouseEvent(0, 0, el, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        placement: 'bottom-end',
      })
    );
  };

  // Reply quote
  const inReplyTo = !isRedacted && !isUndecryptable ? event.inReplyTo : null;
  const replyTarget = useTimelineEntry(inReplyTo?.eventId);
  const displayReply: ReplyContent | null = useMemo(() => {
    if (!inReplyTo) return null;
    if (replyTarget) return buildReplyContent(replyTarget);
    if (inReplyTo.state !== 'ready') return null;
    return buildReplyContent({
      kind: 'event',
      id: inReplyTo.eventId,
      itemKey: inReplyTo.eventId,
      eventId: inReplyTo.eventId,
      sender: inReplyTo.sender,
      senderName: inReplyTo.senderName,
      senderAvatar: null,
      timestamp: 0,
      isOwn: inReplyTo.sender === myId,
      isEditable: false,
      content: inReplyTo.content,
      inReplyTo: null,
      threadRoot: null,
      thread: null,
      edited: false,
      reactions: [],
      sendState: null,
      readBy: [],
      mentions: null,
      sendError: null,
    });
  }, [inReplyTo, replyTarget, myId]);

  const unavailableReplyId =
    inReplyTo?.state === 'unavailable' && !replyTarget ? inReplyTo.eventId : null;
  const requestedReplyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!unavailableReplyId || !timeline) return;
    if (requestedReplyRef.current === unavailableReplyId) return;
    requestedReplyRef.current = unavailableReplyId;
    timeline.loadReplyDetails(unavailableReplyId).catch(() => {});
  }, [unavailableReplyId, timeline]);

  const handleQuickReact = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onReact(event, e.currentTarget);
    },
    [event, onReact]
  );

  const handleThreadClick = useCallback(() => {
    onThreadClick?.(event);
  }, [event, onThreadClick]);

  // Inline editing
  const [editState, setEditState] = useAtom(editMessageAtom);
  const isEditing = editState?.eventId === eventKey;

  const cancelEdit = useCallback(() => {
    setEditState(null);
    onHover(null);
  }, [setEditState, onHover]);

  const editPollModal = isEditing && isPollEvent && (
    <PollCreatorModal
      open={true}
      onClose={cancelEdit}
      client={client}
      roomId={editState?.roomId ?? ''}
      threadId={editState?.threadId ?? null}
      editEventId={editState?.eventId}
      initialPoll={pollData ?? undefined}
    />
  );

  const touchFirst = useMediaQuery(TOUCH_FIRST_QUERY);
  const canSwipeReply =
    touchFirst && !isRedacted && !isDecrypting && !isUndecryptable && !isFailed && !isSending;
  useSwipeToReply(msgRowRef, swipeContentRef, swipeIconRef, () => onReply(event), canSwipeReply);

  if (event.content.type === 'call') {
    return <CallHistoryDisplay call={event.content.call} client={client} roomId={roomId} />;
  }

  if (isSystemMessage) {
    return (
      <SystemMessageDisplay event={event} senderName={senderName} client={client} roomId={roomId} />
    );
  }

  const messageContent =
    galleryEvents != null && galleryEvents.length >= 2 ? (
      <MessageGallery
        events={galleryEvents}
        client={client}
        senderName={senderName}
        senderAvatar={senderAvatar}
        forceCovered={galleryForceCovered}
        hiddenEventIds={galleryHiddenEventIds}
        coverLabel={t('timeline.showMedia')}
        onRevealTile={handleRevealMediaEvent}
      />
    ) : (
      <MessageContent
        event={event}
        client={client}
        timeline={timeline}
        hideCaption={isEditing}
        mediaSrc={mediaSrc}
        thumbnailSrc={thumbnailSrc}
        isDecrypting={isFileDecrypting}
        mediaFailed={mediaFailed}
        isRedacted={isRedacted}
        isEventDecrypting={isDecrypting}
        isUndecryptable={isUndecryptable}
        searchQuery={searchQuery}
        myId={myId}
        senderName={senderName}
        onMediaLoad={setMediaSrc}
        onMediaClick={handleMediaClick}
        roomId={roomId}
        optimisticBody={optimisticBody}
        imagePacks={imagePacks}
        requestFullRes={requestFullRes}
        mediaCover={mediaCover}
        onRevealMedia={handleRevealMedia}
        onMentionClick={(userId, rect) =>
          setProfile({
            userId,
            roomId,
            anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          })
        }
      />
    );

  const isCompact = variant === 'compact';
  const isCompactInline =
    !(galleryEvents != null && galleryEvents.length >= 2) &&
    (isRedacted ||
      isUndecryptable ||
      isDecrypting ||
      contentType === 'text' ||
      contentType === 'notice' ||
      contentType === 'emote');

  const showEncryptedBanner = isDecrypting || isUndecryptable;
  const showFailedUI = isFailed && !isEdited && !isRedacted;
  const actionToolbar = showActions && !isRedacted && !showEncryptedBanner && !showFailedUI && (
    <MessageActionToolbar
      event={event}
      canEdit={canEdit && canEditMessageType}
      canPin={canPin}
      canEndPoll={canEndPoll}
      isPinned={isPinned}
      canHideMedia={hasMedia && !isMediaHidden}
      onHideMedia={handleHideMedia}
      onReply={onReply}
      onThreadClick={onThreadClick}
      onReact={onReact}
      onEdit={onEdit}
      onEndPoll={handleEndPoll}
      onPin={handlePin}
      onMore={handleToolbarContextMenu}
    />
  );

  const reactionsBar = !showEncryptedBanner &&
    !showFailedUI &&
    !isRedacted &&
    reactionMap.size > 0 && (
      <div
        className={css.reactionsBar}
        role="group"
        aria-label={t('timeline.reactions')}
        onClick={handleReactionDelegate}
      >
        {Array.from(reactionMap.values())
          .sort((a, b) => b.count - a.count)
          .map((r) => (
            <Tooltip
              key={r.key}
              content={(() => {
                const shortcode =
                  wrapShortcode(r.shortcode) ??
                  emojiToShortcode(r.key) ??
                  wrapShortcode(
                    r.key.startsWith('mxc://') ? findMxcShortcode(imagePacks, r.key) : null
                  ) ??
                  r.key;
                const targetEvents = isGallery ? (galleryEvents ?? []) : [event];
                const reactorNames = getReactionSenderNames(
                  targetEvents,
                  r.key,
                  (userId) => members.get(userId)?.displayName
                );
                return t('timeline.reactedWith', {
                  emoji: shortcode,
                  names: formatReactors(reactorNames),
                  count: reactorNames.length,
                });
              })()}
            >
              <button
                type="button"
                data-reaction-key={r.key}
                className={r.isOwn ? css.reactionChipOwn : css.reactionChip}
              >
                {renderReactionKey(r.key)}
                {r.count > 1 ? ` ${r.count}` : ''}
              </button>
            </Tooltip>
          ))}
        <button
          type="button"
          className={css.reactionQuickAdd}
          onClick={handleQuickReact}
          aria-label={t('timeline.react')}
        >
          <span className={css.reactionQuickAddIconWrap}>
            <SmileyIcon size={14} />
            <span className={css.reactionQuickAddPlus}>+</span>
          </span>
        </button>
      </div>
    );

  const MAX_VISIBLE_WITH_OVERFLOW = 3;
  const MAX_VISIBLE_NO_OVERFLOW = 4;
  const hasMoreReaders = receiptUsers.length > MAX_VISIBLE_NO_OVERFLOW;
  const maxVisible = hasMoreReaders ? MAX_VISIBLE_WITH_OVERFLOW : MAX_VISIBLE_NO_OVERFLOW;
  const visibleReceipts = receiptUsers.slice(0, maxVisible);
  const overflowCount = receiptUsers.length - visibleReceipts.length;

  const readReceiptBar = (
    <div className={[css.readReceiptRow, hasCodeBlock ? css.readReceiptRowSpaced : null].join(' ')}>
      {[...visibleReceipts].reverse().map((u) => (
        <ReceiptAvatar key={u.userId} user={u} client={client} onClick={receipts.openFor} />
      ))}
      {overflowCount > 0 && (
        <button
          type="button"
          className={css.readReceiptOverflowBtn}
          aria-label={t('timeline.readReceiptsOverflow', { count: overflowCount })}
          aria-haspopup="listbox"
          onClick={(e) => receipts.openFor(e.currentTarget)}
        >
          +{overflowCount}
        </button>
      )}
    </div>
  );

  const failedUI = showFailedUI && (
    <div className={css.sendFailedRow}>
      <WarningIcon size={14} className={css.sendFailedIcon} />
      <span className={css.sendFailedText}>{t('timeline.sendFailedGeneric')}</span>
      <button type="button" className={css.sendRetryBtn} onClick={() => onResend?.(event)}>
        {t('common.retry')}
      </button>
      <button type="button" className={css.sendDiscardBtn} onClick={() => onCancel?.(event)}>
        {t('common.cancel')}
      </button>
    </div>
  );

  const contentClass =
    variant === 'classic'
      ? isGrouped
        ? isOwn
          ? css.msgContentClassicGroupedOwn
          : css.msgContentClassicGrouped
        : isOwn
          ? css.msgContentClassicOwn
          : css.msgContentClassic
      : isGrouped
        ? css.msgContentGrouped
        : css.msgContent;

  const rowClass = [
    isCompact ? css.msgRowCompact : isGrouped ? css.msgRowGrouped : css.msgRow,
    showActions ? css.msgRowActive : null,
    isSending ? css.msgSending : null,
    isFailed ? css.msgFailed : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={msgRowRef}
      className={rowClass}
      onMouseEnter={handleMouseEnter}
      onMouseDown={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onFocusCapture={handleRowFocus}
      onBlurCapture={handleRowBlur}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      role="group"
      data-hovered={showActions ? 'true' : 'false'}
    >
      {canSwipeReply && (
        <span ref={swipeIconRef} className={css.swipeReplyIcon} aria-hidden>
          <ArrowBendUpLeftIcon size={18} weight="bold" />
        </span>
      )}
      <div
        ref={swipeContentRef}
        className={`${css.msgHoverRegion} ${css.msgJumpFlash}`}
        data-flashing={isFlashing ? 'true' : undefined}
      >
        {!isCompact && (
          <div className={css.msgAvatarCol}>
            {!isGrouped && (
              <button
                type="button"
                onClick={handleOpenProfile}
                aria-label={senderName}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
              >
                <Avatar
                  name={senderName}
                  mxcUrl={senderAvatar}
                  client={client}
                  size="sm"
                  placeholder="logo"
                />
              </button>
            )}
          </div>
        )}

        <div className={isCompact ? css.compactBody : css.msgBody}>
          {!isGrouped && !isCompact ? (
            <div className={css.msgMeta}>
              <button
                type="button"
                className={css.msgSender}
                style={senderNameStyle}
                onClick={handleNameClick}
              >
                {senderName}
              </button>
              <span className={css.msgTime}>{formatTime(ts, i18n.language)}</span>
              {isEdited && (
                <button type="button" className={css.editedMarkerHeader} onClick={openEditHistory}>
                  {t('timeline.edited')}
                </button>
              )}
            </div>
          ) : null}

          {!hideReplyQuote && displayReply && (
            <button
              type="button"
              className={css.replyQuote}
              onClick={() => onJumpToEvent?.(displayReply.eventId)}
            >
              <strong style={{ color: colorFor(displayReply.senderId) }}>
                {members.get(displayReply.senderId)?.displayName ??
                  displayReply.senderName ??
                  formatUserId(displayReply.senderId)}
                :{' '}
              </strong>
              {displayReply.isUndecryptable ? (
                <span>{t('timeline.couldNotDecrypt')}</span>
              ) : displayReply.event && isReplyMediaEvent(displayReply.event) ? (
                <ReplyMediaThumb
                  event={displayReply.event}
                  client={client}
                  roomId={roomId}
                  body={displayReply.body.substring(0, 100)}
                />
              ) : displayReply.mxcUrl ? (
                <AuthMediaImg
                  client={client}
                  mxcUrl={displayReply.mxcUrl}
                  width={24}
                  height={24}
                  alt={displayReply.body || ''}
                  placeholder="none"
                  style={{
                    height: '1.4em',
                    width: 'auto',
                    verticalAlign: 'middle',
                    display: 'inline',
                  }}
                />
              ) : (
                <span
                  dangerouslySetInnerHTML={{
                    __html: displayReply.formattedBody
                      ? markdownToHtml(displayReply.formattedBody, myId, true, false, true)
                      : plainTextToHtml(displayReply.body.substring(0, 100), myId, true),
                  }}
                />
              )}
              {!displayReply.isUndecryptable &&
              !(displayReply.event && isReplyMediaEvent(displayReply.event)) &&
              !displayReply.formattedBody &&
              displayReply.body.length > 100
                ? '...'
                : ''}
            </button>
          )}

          {isCompact ? (
            <>
              <div className={css.compactLine}>
                <span className={css.compactHeader}>
                  <span
                    className={css.compactTime}
                    title={new Date(ts).toLocaleString(i18n.language)}
                  >
                    {formatTime(ts, i18n.language)}
                  </span>
                  <button
                    type="button"
                    className={css.msgSender}
                    style={senderNameStyle}
                    onClick={handleNameClick}
                  >
                    {senderName}
                  </button>
                </span>
                {!isEditing && isCompactInline && (
                  <div className={css.compactText}>
                    {messageContent}
                    {isEdited && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className={css.editedMarkerGroupedClassic}
                          onClick={openEditHistory}
                        >
                          {t('timeline.edited')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {isEditing && !isPollEvent && editState ? (
                <>
                  {isCaptionEvent && <div className={css.compactBlock}>{messageContent}</div>}
                  <EditMessageComposer client={client} editState={editState} onClose={cancelEdit} />
                </>
              ) : !isEditing && !isCompactInline ? (
                <div className={css.compactBlock}>
                  {messageContent}
                  {isEdited && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className={css.editedMarkerGroupedClassic}
                        onClick={openEditHistory}
                      >
                        {t('timeline.edited')}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : isEditing && !isPollEvent ? (
            editState ? (
              <>
                {isCaptionEvent && <div className={contentClass}>{messageContent}</div>}
                <EditMessageComposer client={client} editState={editState} onClose={cancelEdit} />
              </>
            ) : null
          ) : !isEditing ? (
            <div className={contentClass}>
              {messageContent}
              {isGrouped && isEdited && (
                <button
                  type="button"
                  className={
                    variant === 'classic' ? css.editedMarkerGroupedClassic : css.editedMarkerGrouped
                  }
                  onClick={openEditHistory}
                >
                  {t('timeline.edited')}
                </button>
              )}
            </div>
          ) : null}

          {failedUI}

          {reactionsBar}

          {!isEditing && threadBadge && (
            <Tooltip content={t('timeline.threadReplies', { count: threadBadge.count })}>
              <button type="button" className={css.threadBadge} onClick={handleThreadClick}>
                <span className={css.threadBadgeIconWrap}>
                  <ChatDotsIcon size={16} />
                  {threadBadge.hasNewReplies && <span className={css.threadBadgeDot} />}
                </span>
                <span className={css.threadBadgeCount}>{threadBadge.count}</span>
                {threadBadge.lastEvent && (
                  <>
                    <Avatar
                      name={threadBadge.previewSenderName}
                      mxcUrl={threadBadge.previewSenderAvatar}
                      client={client}
                      size="xs"
                      placeholder="logo"
                    />
                    <span
                      className={css.threadBadgeName}
                      style={{ color: colorFor(threadBadge.previewSenderId) }}
                    >
                      <span className={css.threadBadgeNameText}>
                        {threadBadge.previewSenderName}
                      </span>
                      :
                    </span>
                    <span className={css.threadBadgeBody}>{threadBadge.previewBody}</span>
                  </>
                )}
              </button>
            </Tooltip>
          )}
        </div>
        {!isEditing && actionToolbar}
      </div>

      {readReceiptBar}

      <ReadReceiptsPopover
        client={client}
        roomId={roomId}
        users={receiptUsers}
        anchorRef={receipts.anchorRef}
        open={receipts.open}
        onClose={receipts.close}
      />

      {lightboxItem && (
        <MediaLightbox
          src={lightboxItem.src}
          type={lightboxItem.type}
          initialTime={lightboxItem.initialTime}
          name={senderName}
          filename={media ? (media.caption ?? media.filename) : undefined}
          client={client}
          avatarMxc={senderAvatar}
          onClose={handleLightboxClose}
        />
      )}
      <ViewSourceModal
        event={viewSourceEvent}
        roomId={roomId}
        client={client}
        onClose={handleViewSourceClose}
      />
      <EditHistoryModal
        roomId={roomId}
        eventId={editHistoryOpen ? (event.eventId ?? null) : null}
        client={client}
        onClose={() => setEditHistoryOpen(false)}
      />
      {editPollModal}
    </div>
  );
});
