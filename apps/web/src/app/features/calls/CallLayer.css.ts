import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { ROOM_HEADER_HEIGHT } from '@/app/features/timeline/RoomHeader.css';

export const DOCKED_HEADER_HEIGHT = 49;

export const container = style({
  position: 'relative',
  width: '100%',
  flexShrink: 0,
  height: 0,
  minHeight: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  visibility: 'hidden',
  opacity: 0,
  backgroundColor: '#111113',
});

export const containerActive = style({
  pointerEvents: 'auto',
  visibility: 'visible',
  opacity: 1,
  paddingTop: `${DOCKED_HEADER_HEIGHT}px`,
  transition: `height 300ms cubic-bezier(0.4, 0, 0.2, 1), padding-top 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease`,
});

export const pip = style({
  position: 'fixed',
  top: 'auto',
  left: 'auto',
  right: '24px',
  bottom: '88px',
  width: '420px',
  height: '270px',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  zIndex: 1000,
  paddingTop: 0,
});

export const fullscreen = style({
  position: 'absolute',
  top: `${ROOM_HEADER_HEIGHT}px`,
  left: 0,
  right: 0,
  bottom: 0,
  height: 'auto',
  zIndex: 6000,
});

const chromeBar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '0 16px',
  zIndex: 70,
  pointerEvents: 'auto',
  userSelect: 'none',
} as const;

export const header = style([
  chromeBar,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: `${DOCKED_HEADER_HEIGHT}px`,
    backgroundColor: vars.color.bgSecondary,
    borderBottom: `1px solid ${vars.color.border}`,
    color: vars.color.textPrimary,
  },
]);

export const headerTitle = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.9rem',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const headerIcon = style({
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const pipNav = style([
  chromeBar,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40px',
    padding: '0 6px',
    cursor: 'grab',
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    color: '#fff',
    ':active': {
      cursor: 'grabbing',
    },
  },
]);

export const pipNavTitle = style([
  headerTitle,
  {
    cursor: 'grab',
    color: '#fff',
    ':active': {
      cursor: 'grabbing',
    },
  },
]);

export const trueFullscreen = style({
  position: 'fixed !important' as 'fixed',
  inset: 0,
  width: '100% !important',
  height: '100% !important',
  zIndex: 7000,
});

export const pipNavBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      color: '#fff',
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
  },
});

export const dragOverlay = style({
  position: 'absolute',
  inset: 0,
  zIndex: 70,
  cursor: 'ns-resize',
  userSelect: 'none',
});

export const snapHint = style({
  position: 'absolute',
  inset: '4px',
  zIndex: 64,
  borderRadius: vars.radius.md,
  border: `2px dashed ${vars.color.accent}`,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.12)`,
  pointerEvents: 'none',
});

export const resizeBar = style({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '6px',
  cursor: 'ns-resize',
  zIndex: 65,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '::after': {
    content: '""',
    width: '32px',
    height: '3px',
    borderRadius: '2px',
    backgroundColor: vars.color.textMuted,
    opacity: 0.4,
  },
});
