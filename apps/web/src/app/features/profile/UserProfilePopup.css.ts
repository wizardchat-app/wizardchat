import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { scaleIn, fast } from '@/theme/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 7500,
});

export const popup = style({
  position: 'fixed',
  zIndex: 7501,
  width: '280px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  animation: `${scaleIn} ${fast} ease`,
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  gap: '14px',
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const coverWrap = style({
  margin: '-20px -20px 0',
  position: 'relative',
  height: '100px',
  flexShrink: 0,
});

export const cover = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  pointerEvents: 'none',
});

export const coverFallback = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});

export const coverNeutral = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundColor: vars.color.bgTertiary,
});

export const coverEdit = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  pointerEvents: 'none',
  selectors: {
    [`${coverWrap}:hover &`]: {
      opacity: 1,
    },
  },
});

export const topRow = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  marginTop: '-30px',
  position: 'relative',
  zIndex: 1,
});

export const avatarRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
});

export const avatarWrap = style({
  cursor: 'pointer',
  borderRadius: '50%',
  lineHeight: 0,
  flexShrink: 0,
  backgroundColor: vars.color.bgSecondary,
  padding: '3px',
});

export const nameSection = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '2px',
  minWidth: 0,
  maxWidth: '100%',
});

export const displayName = style({
  fontSize: '1.05rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.3,
});

export const displayNameRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
});

export const verifiedBadge = style({
  flexShrink: 0,
  color: vars.color.accent,
});

export const userIdRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const userId = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  fontFamily: 'monospace',
  wordBreak: 'break-all',
  lineHeight: 1.3,
});

export const infoRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.85rem',
});

export const infoIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const infoValue = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
  marginRight: 'auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const roleBadge = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '2px 8px 2px 6px',
  borderRadius: vars.radius.sm,
  textTransform: 'capitalize',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
});

export const roleDot = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const roleAdminDot = style([roleDot, { backgroundColor: 'var(--wz-color-role-admin)' }]);
export const roleModeratorDot = style([
  roleDot,
  { backgroundColor: 'var(--wz-color-role-moderator)' },
]);
export const roleMemberDot = style([roleDot, { backgroundColor: 'var(--wz-color-role-member)' }]);
export const roleFounderDot = style([roleDot, { backgroundColor: 'var(--wz-color-role-founder)' }]);

export const roleAdmin = style([roleBadge]);
export const roleModerator = style([roleBadge]);
export const roleMember = style([roleBadge]);
export const roleFounder = style([roleBadge]);

export const modActions = style({
  display: 'flex',
  gap: '8px',
});

export const modActionBtn = style({
  flex: 1,
});

export const primaryRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const primaryBtn = style({
  flex: 1,
});

export const hiddenInput = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export const avatarWrapEditable = style({
  position: 'relative',
});

export const avatarEdit = style({
  position: 'absolute',
  inset: '4px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  pointerEvents: 'none',
  selectors: {
    [`${avatarWrapEditable}:hover &`]: { opacity: 1 },
  },
});

export const statusSlot = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignSelf: 'flex-end',
  marginBottom: '6px',
  paddingLeft: '2px',
  paddingRight: '4px',
});

export const status = style({
  position: 'relative',
  display: 'flex',
  minWidth: 0,
  maxWidth: '100%',
  padding: '6px 12px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '10px 16px 16px 10px',
  backgroundColor: vars.color.bgSecondary,
  fontSize: '0.8rem',
  lineHeight: 1.35,
  color: vars.color.textPrimary,
  '::before': {
    content: '""',
    position: 'absolute',
    left: '-4px',
    top: '50%',
    width: '7px',
    height: '7px',
    backgroundColor: vars.color.bgSecondary,
    borderLeft: `1px solid ${vars.color.border}`,
    borderBottom: `1px solid ${vars.color.border}`,
    transform: 'translateY(-50%) rotate(45deg)',
  },
});

export const statusText = style({
  minWidth: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
});

export const accountSwitcherSlot = style({
  paddingTop: '12px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const mutual = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const mutualToggle = style([
  infoRow,
  {
    width: '100%',
    padding: '8px 10px',
    borderRadius: vars.radius.md,
    border: `1px solid ${vars.color.border}`,
    backgroundColor: vars.color.bgTertiary,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background-color ${fast}`,
    ':hover': { backgroundColor: vars.color.bgHover },
  },
]);

export const mutualCaret = style({
  color: vars.color.textMuted,
  flexShrink: 0,
  transition: `transform ${fast}`,
});

export const mutualCaretOpen = style([mutualCaret, { transform: 'rotate(180deg)' }]);

export const mutualList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '180px',
  overflowY: 'auto',
});

export const mutualGroup = style({
  display: 'flex',
  flexDirection: 'column',
});

export const mutualHeading = style({
  padding: '6px 6px 2px',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: vars.color.textMuted,
});

export const mutualItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '5px 6px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  textAlign: 'left',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const mutualName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
