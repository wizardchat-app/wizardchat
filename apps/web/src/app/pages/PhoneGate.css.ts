import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const page = style({
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.bgPrimary,
  padding:
    'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
});

export const card = style({
  width: '100%',
  maxWidth: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  padding: '32px 24px',
  textAlign: 'center',
});

export const title = style({
  fontSize: '1.4rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const body = style({
  color: vars.color.textMuted,
  fontSize: '0.95rem',
  lineHeight: 1.5,
  marginBottom: '8px',
});
