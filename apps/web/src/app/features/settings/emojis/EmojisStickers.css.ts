import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const packList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const packCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const packCardPreview = style({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});

export const packCardPreviewImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

export const packCardInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const packCardName = style({
  fontSize: '0.95rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const packCardMeta = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const packCardActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const emptyPacks = style({
  padding: '16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  backgroundColor: vars.color.bgSecondary,
  border: `1px dashed ${vars.color.border}`,
  borderRadius: vars.radius.md,
  fontStyle: 'italic',
});

export const headerRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
});

export const headerButton = style({
  flexShrink: 0,
});

export const popEmpty = style({
  padding: '16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
});

export const popRoomGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const popRoomName = style({
  fontSize: '0.72rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  padding: '8px 10px 4px',
});

export const popPackRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '6px 10px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: vars.color.textPrimary,
  textAlign: 'left',
  fontSize: '0.85rem',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const popPackRowSelected = style([
  popPackRow,
  {
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive },
  },
]);

export const popPackThumb = style({
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});

export const popPackThumbImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

export const popPackName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const popPackCheckbox = style({
  width: '18px',
  height: '18px',
  borderRadius: '4px',
  border: `2px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  transition: `background-color ${fast}, border-color ${fast}`,
});

export const popPackCheckboxSelected = style({
  borderColor: vars.color.accent,
  backgroundColor: vars.color.accent,
});
