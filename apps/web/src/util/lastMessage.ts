import type { TFunction } from 'i18next';
import type { RoomSummary } from '@wizardchat/core';
import { formatUserId } from '@/util/matrix';

export function lastMessagePreview(
  room: RoomSummary,
  myUserId: string | null | undefined,
  t: TFunction
): string | null {
  const last = room.lastMessage;
  if (!last) return null;
  const text = (() => {
    switch (last.kind) {
      case 'text':
        return last.body;
      case 'emote':
        return `* ${last.body}`;
      case 'poll':
        return t('nav.preview.poll', { question: last.body });
      case 'image':
      case 'video':
      case 'audio':
      case 'voice':
      case 'file':
      case 'sticker':
      case 'location':
        return t(`nav.preview.${last.kind}`);
      default:
        return last.body;
    }
  })();
  if (!text) return null;
  if (last.sender === myUserId || room.isDirect) return text;
  return `${last.senderName ?? formatUserId(last.sender)}: ${text}`;
}
