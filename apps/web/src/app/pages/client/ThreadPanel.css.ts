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

export const threadPanel = style(base);

export const threadPanelOpen = style({
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

export const threadPanelExpanded = style({
  flexGrow: 1,
});

export const threadPanelHeader = style({
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

export const threadPanelLabel = style({
  fontSize: 'inherit',
  flexShrink: 0,
});

export const threadPanelTitle = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const threadPanelDivider = style({
  width: '3px',
  height: '3px',
  borderRadius: '50%',
  backgroundColor: vars.color.textMuted,
  flexShrink: 0,
  opacity: 0.5,
});

export const threadPanelBack = style({
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

export const threadPanelClose = style({
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

export const threadRootWrap = style({
  padding: '12px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  fontSize: '0.9rem',
});

export const threadRootMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '4px',
});

export const threadRootSender = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
});

export const threadRootTime = style({
  color: vars.color.textMuted,
  fontSize: '0.75rem',
  flexShrink: 0,
});

export const threadRootContent = style({
  color: vars.color.textPrimary,
  fontSize: '0.9rem',
  lineHeight: '1.5',
  wordBreak: 'break-word',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
});

export const threadRootUndecryptable = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontStyle: 'italic',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
});

export const threadReplyList = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 0',
  minHeight: 0,
});

export const dateSeparator = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 12px 4px',
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  fontWeight: 600,
  letterSpacing: '0.04em',
  '::before': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
  '::after': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
});

export const threadLoading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  flex: 1,
});

export const threadEmpty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  fontStyle: 'italic',
  flex: 1,
});

export const threadComposerBg = style({
  ...backdrop('secondary'),
});
