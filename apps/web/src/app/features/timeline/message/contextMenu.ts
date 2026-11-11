import type { TFunction } from 'i18next';
import {
  ArrowBendUpLeftIcon,
  ChatDotsIcon,
  SmileyIcon,
  PushPinIcon,
  PushPinSlashIcon,
  PencilSimpleIcon,
  TrashIcon,
  CodeIcon,
  ClockCounterClockwiseIcon,
  XSquareIcon,
  FlagIcon,
  EyeSlashIcon,
  LinkSimpleIcon,
  ArrowBendUpRightIcon,
  CopyIcon,
} from '@phosphor-icons/react';
import type { useContextMenu, MenuOpenEvent } from '@/app/hooks/useContextMenu';
import { createElement } from 'react';
import { makeEventPermalink } from '@/util/matrix';
import { entryText, type EventEntry as MatrixEvent } from './entry';

type ContextMenuController = ReturnType<typeof useContextMenu>;

export interface ContextMenuCallbacks {
  onReply: (event: MatrixEvent) => void;
  onThreadClick?: (event: MatrixEvent) => void;
  onEdit: (event: MatrixEvent) => void;
  onDelete: (event: MatrixEvent) => void;
  onReport: (event: MatrixEvent) => void;
  onEndPoll?: (event: MatrixEvent) => void;
  onReact: (event: MatrixEvent, anchorEl?: HTMLElement) => void;
  onPin: () => void;
  onHideMedia: () => void;
  onViewSource: (event: MatrixEvent) => void;
  onEditHistory?: () => void;
  onForward?: (event: MatrixEvent) => void;
}

export function openMessageContextMenu(
  e: MenuOpenEvent,
  event: MatrixEvent,
  {
    roomId,
    canEdit,
    canRedact,
    canPin,
    canEndPoll,
    canHideMedia,
    isDecrypting,
    isUndecryptable,
    isRedacted,
    isPinned,
    devModeEnabled,
    t,
    openContextMenu,
    callbacks,
  }: {
    roomId: string;
    canEdit: boolean;
    canRedact: boolean;
    canPin: boolean;
    canEndPoll: boolean;
    canHideMedia: boolean;
    isDecrypting: boolean;
    isUndecryptable: boolean;
    isRedacted: boolean;
    isPinned: boolean;
    devModeEnabled: boolean;
    t: TFunction;
    openContextMenu: ContextMenuController['openContextMenu'];
    callbacks: ContextMenuCallbacks;
  }
): void {
  if (isDecrypting || isUndecryptable || isRedacted) return;

  const baseItems = [
    {
      label: t('timeline.reply'),
      icon: createElement(ArrowBendUpLeftIcon, { size: 14 }),
      onClick: () => callbacks.onReply(event),
    },
    ...(callbacks.onThreadClick
      ? [
          {
            label: t('timeline.replyInThread'),
            icon: createElement(ChatDotsIcon, { size: 14 }),
            onClick: () => callbacks.onThreadClick!(event),
          },
        ]
      : []),
    {
      label: t('timeline.react'),
      icon: createElement(SmileyIcon, { size: 14 }),
      keepOpen: true,
      onClick: (menuEl?: HTMLElement | null) => callbacks.onReact(event, menuEl ?? undefined),
    },
    ...(canPin
      ? [
          {
            label: isPinned ? t('timeline.unpin') : t('timeline.pin'),
            icon: isPinned
              ? createElement(PushPinSlashIcon, { size: 14 })
              : createElement(PushPinIcon, { size: 14 }),
            onClick: callbacks.onPin,
          },
        ]
      : []),
    ...(canEdit && !isRedacted
      ? [
          {
            label: t('common.edit'),
            icon: createElement(PencilSimpleIcon, { size: 14 }),
            onClick: () => callbacks.onEdit(event),
          },
        ]
      : []),
    ...(canEndPoll && !isRedacted
      ? [
          {
            label: t('timeline.poll.end'),
            icon: createElement(XSquareIcon, { size: 14 }),
            onClick: () => callbacks.onEndPoll?.(event),
          },
        ]
      : []),
    ...(canHideMedia && !isRedacted
      ? [
          {
            label: t('timeline.hideMedia'),
            icon: createElement(EyeSlashIcon, { size: 14 }),
            onClick: callbacks.onHideMedia,
          },
        ]
      : []),
  ];

  const copyableText = entryText(event)?.body ?? null;
  const eventId = event.eventId;

  const middleItems = [
    ...(copyableText
      ? [
          {
            label: t('timeline.copyText'),
            icon: createElement(CopyIcon, { size: 14 }),
            onClick: () => {
              navigator.clipboard.writeText(copyableText).catch(() => {});
            },
          },
        ]
      : []),
    ...(roomId && eventId
      ? [
          {
            label: t('common.copyLink'),
            icon: createElement(LinkSimpleIcon, { size: 14 }),
            onClick: () => {
              navigator.clipboard.writeText(makeEventPermalink(roomId, eventId)).catch(() => {});
            },
          },
        ]
      : []),
    ...(callbacks.onForward && roomId && eventId
      ? [
          {
            label: t('timeline.forward'),
            icon: createElement(ArrowBendUpRightIcon, { size: 14 }),
            onClick: () => callbacks.onForward!(event),
          },
        ]
      : []),
    ...(callbacks.onEditHistory
      ? [
          {
            label: t('timeline.editHistory'),
            icon: createElement(ClockCounterClockwiseIcon, { size: 14 }),
            onClick: callbacks.onEditHistory,
          },
        ]
      : []),
    {
      label: t('timeline.report'),
      icon: createElement(FlagIcon, { size: 14 }),
      onClick: () => callbacks.onReport(event),
    },
    ...(devModeEnabled
      ? [
          {
            label: t('timeline.viewSource'),
            icon: createElement(CodeIcon, { size: 14 }),
            onClick: () => callbacks.onViewSource(event),
          },
        ]
      : []),
  ];

  const deleteItems =
    canRedact && !isRedacted
      ? [
          {
            label: t('common.delete'),
            icon: createElement(TrashIcon, { size: 14 }),
            danger: true,
            onClick: () => callbacks.onDelete(event),
          },
        ]
      : [];

  const divider = { label: '', divider: true as const, onClick: () => {} };

  const items = [
    ...baseItems,
    ...(middleItems.length > 0 ? [divider, ...middleItems] : []),
    ...(deleteItems.length > 0 ? [divider, ...deleteItems] : []),
  ];

  openContextMenu(e, items);
}
