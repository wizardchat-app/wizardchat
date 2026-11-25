import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { PARTICIPANT_SIZES } from './participantSize';

const desktop = PARTICIPANT_SIZES;
const px = (n: number) => `${n}px`;

export const wrap = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `0 8px ${px(desktop.padBottom)} 36px`,
  gap: px(desktop.gap),
  overflow: 'hidden',
});

const entryBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: `${px((desktop.row - desktop.avatar) / 2)} 6px ${px((desktop.row - desktop.avatar) / 2)} 4px`,
  borderRadius: vars.radius.sm,
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  cursor: 'default',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const entry = entryBase;

export const entrySpeaking = style([entryBase, { color: vars.color.textPrimary }]);

const ringBase = style({
  width: px(desktop.avatar),
  height: px(desktop.avatar),
  borderRadius: '50%',
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6rem',
  fontWeight: 700,
});

export const avatarRing = ringBase;

export const avatarRingSpeaking = style([
  ringBase,
  {
    outline: `2px solid ${vars.color.success}`,
  },
]);

export const name = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.82rem',
});

export const icons = style({
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  flexShrink: 0,
  marginLeft: 'auto',
});

const iconBase = style({
  fontSize: '0.68rem',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const iconMicMuted = style([iconBase, { color: vars.color.error }]);

export const iconCamera = style([iconBase, { color: vars.color.success }]);

export const livePill = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 5px',
  borderRadius: '999px',
  background: '#593695',
  color: '#ffffff',
  fontSize: '0.56rem',
  fontWeight: 700,
  lineHeight: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  userSelect: 'none',
});

export const compactWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: px(desktop.compact),
  padding: `0 8px ${px(desktop.compact - desktop.compactAvatar - 6)} 40px`,
  boxSizing: 'border-box',
});

const compactAvatarBase = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'none',
  cursor: 'pointer',
});

export const compactAvatar = compactAvatarBase;

export const compactAvatarSpeaking = style([
  compactAvatarBase,
  { outline: `2px solid ${vars.color.success}` },
]);

export const compactMore = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});
