import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';

export const panel = style({
  width: '340px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  ...backdrop('secondary'),
  borderLeft: `1px solid ${vars.color.border}`,
  '@media': { '(max-width: 768px)': { display: 'none' } },
});

export const list = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
});

export const empty = style({
  padding: '16px 4px',
  textAlign: 'center',
  fontSize: '0.82rem',
  lineHeight: 1.5,
  color: vars.color.textMuted,
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
});

export const room = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: 0,
});

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const roomName = style({
  ...ellipsis,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.88rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const liveIcon = style({ color: vars.color.success, flexShrink: 0 });

export const roomNameText = style({ ...ellipsis, minWidth: 0 });

export const spaceName = style({
  ...ellipsis,
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

export const people = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const person = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  fontSize: '0.82rem',
  color: vars.color.textSecondary,
});

export const personKnown = style([person, { color: vars.color.textPrimary }]);

export const personName = style({ ...ellipsis, minWidth: 0 });

export const more = style({
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  paddingLeft: '28px',
});
