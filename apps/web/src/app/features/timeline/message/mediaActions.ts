import type { MediaInfo, MediaSource, WizardClient } from '@wizardchat/core';
import { sniffMimeType } from '@/util/sniffMimeType';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
};

async function fetchMedia(client: WizardClient, media: MediaInfo) {
  const bytes = await client.media(media.source as MediaSource);
  const mime = (media.mimetype || sniffMimeType(bytes) || '').split(';')[0].trim().toLowerCase();
  return { bytes, mime };
}

export function mediaFileName(media: MediaInfo, mime: string): string {
  const base = (media.filename || '').replace(/[\\/]/g, '_').trim() || 'file';
  if (/\.[a-z0-9]{1,5}$/i.test(base)) return base;
  const ext = EXTENSIONS[mime];
  return ext ? `${base}.${ext}` : base;
}

export async function saveMedia(
  client: WizardClient,
  media: MediaInfo
): Promise<{ name: string; path: string | null } | null> {
  const { bytes, mime } = await fetchMedia(client, media);
  const name = mediaFileName(media, mime);
  const saveFile = window.desktopAPI?.saveFile;
  if (saveFile) {
    const path = await saveFile(bytes, name);
    return path ? { name, path } : null;
  }
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { name, path: null };
}

async function drawImage(client: WizardClient, media: MediaInfo) {
  const { bytes, mime } = await fetchMedia(client, media);
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('no 2d context');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { canvas, ctx };
}

export async function copyMediaImage(client: WizardClient, media: MediaInfo): Promise<void> {
  const nativeCopy = window.desktopAPI?.copyImage;
  if (nativeCopy) {
    const { canvas, ctx } = await drawImage(client, media);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await nativeCopy(new Uint8Array(data.buffer), canvas.width, canvas.height);
    return;
  }
  // A pending blob keeps the click's user activation, which Safari requires
  const png = drawImage(client, media).then(
    ({ canvas }) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))))
      )
  );
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
