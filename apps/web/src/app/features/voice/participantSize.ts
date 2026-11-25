export const PARTICIPANT_SIZES = {
  avatar: 20,
  row: 24,
  gap: 1,
  padBottom: 3,
  compact: 30,
  compactAvatar: 20,
};

export function computeParticipantsBlockHeight(count: number, compact = false): number {
  if (count <= 0) return 0;
  const s = PARTICIPANT_SIZES;
  if (compact) return s.compact;
  return s.padBottom + count * s.row + Math.max(0, count - 1) * s.gap;
}
