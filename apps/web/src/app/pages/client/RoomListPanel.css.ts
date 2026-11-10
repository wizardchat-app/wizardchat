import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { TOUCH_UI } from '@/theme/uiDensity';
import { fast } from '@/theme/animations.css';

export const roomListPanel = style({
  width: '240px',
  backgroundColor: vars.color.bgPrimary,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  borderRight: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  '@media': {
    '(max-width: 768px)': { width: 'auto', flex: 1, minWidth: 0, borderRight: 'none' },
  },
});

export const roomHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 12px 8px',
  fontWeight: 700,
  fontSize: '1rem',
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: { [`${TOUCH_UI} &`]: { fontSize: '1.2rem' } },
});

export const roomHeaderTitle = style({
  fontSize: 'inherit',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const roomHeaderLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const roomHeaderActions = style({
  display: 'flex',
  gap: '4px',
});

export const roomList = style({
  flex: 1,
  overflowY: 'auto',
  padding: '2px 0',
  position: 'relative',
});

export const overviewNav = style({
  padding: '6px 0 2px',
});

export const overviewItem = style({
  width: 'calc(100% - 8px)',
  border: 'none',
  background: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
});

export const overviewIcon = style({
  backgroundColor: vars.color.bgTertiary,
});

export const emptyList = style({
  padding: '16px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  textAlign: 'center',
});

const skeletonPulseKeyframes = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

const skeletonPulse = style({
  animation: `${skeletonPulseKeyframes} 1.4s ease-in-out infinite`,
});

export const skeletonList = style({
  padding: '2px 8px',
});

export const skeletonRow = style([
  skeletonPulse,
  {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 4px',
  },
]);

export const skeletonAvatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonLines = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const skeletonLine = style({
  height: '8px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  width: '100%',
});

export const skeletonLineShort = style({
  height: '8px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  width: '60%',
});

export const subspaceCategoryHeader = style({
  display: 'flex',
  alignItems: 'center',
  padding: '1px 8px 1px 4px',
  marginTop: '2px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  userSelect: 'none',
  width: '100%',
  background: 'none',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    [`${TOUCH_UI} &`]: { fontSize: '0.95rem' },
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const subspaceToggle = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: 0,
  background: 'none',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  userSelect: 'none',
  selectors: {
    '&:focus-visible': {
      outline: `1px solid ${vars.color.accent}`,
      outlineOffset: '1px',
      borderRadius: vars.radius.sm,
    },
  },
});

export const subspaceChevron = style({
  flexShrink: 0,
  transition: 'transform 0.15s ease',
  opacity: 0.7,
});

export const subspaceChevronClosed = style({
  transform: 'rotate(-90deg)',
});

export const subspaceName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
});

export const subspaceSpacer = style({
  flex: 1,
});

export const subspaceUnreadDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  flexShrink: 0,
  transition: `opacity ${fast}, width ${fast}`,
  selectors: {
    [`${subspaceCategoryHeader}:hover &`]: {
      opacity: 0,
      width: '0px',
    },
  },
});

export const subspaceUnreadDotMention = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.mention,
  flexShrink: 0,
  transition: `opacity ${fast}, width ${fast}`,
  selectors: {
    [`${subspaceCategoryHeader}:hover &`]: {
      opacity: 0,
      width: '0px',
    },
  },
});

export const subspaceAddButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '0px',
  height: '18px',
  padding: 0,
  flexShrink: 0,
  overflow: 'hidden',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: vars.color.textMuted,
  opacity: 0,
  pointerEvents: 'none',
  transition: `color ${fast}, opacity ${fast}, width ${fast}, margin-left ${fast}`,
  selectors: {
    [`${subspaceCategoryHeader}:hover &`]: {
      width: '18px',
      marginLeft: '6px',
      opacity: '1',
      pointerEvents: 'auto',
    },
    '&:hover': {
      color: vars.color.textPrimary,
    },
    '&:focus-visible': {
      width: '18px',
      marginLeft: '6px',
      opacity: '1',
      pointerEvents: 'auto',
      outline: `1px solid ${vars.color.accent}`,
      outlineOffset: '1px',
      borderRadius: vars.radius.sm,
      color: vars.color.textPrimary,
    },
  },
  '@media': {
    '(pointer: coarse)': {
      width: '18px',
      marginLeft: '6px',
      opacity: '1',
      pointerEvents: 'auto',
    },
  },
});

export const bottomDock = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  margin: '8px',
  marginLeft: '-56px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  '@media': {
    '(max-width: 768px)': {
      selectors: { '&:empty': { display: 'none' } },
    },
  },
});
