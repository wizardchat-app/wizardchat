import { createContext, useContext } from 'react';
import type { EntryContent, MediaInfo, TimelineEntry } from '@wizardchat/core';

export type EventEntry = Extract<TimelineEntry, { kind: 'event' }>;
export type TextEntryContent = Extract<EntryContent, { type: 'text' | 'notice' | 'emote' }>;

export function isEventEntry(entry: TimelineEntry): entry is EventEntry {
  return entry.kind === 'event';
}

export function entryEventId(entry: EventEntry): string {
  return entry.eventId ?? entry.itemKey;
}

export function entryText(entry: EventEntry): TextEntryContent | null {
  const { content } = entry;
  return content.type === 'text' || content.type === 'notice' || content.type === 'emote'
    ? content
    : null;
}

export function entryMedia(entry: EventEntry): MediaInfo | null {
  const { content } = entry;
  switch (content.type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
    case 'sticker':
      return content.media;
    default:
      return null;
  }
}

export function entryBody(entry: EventEntry): string {
  const { content } = entry;
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

export function entryHtml(entry: EventEntry): string | null {
  return entryText(entry)?.html ?? null;
}

export function entryMsgtype(entry: EventEntry): string | null {
  switch (entry.content.type) {
    case 'text':
    case 'notice':
    case 'emote':
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
    case 'location':
      return `m.${entry.content.type}`;
    case 'verificationRequest':
      return 'm.key.verification.request';
    default:
      return null;
  }
}

export const TimelineEntriesContext = createContext<ReadonlyMap<string, EventEntry>>(new Map());

export function useTimelineEntry(eventId: string | null | undefined): EventEntry | null {
  const entries = useContext(TimelineEntriesContext);
  return (eventId && entries.get(eventId)) || null;
}
