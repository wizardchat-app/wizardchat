import { style, keyframes } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const ROOM_HEADER_HEIGHT = 49;

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 16px',
  height: `${ROOM_HEADER_HEIGHT}px`,
  flexShrink: 0,
  ...backdrop('secondary'),
  borderBottom: `1px solid ${vars.color.border}`,
  zIndex: 10,
});

export const nameContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  '@media': {
    '(max-width: 768px)': {
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: '0px',
    },
  },
});

export const nameRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  '@media': {
    '(max-width: 768px)': {
      width: '100%',
    },
  },
});

export const roomIcon = style({
  color: vars.color.textMuted,
  flexShrink: 0,
  '@media': {
    '(max-width: 768px)': {
      display: 'none',
    },
  },
});

export const roomName = style({
  fontWeight: 700,
  fontSize: '1rem',
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const topicDivider = style({
  width: '3px',
  height: '3px',
  borderRadius: '50%',
  backgroundColor: vars.color.textMuted,
  flexShrink: 0,
  opacity: 0.5,
  '@media': {
    '(max-width: 768px)': {
      display: 'none',
    },
  },
});

export const topicTrigger = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  padding: '2px 4px',
  margin: '0 -4px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  transition: `color ${fast}, text-decoration-color ${fast}`,
  ':hover': {
    textDecoration: 'underline',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '1px',
  },
  '@media': {
    '(max-width: 768px)': {
      flex: 'initial',
      width: '100%',
      fontSize: '0.75rem',
      padding: '0 4px',
    },
  },
});

export const headerDivider = style({
  width: '1px',
  height: '20px',
  backgroundColor: vars.color.border,
  margin: '0 4px',
});

export const headerPanelButtons = style({
  display: 'flex',
  alignItems: 'center',
});

export const hideOnMobile = style({
  '@media': {
    '(max-width: 768px)': {
      display: 'none',
    },
  },
});

export const desktopOnly = style({
  display: 'contents',
  '@media': {
    '(max-width: 768px)': {
      display: 'none',
    },
  },
});

export const headerBtn = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':disabled': {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const headerBtnAnchor = style({
  display: 'flex',
  flexShrink: 0,
});

export const headerBtnActive = style([
  headerBtn,
  {
    color: vars.color.accent,
    selectors: {
      '&&:hover:not(:disabled)': {
        backgroundColor: vars.color.bgHover,
        color: vars.color.accent,
      },
    },
  },
]);

export const headerThreadIconWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const headerThreadDot = style({
  position: 'absolute',
  bottom: '-2px',
  right: '-2px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 0 2px ${vars.color.bgSecondary}`,
  pointerEvents: 'none',
});

export const searchBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 16px',
  backgroundColor: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

const slideDown = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const topicPanel = style({
  position: 'absolute',
  top: '49px',
  left: 0,
  right: 0,
  zIndex: 20,
  backgroundColor: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  animation: `${slideDown} ${fast} ease-out`,
  maxHeight: '200px',
  overflowY: 'auto',
  padding: '10px 16px',
});

export const topicPanelText = style({
  margin: 0,
  fontSize: '0.9rem',
  lineHeight: 1.5,
  color: vars.color.textPrimary,
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
});

export const searchHighlight = style({
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.35)`,
  borderRadius: '2px',
  padding: '0 1px',
});

export const headerWrapper = style({
  position: 'relative',
  flexShrink: 0,
});
