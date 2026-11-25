export const ROOM_PACK_STABLE = 'm.room.image_pack';
export const ROOM_PACK_UNSTABLE = 'im.ponies.room_emotes';
export const EMOTE_ROOMS_STABLE = 'm.image_pack.rooms';
export const EMOTE_ROOMS_UNSTABLE = 'im.ponies.emote_rooms';

export const USER_PACK = 'im.ponies.user_emotes';

export const ROOM_PACK_TYPES = [ROOM_PACK_UNSTABLE, ROOM_PACK_STABLE] as const;

export interface PackImage {
  url: string;
  usage?: string[];
  body?: string;
  mimetype?: string;
  info?: Record<string, unknown>;
}

export function mergePackImages(...contents: (Record<string, unknown> | undefined)[]): PackImage[] {
  const merged = new Map<string, PackImage>();
  for (const content of contents) {
    const images = content?.images as Record<string, PackImage> | undefined;
    if (!images || typeof images !== 'object') continue;
    for (const [shortcode, img] of Object.entries(images)) {
      if (!img?.url || merged.has(shortcode)) continue;
      merged.set(shortcode, img);
    }
  }
  return Array.from(merged.values());
}

export function parsePackInfo(content: Record<string, unknown> | undefined): {
  displayName?: string;
  usage?: string[];
  avatarUrl?: string;
  attribution?: string;
} {
  const pack = content?.pack as Record<string, unknown> | undefined;
  if (!pack) return {};
  return {
    displayName: typeof pack.display_name === 'string' ? pack.display_name : undefined,
    usage: Array.isArray(pack.usage) ? (pack.usage as string[]) : undefined,
    avatarUrl: typeof pack.avatar_url === 'string' ? pack.avatar_url : undefined,
    attribution: typeof pack.attribution === 'string' ? pack.attribution : undefined,
  };
}

export function mergePackInfo(...contents: (Record<string, unknown> | undefined)[]): {
  displayName?: string;
  usage?: string[];
  avatarUrl?: string;
  attribution?: string;
} {
  const merged: ReturnType<typeof parsePackInfo> = {};
  for (const content of contents) {
    const info = parsePackInfo(content);
    merged.displayName ??= info.displayName;
    merged.usage ??= info.usage;
    merged.avatarUrl ??= info.avatarUrl;
    merged.attribution ??= info.attribution;
  }
  return merged;
}

export function mergePackImageMap(
  ...contents: (Record<string, unknown> | undefined)[]
): Record<string, PackImage> {
  const merged: Record<string, PackImage> = {};
  for (const content of contents) {
    const images = content?.images as Record<string, PackImage> | undefined;
    if (!images || typeof images !== 'object') continue;
    for (const [shortcode, img] of Object.entries(images)) {
      if (!img?.url || shortcode in merged) continue;
      merged[shortcode] = img;
    }
  }
  return merged;
}

export function isMxcUrl(url: string): boolean {
  return url.startsWith('mxc://');
}
