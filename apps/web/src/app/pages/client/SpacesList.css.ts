import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { uiSize } from '@/theme/uiDensity';
import { fast } from '@/theme/animations.css';

export const spacesList = style({
  width: '64px',
  ...backdrop('primary'),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingBottom: 'var(--bottom-dock-inset, 72px)',
  gap: uiSize('spaceGap'),
  borderRight: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  height: '100%',
  '@media': {
    '(max-width: 768px)': { paddingTop: '12px' },
  },
});

export const spacesScrollArea = style({
  flex: 1,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  '::-webkit-scrollbar': {
    display: 'none',
  },
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: uiSize('spaceGap'),
  paddingTop: '2px',
  paddingBottom: '2px',
});

export const spacesStickyBottom = style({
  position: 'sticky',
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: uiSize('spaceGap'),
  width: '100%',
  ...backdrop('primary'),
});

export const spaceBarBtn = style({
  width: '40px',
  height: '40px',
  borderRadius: vars.radius.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  fontSize: '0.9rem',
  fontWeight: 700,
  transition: `background-color ${fast}, box-shadow ${fast}`,
  position: 'relative',
  flexShrink: 0,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  ':hover': {
    color: vars.color.textPrimary,
  },
});

// Inner button inside a sortable wrapper - visually transparent, just handles clicks
export const spaceBtnInner = style({
  width: '100%',
  height: '100%',
  border: 'none',
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  outline: 'none',
});

export const spaceBarBtnActive = style([
  spaceBarBtn,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': {
      backgroundColor: vars.color.accent,
      color: '#fff',
    },
  },
]);

export const spacesSeparator = style({
  width: '32px',
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
});

export const spaceBtnActive = style([
  spaceBarBtn,
  {
    ':hover': {
      color: vars.color.textMuted,
    },
  },
]);

export const spacePill = style({
  position: 'absolute',
  left: '-11px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '4px',
  height: '0',
  opacity: 0,
  borderRadius: '0 2px 2px 0',
  backgroundColor: vars.color.accent,
  transition: `height ${fast} ease, opacity ${fast} ease`,
  selectors: {
    [`${spaceBarBtn}:hover &`]: {
      height: '8px',
      opacity: 1,
    },
    [`${spaceBtnActive} &`]: {
      height: '32px',
      opacity: 1,
    },
    [`${spaceBtnActive}:hover &`]: {
      height: '32px',
      opacity: 1,
    },
    [`${spaceBarBtnActive} &`]: {
      height: '32px',
      opacity: 1,
    },
    [`${spaceBarBtnActive}:hover &`]: {
      height: '32px',
      opacity: 1,
    },
  },
});

export const spaceAvatarWrap = style({
  width: '100%',
  height: '100%',
  lineHeight: 0,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
});

export const callBadge = style({
  position: 'absolute',
  top: '0px',
  right: '0px',
  width: '18px',
  height: '18px',
  borderRadius: '8px',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.success,
  border: `1px solid ${vars.color.success}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
});

export const notifDot = style({
  position: 'absolute',
  bottom: '0px',
  right: '0px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  border: `2px solid ${vars.color.bgPrimary}`,
});

export const notifDotMention = style({
  position: 'absolute',
  bottom: '0px',
  right: '0px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: vars.color.mention,
  border: `2px solid ${vars.color.bgPrimary}`,
});

// Insertion-line indicator - dotted accent line between items
export const insertionLine = style({
  width: '32px',
  height: 0,
  borderTop: `2px dotted ${vars.color.accent}`,
  flexShrink: 0,
  margin: '2px 0',
});

export const spaceBtnDragOverlay = style({
  width: '40px',
  height: '40px',
  borderRadius: vars.radius.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  boxShadow: `0 6px 20px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)`,
  position: 'relative',
});
