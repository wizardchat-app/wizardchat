import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxHeight: '60vh',
  overflowY: 'auto',
});

export const version = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
});

export const meta = style({
  display: 'flex',
  gap: '8px',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const label = style({
  fontWeight: 600,
});

export const body = style({
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const status = style({
  color: vars.color.textMuted,
  textAlign: 'center',
});
