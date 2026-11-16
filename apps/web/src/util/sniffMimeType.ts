function startsWith(bytes: Uint8Array, prefix: string, offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

// Mirrors the core's sniff_mime_type, without a round trip through the core per load
export function sniffMimeType(bytes: Uint8Array): string | null {
  const at = (offset: number, tag: string) => startsWith(bytes, tag, offset);
  if (at(0, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (at(0, '\xff\xd8\xff')) return 'image/jpeg';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav';
  if (at(4, 'ftyp')) {
    if (at(8, 'avif') || at(8, 'avis')) return 'image/avif';
    if (at(8, 'heic') || at(8, 'heix') || at(8, 'mif1') || at(8, 'msf1')) return 'image/heic';
    if (at(8, 'M4A ') || at(8, 'M4B ')) return 'audio/mp4';
    if (at(8, 'qt  ')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (at(0, '\x1a\x45\xdf\xa3')) return 'video/webm';
  if (at(0, 'OggS')) return 'audio/ogg';
  if (at(0, 'ID3') || at(0, '\xff\xfb') || at(0, '\xff\xf3') || at(0, '\xff\xf2')) {
    return 'audio/mpeg';
  }
  if (at(0, 'fLaC')) return 'audio/flac';
  if (at(0, 'BM')) return 'image/bmp';
  if (at(0, '\x00\x00\x01\x00')) return 'image/x-icon';
  if (at(0, '%PDF-')) return 'application/pdf';
  return null;
}
