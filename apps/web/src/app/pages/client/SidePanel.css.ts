import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { med, slideInRight } from '@/theme/animations.css';

const base = {
  width: '450px',
  position: 'relative',
  ...backdrop('secondary'),
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 'env(safe-area-inset-left)',
      right: 'env(safe-area-inset-right)',
      top: 'env(safe-area-inset-top)',
      bottom: 'env(safe-area-inset-bottom)',
      width: 'auto',
      zIndex: 5000,
      transform: 'translateX(100%)',
      transition: `transform ${med} ease`,
    },
  },
} as const;

export const sidePanel = style(base);

export const sidePanelOpen = style({
  ...base,
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      right: 'env(safe-area-inset-right)',
      top: 'env(safe-area-inset-top)',
      bottom: 'env(safe-area-inset-bottom)',
      zIndex: 5000,
      transform: 'translateX(0)',
      animation: `${slideInRight} ${med} ease`,
    },
  },
});

export const sidePanelExpanded = style({
  flexGrow: 1,
});

export const sidePanelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const sidePanelTitle = style({
  fontSize: 'inherit',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sidePanelClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});
