import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const inboxButton = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  transition: `background-color ${fast}, color ${fast}`,
  position: 'relative',
  flexShrink: 0,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const inboxButtonActive = style([
  inboxButton,
  {
    color: vars.color.accent,
    ':hover': {
      color: vars.color.accent,
    },
  },
]);

export const anchor = style({
  display: 'flex',
  flexShrink: 0,
});

export const notifDot = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  border: `2px solid ${vars.color.bgPrimary}`,
  pointerEvents: 'none',
});

export const notifDotMention = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: vars.color.mention,
  border: `2px solid ${vars.color.bgPrimary}`,
  pointerEvents: 'none',
});

export const panel = style({
  width: '360px',
  height: '480px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 4px 0',
  flexShrink: 0,
});

export const title = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.95rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const titleIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

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

export const tabs = style({
  display: 'flex',
  gap: '4px',
  marginTop: '8px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const tab = style({
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

export const tabActive = style([
  tab,
  {
    color: vars.color.textPrimary,
    borderBottom: `2px solid ${vars.color.accent}`,
  },
]);

export const tabCount = style({
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

export const tabCountAccent = style([
  tabCount,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
  },
]);

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  marginTop: '6px',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const empty = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '28px 12px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: '0.8rem',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: vars.color.bgTertiary,
  },
});

export const inviteItem = style([
  item,
  {
    cursor: 'default',
  },
]);

export const info = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const name = style({
  fontSize: '0.83rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sub = style({
  fontSize: '0.72rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const subRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  minWidth: 0,
});

export const kindPrefix = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: '4px',
  color: vars.color.textMuted,
  fontSize: '0.95em',
  fontWeight: 700,
  verticalAlign: 'middle',
});

export const time = style({
  fontSize: '0.7rem',
  color: vars.color.textMuted,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const entryMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const markReadButton = style({
  width: '24px',
  height: '24px',
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
  ':hover': {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
  },
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
});

export const acceptButton = style({
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.72rem',
  fontWeight: 600,
  padding: '5px 10px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'default',
  },
});

export const declineButton = style({
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  fontSize: '0.72rem',
  fontWeight: 600,
  padding: '5px 10px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: vars.color.border,
    color: vars.color.textPrimary,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'default',
  },
});

export const mentionBody = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
