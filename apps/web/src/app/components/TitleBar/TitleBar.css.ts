import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const TITLE_BAR_HEIGHT = 40;

const SPACE_BAR_WIDTH = 64;
const CORNER_RADIUS = 8;

const drag = { WebkitAppRegion: 'drag' } as Record<string, string>;
const noDrag = { WebkitAppRegion: 'no-drag' } as Record<string, string>;

export const titleBar = style({
  ...drag,
  position: 'relative',
  flexShrink: 0,
  height: `${TITLE_BAR_HEIGHT}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingLeft: '8px',
  paddingRight: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 8px)',
  ...backdrop('primary'),
  userSelect: 'none',
  zIndex: 2,
  '::before': {
    content: '""',
    position: 'absolute',
    left: `${SPACE_BAR_WIDTH - 1}px`,
    top: '100%',
    width: '1px',
    height: `${CORNER_RADIUS}px`,
    ...backdrop('primary'),
    pointerEvents: 'none',
  },
  '::after': {
    content: '""',
    position: 'absolute',
    left: `${SPACE_BAR_WIDTH - 1}px`,
    right: 0,
    top: 'calc(100% - 1px)',
    height: `${CORNER_RADIUS + 1}px`,
    borderTop: `1px solid ${vars.color.border}`,
    borderLeft: `1px solid ${vars.color.border}`,
    borderTopLeftRadius: `${CORNER_RADIUS}px`,
    pointerEvents: 'none',
  },
  selectors: {
    'html.desktop-darwin:not(.desktop-fullscreen) &': { paddingLeft: '80px' },
    'html.desktop-other &': { paddingRight: 0 },
  },
  '@media': {
    '(max-width: 768px)': { display: 'none' },
  },
});

export const titleBarFixed = style([
  titleBar,
  {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
    '::before': { display: 'none' },
    '::after': { display: 'none' },
  },
]);

export const center = style({
  ...noDrag,
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(480px, 40vw)',
});

export const end = style({
  ...noDrag,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const search = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  height: '28px',
  padding: '0 8px 0 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textMuted,
  fontSize: '0.82rem',
  cursor: 'pointer',
  transition: `border-color ${fast}, color ${fast}`,
  ':hover': {
    borderColor: `rgba(${vars.color.accentRgb}, 0.5)`,
    color: vars.color.textPrimary,
  },
});

export const searchLabel = style({
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const windowControls = style({
  ...noDrag,
  display: 'flex',
  alignSelf: 'stretch',
  marginLeft: '8px',
});

export const windowButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '46px',
  height: '100%',
  color: vars.color.textMuted,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const closeButton = style([
  windowButton,
  {
    ':hover': {
      backgroundColor: '#c42b1c',
      color: '#ffffff',
    },
  },
]);
