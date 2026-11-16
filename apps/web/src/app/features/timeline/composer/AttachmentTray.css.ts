import { keyframes, globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const TILE_WIDTH = 176;
const THUMB_HEIGHT = 120;

export const tray = style({
  display: 'flex',
  gap: '10px',
  padding: '12px 20px 10px 12px',
  overflowX: 'auto',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const tile = style({
  position: 'relative',
  flexShrink: 0,
  width: `${TILE_WIDTH}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '6px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
});

export const tileOversized = style([tile, { borderColor: vars.color.error }]);

export const thumb = style({
  position: 'relative',
  width: '100%',
  height: `${THUMB_HEIGHT}px`,
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textMuted,
  border: 'none',
  padding: 0,
});

export const thumbButton = style([thumb, { cursor: 'zoom-in' }]);

export const thumbMedia = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  transition: `filter ${fast}`,
});

export const thumbMediaSpoiler = style([thumbMedia, { filter: 'blur(14px)' }]);

export const spoilerChip = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '3px 10px',
  borderRadius: '999px',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  pointerEvents: 'none',
});

export const fileExt = style({
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const fileIcon = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
});

export const meta = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: 0,
  padding: '0 2px',
});

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const name = style({ ...ellipsis, fontSize: '0.82rem', color: vars.color.textPrimary });

export const detail = style({ ...ellipsis, fontSize: '0.72rem', color: vars.color.textMuted });

export const detailError = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '4px',
  fontSize: '0.72rem',
  lineHeight: 1.35,
  color: vars.color.error,
});

export const detailErrorIcon = style({
  flexShrink: 0,
  marginTop: '1px',
});

export const progressTrack = style({
  height: '3px',
  marginTop: '3px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  overflow: 'hidden',
});

export const progressFill = style({
  height: '100%',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  transition: `width ${fast} linear`,
});

// Browsers don't report upload progress to the core, so until a real number arrives the bar just moves
const indeterminateSlide = keyframes({
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(250%)' },
});

export const progressIndeterminate = style({
  width: '40%',
  height: '100%',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  animation: `${indeterminateSlide} 1.2s ease-in-out infinite`,
});

export const caption = style({
  ...ellipsis,
  fontSize: '0.75rem',
  color: vars.color.textSecondary,
  fontStyle: 'italic',
});

export const actions = style({
  position: 'absolute',
  top: '-10px',
  right: '-14px',
  zIndex: 1,
  display: 'flex',
  gap: '2px',
  padding: '2px 3px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: {
    [`${tile}:hover &, ${tile}:has(:focus-visible) &, ${tileOversized}:hover &, ${tileOversized}:has(:focus-visible) &`]:
      { opacity: 1 },
  },
  '@media': {
    '(hover: none)': { opacity: 1 },
  },
});

export const actionBtn = style({
  width: '26px',
  height: '26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const actionBtnActive = style([actionBtn, { color: vars.color.accent }]);

export const actionBtnDanger = style([
  actionBtn,
  {
    color: vars.color.error,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.error },
  },
]);

export const editPreview = style({
  position: 'relative',
  alignSelf: 'flex-start',
  display: 'inline-flex',
  maxWidth: '100%',
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
});

globalStyle(`${editPreview} img, ${editPreview} video`, {
  display: 'block',
  width: 'auto',
  height: 'auto',
  maxWidth: '100%',
  maxHeight: '320px',
});

globalStyle(`${editPreview} ${fileIcon}`, {
  color: vars.color.textMuted,
});

globalStyle(`${editPreview} ${fileExt}`, { fontSize: '0.9rem' });

export const editBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
});
