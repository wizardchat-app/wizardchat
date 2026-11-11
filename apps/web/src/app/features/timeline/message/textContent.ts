import type { MediaInfo } from '@wizardchat/core';
import { markdownToHtml, plainTextToHtml } from '@/util/markdownToHtml';
import {
  entryBody,
  entryEventId,
  entryHtml,
  entryMedia,
  entryText,
  type EventEntry,
} from './entry';

export interface ReplyContent {
  eventId: string;
  body: string;
  formattedBody?: string;
  senderId: string;
  senderName?: string | null;
  mxcUrl?: string;
  event?: EventEntry;
  isUndecryptable: boolean;
}

export function extractReplyMxcUrl(event: EventEntry): string | undefined {
  if (event.content.type === 'sticker') {
    const source = event.content.media.source;
    return 'url' in source && typeof source.url === 'string' ? source.url : undefined;
  }
  const formattedBody = entryHtml(event);
  if (formattedBody) {
    const match = formattedBody.match(/<img[^>]+data-mx-emoticon[^>]+src="([^"]+)"/);
    if (match) return match[1];
  }
  return undefined;
}

const CAPTION_MSGTYPES = new Set(['m.image', 'm.video', 'm.audio', 'm.file']);

export function isCaptionMsgtype(msgtype: string): boolean {
  return CAPTION_MSGTYPES.has(msgtype);
}

export function isCaptionEditable(event: EventEntry): boolean {
  const { type } = event.content;
  if (type !== 'image' && type !== 'video' && type !== 'audio' && type !== 'file') return false;
  return !event.content.media.voice;
}

export function isEditableEvent(event: EventEntry): boolean {
  return entryText(event) !== null || isCaptionEditable(event);
}

export function editableBody(event: EventEntry): string {
  const text = entryText(event);
  if (text) return text.body;
  const media = entryMedia(event);
  return media ? (getMediaCaption(media) ?? '') : '';
}

export function stripReplyFallback(body: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => {
    const trimmed = l.trim();
    return trimmed !== '' && !trimmed.startsWith('>');
  });
  if (start === -1) return '';
  return lines.slice(start).join('\n').replace(/^\s+/, '').trimEnd();
}

export function stripReplyFallbackHtml(formattedBody: string): string {
  return formattedBody
    .replace(/<mx-reply>[\s\S]*?<\/mx-reply>/g, '')
    .replace(/^\s+/, '')
    .trimEnd();
}

export function buildReplyContent(targetEvent: EventEntry): ReplyContent | null {
  if (targetEvent.content.type === 'unableToDecrypt') {
    return {
      eventId: entryEventId(targetEvent),
      body: '',
      senderId: targetEvent.sender,
      senderName: targetEvent.senderName,
      isUndecryptable: true,
    };
  }
  return {
    eventId: entryEventId(targetEvent),
    body: stripReplyFallback(entryBody(targetEvent)),
    formattedBody: stripReplyFallbackHtml(entryHtml(targetEvent) ?? '') || undefined,
    senderId: targetEvent.sender,
    senderName: targetEvent.senderName,
    mxcUrl: extractReplyMxcUrl(targetEvent),
    event: targetEvent,
    isUndecryptable: false,
  };
}

export function textRenderContent(body: string, html: string | null): Record<string, unknown> {
  return html ? { body, format: 'org.matrix.custom.html', formatted_body: html } : { body };
}

const EMOJI_PRESENTATION = /^[\p{Emoji_Presentation}\p{Emoji_Modifier}]$/u;
const EMOJI = /^\p{Emoji}$/u;
const JOINERS = new Set([0x200d, 0xfe0f, 0x20e3]);

function isEmojiText(text: string): boolean {
  const chars = [...text];
  return chars.every((ch, i) => {
    const point = ch.codePointAt(0) ?? 0;
    if (/\s/.test(ch) || JOINERS.has(point) || (point >= 0xe0020 && point <= 0xe007f)) return true;
    if (EMOJI_PRESENTATION.test(ch)) return true;
    const next = chars[i + 1]?.codePointAt(0);
    return EMOJI.test(ch) && (next === 0xfe0f || next === 0x20e3);
  });
}

export function isRenderedEmojiOnly(html: string): boolean {
  const div = document.createElement('div');
  div.innerHTML = html;
  let hasContent = false;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? '';
    if (text.trim().length > 0) hasContent = true;
    if (!isEmojiText(text)) return false;
  }
  if (!hasContent) hasContent = div.querySelector('img') !== null;
  return hasContent;
}

export function renderTextContent(
  content: Record<string, unknown>,
  myUserId?: string,
  prettifyLinks = false,
  allowedImgOrigins?: ReadonlySet<string>
): string {
  const format = content.format as string | undefined;
  const formattedBody = content.formatted_body as string | undefined;
  if (format === 'org.matrix.custom.html' && formattedBody) {
    if (/<[a-z]/i.test(formattedBody)) {
      const clean = stripReplyFallbackHtml(formattedBody);
      return markdownToHtml(clean, myUserId, true, prettifyLinks, true, allowedImgOrigins);
    }
  }
  const body = (content.body as string) ?? '';
  return plainTextToHtml(stripReplyFallback(body), myUserId, true, prettifyLinks);
}

export function getMediaCaption(media: MediaInfo): string | undefined {
  const caption = media.caption ?? '';
  if (!caption.trim()) return undefined;
  if (caption === media.filename) return undefined;
  return caption;
}
