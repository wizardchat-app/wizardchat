import { useSyncExternalStore } from 'react';
import type { JsonValue, RoomTimeline, UploadedThumbnail } from '@wizardchat/core';
import { getMediaDetails, type MediaDetails } from '../encryptedMedia';
import { prepareMediaFile, type MediaOptions } from './mediaProcessing';

export type AttachmentUploadStatus = 'uploading' | 'done' | 'error';

export interface AttachmentUploadState {
  status: AttachmentUploadStatus;
  progress: number;
}

export interface PreparedAttachment extends Omit<MediaDetails, 'thumbnail'> {
  source: JsonValue;
  size: number;
  filename: string;
  mimetype: string;
  thumbnail: UploadedThumbnail | null;
}

interface UploadEntry extends AttachmentUploadState {
  promise: Promise<PreparedAttachment>;
  controller: AbortController;
}

const entries = new Map<string, UploadEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(id: string): void {
  listeners.get(id)?.forEach((listener) => listener());
}

export function subscribeAttachmentUpload(id: string, listener: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
  };
}

export function getAttachmentUpload(id: string): AttachmentUploadState | undefined {
  return entries.get(id);
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (dims.width > 0 && dims.height > 0) return dims;
  } catch {
    // Not every image format decodes via createImageBitmap
  }
  return null;
}

function readFile(file: File, signal: AbortSignal) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal.addEventListener('abort', () => reader.abort());
    reader.readAsArrayBuffer(file);
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
}

async function prepareAttachment(
  original: File,
  getTimeline: () => Promise<RoomTimeline>,
  options: MediaOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<PreparedAttachment> {
  const file = await prepareMediaFile(original, options);
  throwIfAborted(signal);
  const [bytes, dims, details, timeline] = await Promise.all([
    readFile(file, signal),
    imageDimensions(file),
    getMediaDetails(file),
    getTimeline(),
  ]);
  throwIfAborted(signal);
  const mimetype = file.type || 'application/octet-stream';
  const source = await timeline.uploadFile(bytes, mimetype, (p) => {
    if (p.total > 0) onProgress(p.current / p.total);
  });
  throwIfAborted(signal);
  let thumbnail: UploadedThumbnail | null = null;
  if (details.thumbnail) {
    const thumb = details.thumbnail;
    thumbnail = {
      source: await timeline.uploadFile(thumb.data, thumb.mimetype, () => {}),
      mimetype: thumb.mimetype,
      width: thumb.width,
      height: thumb.height,
      size: thumb.data.byteLength,
    };
    throwIfAborted(signal);
  }
  return {
    ...details,
    ...(dims ?? {}),
    source,
    size: bytes.byteLength,
    filename: file.name,
    mimetype,
    thumbnail,
  };
}

export function startAttachmentUpload(
  id: string,
  file: File,
  getTimeline: () => Promise<RoomTimeline>,
  options: MediaOptions
): Promise<PreparedAttachment> {
  const existing = entries.get(id);
  if (existing && existing.status !== 'error') return existing.promise;

  const controller = new AbortController();
  const entry: UploadEntry = {
    status: 'uploading',
    progress: 0,
    controller,
    promise: Promise.resolve() as unknown as Promise<PreparedAttachment>,
  };
  entry.promise = prepareAttachment(
    file,
    getTimeline,
    options,
    (progress) => {
      const current = entries.get(id);
      if (!current || current.controller !== controller) return;
      entries.set(id, { ...current, progress });
      notify(id);
    },
    controller.signal
  ).then(
    (result) => {
      const current = entries.get(id);
      if (current?.controller === controller) {
        entries.set(id, { ...current, status: 'done', progress: 1 });
        notify(id);
      }
      return result;
    },
    (err: unknown) => {
      const current = entries.get(id);
      if (current?.controller === controller && !controller.signal.aborted) {
        entries.set(id, { ...current, status: 'error' });
        notify(id);
      }
      throw err;
    }
  );
  entry.promise.catch(() => {});
  entries.set(id, entry);
  notify(id);
  return entry.promise;
}

export function cancelAttachmentUpload(id: string): void {
  entries.get(id)?.controller.abort();
  entries.delete(id);
  notify(id);
}

export function forgetAttachmentUpload(id: string): void {
  entries.delete(id);
}

export function useAttachmentUpload(id: string): AttachmentUploadState | undefined {
  return useSyncExternalStore(
    (listener) => subscribeAttachmentUpload(id, listener),
    () => entries.get(id)
  );
}
