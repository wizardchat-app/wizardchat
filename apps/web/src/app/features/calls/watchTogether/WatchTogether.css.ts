import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const player = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  backgroundColor: '#000',
});

export const playerCompact = style([player, { borderRadius: vars.radius.sm }]);

export const playerHost = style({
  position: 'absolute',
  inset: 0,
});

globalStyle(`${playerHost} iframe`, {
  display: 'block',
  width: '100%',
  height: '100%',
  border: 0,
});

export const playerError = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  textAlign: 'center',
  color: '#fff',
  fontSize: '0.9rem',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
});

export const playerWaiting = style({
  position: 'absolute',
  left: '50%',
  bottom: '16px',
  transform: 'translateX(-50%)',
  padding: '6px 12px',
  borderRadius: '999px',
  color: '#fff',
  fontSize: '0.85rem',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
});

export const playerBar = style({
  position: 'absolute',
  top: '50%',
  left: '8px',
  right: '8px',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  pointerEvents: 'none',
});

export const playerTop = style({
  position: 'absolute',
  top: '8px',
  left: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: 'calc(100% - 60px)',
});

export const viewersChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  gap: '4px',
  padding: '0 7px',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#ffffff',
  fontSize: '0.68rem',
  fontWeight: 700,
  lineHeight: '20px',
  fontVariantNumeric: 'tabular-nums',
  userSelect: 'none',
  pointerEvents: 'auto',
});

export const playerLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  minWidth: 0,
  padding: '0 8px',
  borderRadius: '999px',
  background: '#593695',
  color: '#ffffff',
  fontSize: '0.72rem',
  fontWeight: 700,
  lineHeight: '20px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  userSelect: 'none',
  pointerEvents: 'none',
});

const playerButtonBase = {
  pointerEvents: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  border: 'none',
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  cursor: 'pointer',
} as const;

export const playerButton = style({
  ...playerButtonBase,
  ':hover': { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
});

export const playerStop = style({
  ...playerButtonBase,
  ':hover': { backgroundColor: vars.color.error },
});

export const dialogBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const dialogNote = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  lineHeight: 1.45,
});

export const invite = style([
  player,
  {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '24px',
    textAlign: 'center',
    color: '#fff',
    background: 'linear-gradient(160deg, #1b1b22, #0b0b0f)',
  },
]);

export const inviteCompact = style([invite, { gap: '8px', padding: '10px' }]);

export const inviteIcon = style({ color: '#ff3d3d' });

export const inviteTitle = style({
  fontSize: '0.95rem',
  fontWeight: 600,
});

export const inviteBody = style({
  maxWidth: '360px',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  color: 'rgba(255, 255, 255, 0.72)',
});

export const inviteActions = style({
  display: 'flex',
  gap: '8px',
});

const inviteButton = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: vars.radius.sm,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
} as const;

export const invitePrimary = style({
  ...inviteButton,
  backgroundColor: vars.color.accent,
  color: '#fff',
  ':hover': { backgroundColor: vars.color.accentHover },
});

export const inviteSecondary = style({
  ...inviteButton,
  backgroundColor: 'rgba(255, 255, 255, 0.12)',
  color: '#fff',
  ':hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
});

export const inviteLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.8rem',
  color: 'rgba(255, 255, 255, 0.72)',
  textDecoration: 'none',
  ':hover': { color: '#fff', textDecoration: 'underline' },
});

export const playerButtons = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  pointerEvents: 'auto',
});

export const slot = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: vars.radius.md,
  backgroundColor: '#000',
});

export const layer = style({
  position: 'absolute',
  overflow: 'hidden',
  borderRadius: vars.radius.md,
});

export const layerSelect = style({
  position: 'absolute',
  inset: 0,
  border: 'none',
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
});
