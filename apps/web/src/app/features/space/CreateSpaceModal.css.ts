import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  textAlign: 'center',
  marginBottom: '4px',
});

export const title = style({
  fontSize: '1.2rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const tabs = style({
  display: 'flex',
  gap: '2px',
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.radius.md,
  padding: '3px',
});

export const tab = style({
  flex: 1,
  padding: '7px 0',
  fontSize: '0.88rem',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const tabActive = style([
  tab,
  {
    backgroundColor: vars.color.bgSecondary,
    color: vars.color.textPrimary,
  },
]);

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
});

export const hint = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  marginTop: '-8px',
});

export const iconMargin = style({
  marginRight: '6px',
});

export const textLink = style({
  alignSelf: 'center',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.85rem',
  color: vars.color.link,
  textDecoration: 'underline',
  ':hover': { color: vars.color.textPrimary },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
    borderRadius: '2px',
  },
});
