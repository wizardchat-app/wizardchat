import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const iconBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const mobileHeader = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding:
        'env(safe-area-inset-top) calc(12px + env(safe-area-inset-right)) 0 calc(12px + env(safe-area-inset-left))',
      height: 'calc(48px + env(safe-area-inset-top))',
      boxSizing: 'border-box',
      ...backdrop('secondary'),
      borderBottom: `1px solid ${vars.color.border}`,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
  },
});
export const mobileHeaderSpacer = style({
  width: '28px',
  flexShrink: 0,
});

export const mobileMenuBtn = style([
  iconBtn,
  {
    width: '36px',
    height: '36px',
    fontSize: '1rem',
  },
]);

export const mobileSearch = style({
  flex: 1,
  minWidth: 0,
  marginLeft: '8px',
});

export const mobileActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const mobileActionBtn = style([
  iconBtn,
  {
    width: '32px',
    height: '32px',
  },
]);

export const mobileHeaderTitle = style({
  fontWeight: 600,
  fontSize: '0.95rem',
  textAlign: 'center',
  position: 'absolute',
  left: 0,
  right: 0,
  top: 'env(safe-area-inset-top)',
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 120px',
  pointerEvents: 'none',
});

export const mobileHeaderTitleText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
