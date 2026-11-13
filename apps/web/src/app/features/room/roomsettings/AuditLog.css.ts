import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '12px',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 0',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
});

export const line = style({
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  overflowWrap: 'anywhere',
});

export const name = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const quote = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
});

export const time = style({
  flexShrink: 0,
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

export const more = style({
  display: 'flex',
  justifyContent: 'center',
  paddingTop: '16px',
});
