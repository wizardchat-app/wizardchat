import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const base = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.body,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: `background-color ${fast}, color ${fast}, opacity ${fast}, filter ${fast}`,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const sizes = styleVariants({
  sm: [base, { padding: '5px 12px', fontSize: '0.82rem' }],
  md: [base, { padding: '8px 18px', fontSize: '0.9rem' }],
  lg: [base, { padding: '11px 20px', fontSize: '0.95rem', width: '100%' }],
});

const variantBase = (extra: object) =>
  styleVariants({
    sm: [sizes.sm, extra],
    md: [sizes.md, extra],
    lg: [sizes.lg, extra],
  });

export const primary = variantBase({
  backgroundColor: vars.color.accent,
  color: '#fff',
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.accentHover },
    '&:active:not(:disabled)': { filter: 'brightness(0.9)' },
  },
});

export const secondary = variantBase({
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.bgHover },
    '&:active:not(:disabled)': { backgroundColor: vars.color.bgActive },
  },
});

export const danger = variantBase({
  backgroundColor: vars.color.danger,
  color: '#fff',
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  selectors: {
    '&:hover:not(:disabled)': { opacity: 0.85 },
    '&:active:not(:disabled)': { opacity: 1, filter: 'brightness(0.9)' },
  },
});

export const ghost = variantBase({
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&:active:not(:disabled)': { backgroundColor: vars.color.bgActive },
  },
});

export const fullWidth = style({ width: '100%' });

const iconBase = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.sm,
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}, filter ${fast}`,
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const iconSizes = styleVariants({
  xs: [iconBase, { width: '22px', height: '22px', fontSize: '0.75rem' }],
  sm: [iconBase, { width: '28px', height: '28px', fontSize: '0.9rem' }],
  md: [iconBase, { width: '32px', height: '32px', fontSize: '1rem' }],
  lg: [iconBase, { width: '36px', height: '36px', fontSize: '1rem' }],
});

export const iconDefault = style({
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&:active:not(:disabled)': { backgroundColor: vars.color.bgActive },
  },
});

export const iconActive = style({
  backgroundColor: vars.color.bgActive,
  color: vars.color.accent,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.bgActive, color: vars.color.accent },
    '&:active:not(:disabled)': { filter: 'brightness(0.9)' },
  },
});

export const iconDanger = style({
  backgroundColor: 'transparent',
  color: vars.color.danger,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.bgHover, color: vars.color.danger },
    '&:active:not(:disabled)': { backgroundColor: vars.color.bgActive },
  },
});

export const iconBordered = style({
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&:active:not(:disabled)': { backgroundColor: vars.color.bgActive },
  },
});
