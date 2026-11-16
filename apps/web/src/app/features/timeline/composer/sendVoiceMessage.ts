import type { RoomTimeline } from '@wizardchat/core';
import { cacheOwnUpload } from '../message/mediaCache';
import type { ReplyTarget } from './sendMessageContent';
import { VOICE_MIMETYPE } from './useVoiceRecorder';

const VOICE_FILENAME = 'Voice message.ogg';
const VOICE_BODY = 'Voice message';

interface SendVoiceMessageOptions {
  timeline: RoomTimeline;
  replyTo?: ReplyTarget | null;
  myId?: string;
  durationMs: number;
  waveform: number[];
}

export async function sendVoiceMessage(
  blob: Blob,
  { timeline, replyTo, durationMs, waveform }: SendVoiceMessageOptions
): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const source = await timeline.uploadFile(bytes, VOICE_MIMETYPE, () => {});

  // The sender's own message plays at once instead of downloading what was just recorded
  cacheOwnUpload(source, blob, VOICE_MIMETYPE);

  await timeline.sendUploaded({
    source,
    size: bytes.byteLength,
    filename: VOICE_FILENAME,
    mimetype: VOICE_MIMETYPE,
    caption: VOICE_BODY,
    voice: true,
    durationMs: Math.max(0, Math.round(durationMs)),
    waveform: Array.isArray(waveform)
      ? waveform.map((v) => Math.max(0, Math.min(1024, Math.round(v))))
      : [],
    replyTo: replyTo?.eventId ?? null,
  });
}
