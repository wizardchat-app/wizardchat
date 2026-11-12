import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  userSelect: 'none',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 4px',
});

export const title = style({
  fontSize: '15px',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const navButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  border: 'none',
  background: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.35, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  },
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '2px',
  outline: 'none',
});

export const weekday = style({
  textAlign: 'center',
  fontSize: '12px',
  fontWeight: 600,
  color: vars.color.textMuted,
  padding: '4px 0',
});

export const day = style({
  height: '36px',
  border: 'none',
  borderRadius: vars.radius.md,
  background: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '14px',
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.bgHover },
    '&:disabled': { color: vars.color.textSecondary, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
  },
});

export const outside = style({
  color: vars.color.textMuted,
});

export const today = style({
  color: vars.color.accent,
  fontWeight: 700,
});

export const selected = style({
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontWeight: 600,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.accentHover },
  },
});
