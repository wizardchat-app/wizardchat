import type { RoomSection } from '@wizardchat/core';

export type { RoomSection };

export const HOME_SPACE = 'home-space';
export const ROOMS_ANCHOR = 'chats';
export const PEOPLE_ANCHOR = 'im.vector.fake.direct';

export function getRoomSectionTag(
  tags: readonly string[] | undefined,
  sections: RoomSection[]
): string | null {
  const known = new Set(sections.map((s) => s.tag));
  return tags?.find((tag) => known.has(tag)) ?? null;
}
