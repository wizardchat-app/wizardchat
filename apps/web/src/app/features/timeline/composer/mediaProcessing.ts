import { mayBeAnimated, probeIsAnimated } from '../utils/imageAnimation';

export interface MediaOptions {
  stripPhotoMetadata: boolean;
  compressImages: boolean;
}

const MAX_IMAGE_SIDE = 2560;
const IMAGE_QUALITY = 0.85;

export async function prepareMediaFile(file: File, options: MediaOptions): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    if (options.compressImages) {
      const compressed = await compressImage(file);
      if (compressed) return compressed;
    }
    return options.stripPhotoMetadata ? await stripImageMetadata(file) : file;
  } catch {
    return file;
  }
}

async function compressImage(file: File): Promise<File | null> {
  const type = file.type;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type)) {
    return null;
  }
  if (mayBeAnimated(type) && (await probeIsAnimated(type, file))) return null;
  if (typeof createImageBitmap !== 'function') return null;

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const target = type === 'image/png' || type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await encode(bitmap, width, height, target);
    if (!blob || blob.type !== target || blob.size >= file.size) return null;
    return new File([blob], renameExtension(file.name, target), {
      type: target,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality: IMAGE_QUALITY });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY));
}

function renameExtension(name: string, type: string): string {
  const extension = type === 'image/webp' ? 'webp' : 'jpg';
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

async function stripImageMetadata(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let stripped: Uint8Array | null = null;
  if (file.type === 'image/jpeg') stripped = stripJpeg(bytes);
  else if (file.type === 'image/png') stripped = stripPng(bytes);
  else if (file.type === 'image/webp') stripped = stripWebp(bytes);
  if (!stripped || stripped.byteLength === bytes.byteLength) return file;
  return new File([stripped as BlobPart], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      if (orientation !== 1)
        parts.splice(parts[1]?.[1] === 0xe0 ? 2 : 1, 0, exifWithOrientation(orientation));
      parts.push(bytes.subarray(offset));
      return concat(parts);
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.byteLength) return null;
    const segment = bytes.subarray(offset, end);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1 && ascii(bytes, offset + 4, 6) === 'Exif\0\0') {
      orientation = readOrientation(bytes.subarray(offset + 10, end)) ?? orientation;
    }
    const keep =
      (!isApp && marker !== 0xfe) ||
      marker === 0xe0 ||
      marker === 0xee ||
      (marker === 0xe2 && ascii(bytes, offset + 4, 11) === 'ICC_PROFILE');
    if (keep) parts.push(segment);
    offset = end;
  }
  return null;
}

function readOrientation(tiff: Uint8Array): number | null {
  if (tiff.byteLength < 8) return null;
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.byteLength) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.byteLength) return null;
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
  }
  return null;
}

function exifWithOrientation(orientation: number): Uint8Array {
  const body = new Uint8Array(32);
  const view = new DataView(body.buffer);
  body.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  body.set([0x4d, 0x4d, 0x00, 0x2a], 6);
  view.setUint32(10, 8);
  view.setUint16(14, 1);
  view.setUint16(16, 0x0112);
  view.setUint16(18, 3);
  view.setUint32(20, 1);
  view.setUint16(24, orientation);
  view.setUint32(28, 0);
  const segment = new Uint8Array(4 + body.byteLength);
  segment.set([0xff, 0xe1, (body.byteLength + 2) >> 8, (body.byteLength + 2) & 0xff]);
  segment.set(body, 4);
  return segment;
}

const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (ascii(bytes, 1, 3) !== 'PNG') return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const end = offset + 12 + view.getUint32(offset);
    if (end > bytes.byteLength) return null;
    const type = ascii(bytes, offset + 4, 4);
    if (!PNG_METADATA.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.byteLength + 1) return null;
    const type = ascii(bytes, offset, 4);
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = bytes.slice(offset, Math.min(end, bytes.byteLength));
      if (type === 'VP8X') chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.byteLength + 4, true);
  return concat([header, body]);
}
