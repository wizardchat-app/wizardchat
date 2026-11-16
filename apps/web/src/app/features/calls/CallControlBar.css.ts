import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { stage } from './stage/CallStage.css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const bar = style({
  position: 'absolute',
  left: '50%',
  bottom: '12px',
  transform: 'translateX(-50%)',
  zIndex: 75,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '6px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  maxWidth: 'calc(100% - 24px)',
  pointerEvents: 'auto',
  userSelect: 'none',
});

export const group = style({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
});

export const divider = style({
  width: '1px',
  height: '24px',
  margin: '0 4px',
  backgroundColor: vars.color.border,
  flexShrink: 0,
});

const button = style({
  width: '40px',
  height: '40px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  transition: `background-color ${fast}, color ${fast}, filter ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '1px',
    },
  },
});

export const ctrl = style([
  button,
  { selectors: { '&:hover': { color: vars.color.textPrimary } } },
]);

export const ctrlActive = style([button, { color: vars.color.success }]);

export const ctrlAccent = style([button, { color: vars.color.accent }]);

export const ctrlDanger = style([button, { color: vars.color.danger }]);

export const menuAnchor = style({
  display: 'inline-flex',
});

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const menuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.88rem',
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '-2px',
    },
  },
});

export const menuItemLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const menuItemSpacer = style({
  width: '16px',
  flexShrink: 0,
});

export const menuDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const reconnecting = style({
  position: 'absolute',
  left: '50%',
  bottom: 'calc(100% + 8px)',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  borderRadius: '999px',
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.warning,
  fontSize: '0.8rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
});

export const reconnectingSpinner = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  borderTopColor: vars.color.warning,
  animation: `${spin} 0.8s linear infinite`,
});

export const chatCorner = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  zIndex: 75,
  display: 'flex',
  pointerEvents: 'auto',
});

export const viewCorner = style({
  position: 'absolute',
  bottom: '19px',
  right: '12px',
  zIndex: 75,
  display: 'flex',
  gap: '2px',
  pointerEvents: 'auto',
});

globalStyle(`*:has(> ${chatCorner}) > ${stage}`, {
  paddingTop: '48px',
});
