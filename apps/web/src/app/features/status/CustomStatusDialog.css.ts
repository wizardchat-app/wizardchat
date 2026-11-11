import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const clearButton = style({
  marginRight: 'auto',
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const inputGrow = style({
  flex: 1,
  minWidth: 0,
});

export const emojiSlot = style({
  position: 'relative',
  flexShrink: 0,
});

export const emoji = style({
  fontSize: '20px',
  lineHeight: 1,
});

export const emojiRemove = style({
  position: 'absolute',
  top: '-4px',
  right: '-4px',
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  cursor: 'pointer',
  ':hover': { color: vars.color.textPrimary },
});
