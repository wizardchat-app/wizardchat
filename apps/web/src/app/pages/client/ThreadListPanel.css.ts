import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const headerAction = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  padding: 0,
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const threadTabs = style({
  display: 'flex',
  gap: '4px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const threadTab = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 6px',
  border: 'none',
  background: 'transparent',
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const threadTabActive = style([
  threadTab,
  {
    color: vars.color.textPrimary,
    borderBottom: `2px solid ${vars.color.accent}`,
  },
]);

export const threadTabCount = style({
  minWidth: '16px',
  padding: '0 5px',
  borderRadius: '8px',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  fontSize: '0.68rem',
  fontWeight: 700,
  lineHeight: '16px',
  textAlign: 'center',
});

export const threadTabCountAccent = style([
  threadTabCount,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
  },
]);

export const threadListBody = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
});

export const threadListEmpty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  fontStyle: 'italic',
  flex: 1,
});

export const threadListError = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '32px 16px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  flex: 1,
});

export const threadListItem = style({
  display: 'flex',
  gap: '10px',
  padding: '8px 12px',
  cursor: 'pointer',
  borderBottom: `1px solid ${vars.color.border}`,
  transition: 'background-color 0.15s ease',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const threadItemAvatar = style({
  flexShrink: 0,
  marginTop: '2px',
});

export const threadItemContent = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const threadItemMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const threadItemSender = style({
  fontSize: '0.82rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const threadItemTime = style({
  fontSize: '0.72rem',
  color: vars.color.textMuted,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const threadItemBody = style({
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
  lineHeight: '1.4',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-word',
});

export const threadItemBodyUndecryptable = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontStyle: 'italic',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
});

export const threadItemFooter = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '2px',
});

export const markReadButton = style({
  width: '22px',
  height: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  marginLeft: 'auto',
  ':hover': {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
  },
});

export const threadItemReplyCount = style({
  fontSize: '0.74rem',
  color: vars.color.textMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});
