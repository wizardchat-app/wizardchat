import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const TAB_BAR_HEIGHT = 56;

export const tabBar = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'flex',
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5001,
      height: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
      padding: '0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      boxSizing: 'border-box',
      ...backdrop('secondary'),
      borderTop: `1px solid ${vars.color.border}`,
    },
  },
});

export const tabBarNative = style({ visibility: 'hidden' });

export const NATIVE_TAB_BAR = 'html[data-native-tabbar]';

export const tab = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3px',
  minWidth: 0,
  border: 'none',
  background: 'none',
  padding: 0,
  cursor: 'pointer',
  color: vars.color.textMuted,
  fontFamily: 'inherit',
  fontSize: '0.68rem',
  fontWeight: 500,
  transition: `color ${fast}`,
  WebkitTapHighlightColor: 'transparent',
});

export const tabActive = style([tab, { color: vars.color.textPrimary }]);

export const tabIcon = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
});

const dot = {
  position: 'absolute',
  top: '-2px',
  right: '-5px',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.bgSecondary}`,
} as const;

export const notifDot = style({ ...dot, backgroundColor: vars.color.accent });
export const notifDotMention = style({ ...dot, backgroundColor: vars.color.mention });

export const callBadge = style({
  position: 'absolute',
  bottom: '-3px',
  right: '-8px',
  display: 'flex',
  color: vars.color.success,
});
