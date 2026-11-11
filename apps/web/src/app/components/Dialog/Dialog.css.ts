import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fadeIn, scaleIn, med } from '@/theme/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  zIndex: 7500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding:
    'calc(24px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left))',
  animation: `${fadeIn} ${med} ease`,
  '@media': {
    '(max-width: 768px)': {
      padding:
        'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
    },
  },
});

const panelBase = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
  overflow: 'hidden',
  width: '100%',
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  animation: `${scaleIn} ${med} ease`,
});

export const panel = style([panelBase, { outline: 'none' }]);

export const panelPrimary = style({
  backgroundColor: vars.color.bgPrimary,
});

export const panelFullscreenMobile = style({
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      top: 'env(safe-area-inset-top)',
      right: 'env(safe-area-inset-right)',
      bottom: 'env(safe-area-inset-bottom)',
      left: 'env(safe-area-inset-left)',
      width: 'auto !important',
      maxWidth: 'none !important',
      height: 'auto !important',
      maxHeight: 'none !important',
      borderRadius: 0,
    },
  },
});

export const sizes = styleVariants({
  sm: { maxWidth: '380px' },
  md: { maxWidth: '460px' },
  lg: { maxWidth: '520px' },
  xl: { maxWidth: '640px' },
  xxl: { maxWidth: '960px' },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const title = style({
  fontSize: '1.1rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const titleGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
});

export const subtitle = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
});

export const titleIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.accent,
});

export const body = style({
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 24px 20px',
  flexShrink: 0,
});

export const dialogMessage = style({
  color: vars.color.textMuted,
  fontSize: '0.95rem',
  margin: 0,
});
