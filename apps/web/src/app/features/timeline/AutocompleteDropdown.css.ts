import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const dropdown = style({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
  zIndex: 500,
});

export const suggestionsList = style({
  maxHeight: '240px',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});

export const header = style({
  padding: '6px 12px 4px',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '7px 12px',
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const itemSelected = style([
  item,
  {
    backgroundColor: vars.color.bgActive,
    color: vars.color.textPrimary,
  },
]);

export const emojiChar = style({
  fontSize: '1.3rem',
  lineHeight: 1,
  flexShrink: 0,
  width: '24px',
  textAlign: 'center',
});

export const emojiImg = style({
  width: '24px',
  height: '24px',
  objectFit: 'contain',
  flexShrink: 0,
});

export const emojiName = style({
  fontSize: '0.88rem',
  color: 'inherit',
  fontFamily: 'monospace',
});

export const mentionName = style({
  fontSize: '0.88rem',
  color: 'inherit',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const mentionId = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
  flexShrink: 0,
});

export const hint = style({
  padding: '6px 12px',
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  borderTop: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  gap: '10px',
});

export const hintKey = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontWeight: 500,
});
