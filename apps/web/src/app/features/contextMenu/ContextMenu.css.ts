import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const menu = style({
  position: 'fixed',
  zIndex: 9999,
  minWidth: '180px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  padding: '4px 0',
  userSelect: 'none',
});

export const menuSubmenu = style({
  position: 'fixed',
  zIndex: 10000,
  minWidth: '168px',
  maxWidth: '220px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  padding: '4px 0',
  userSelect: 'none',
});

export const menuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 14px',
  fontSize: '0.88rem',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
    '&:focus': {
      outline: 'none',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '-2px',
    },
    '[data-suppress-hover="true"] &:hover': {
      backgroundColor: 'transparent',
    },
  },
});

export const menuItemActive = style({
  backgroundColor: vars.color.bgHover,
});

export const menuItemDangerActive = style({
  backgroundColor: 'rgba(255, 107, 107, 0.12)',
});

export const menuItemDanger = style([
  menuItem,
  {
    color: vars.color.error,
    ':hover': {
      backgroundColor: 'rgba(255, 107, 107, 0.12)',
    },
    selectors: {
      '[data-suppress-hover="true"] &:hover': {
        backgroundColor: 'transparent',
      },
    },
  },
]);

export const menuItemIcon = style({
  width: '14px',
  height: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.75,
  flexShrink: 0,
});

export const menuItemDisabled = style([
  menuItem,
  {
    opacity: 0.4,
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
]);

export const menuItemLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const menuItemCheck = style({
  color: vars.color.accent,
  fontSize: '0.8rem',
  flexShrink: 0,
});

export const menuItemCarat = style({
  opacity: 0.6,
  flexShrink: 0,
});

export const menuDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
});
