import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { uiSize, uiZoom } from '@/theme/uiDensity';
import { fast } from '@/theme/animations.css';

export const roomItem = style({
  zoom: uiZoom,
  display: 'flex',
  alignItems: 'center',
  padding: `calc((${uiSize('roomRow')} - ${uiSize('roomAvatar')}) / 2) 8px`,
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  margin: '0 4px',
  transition: `background-color ${fast}`,
  fontSize: '0.95rem',
  color: vars.color.textMuted,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]:hover': {
      backgroundColor: vars.color.bgActive,
    },
    '&[data-active="true"]': {
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&[data-has-notif="true"]': {
      color: vars.color.textPrimary,
    },
    '&[data-in-call="true"]': {
      color: vars.color.textPrimary,
    },
  },
});

export const chatAvatarImg = style({
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  objectFit: 'cover',
});

export const chatTextContent = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const chatTextStack = style({
  flex: 1,
  minWidth: 0,
  height: uiSize('roomAvatar'),
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  lineHeight: 1.15,
});

export const chatPreview = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.78em',
  color: vars.color.textMuted,
});

export const itemBadges = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
  marginLeft: '8px',
  maxWidth: '64px',
  overflow: 'hidden',
  transition: `opacity ${fast}, max-width ${fast}, margin-left ${fast}`,
  selectors: {
    [`${roomItem}:hover &`]: {
      opacity: 0,
      maxWidth: '0px',
      marginLeft: '0px',
    },
    '&:not(:has(*))': {
      marginLeft: 0,
    },
  },
});

export const chatAvatar = style({
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  borderRadius: '50%',
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.85rem',
  position: 'relative',
});

export const avatarWrap = style({
  position: 'relative',
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  flexShrink: 0,
  marginRight: '8px',
});

export const roomTypeBadge = style({
  position: 'absolute',
  right: '-4px',
  bottom: '-4px',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textMuted,
  border: `1px solid ${vars.color.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1,
  pointerEvents: 'none',
  selectors: {
    [`${roomItem}[data-active="true"] &`]: {
      color: vars.color.textPrimary,
    },
  },
});

export const roomTypeBadgeVoice = style([
  roomTypeBadge,
  {
    color: vars.color.success,
    borderColor: vars.color.success,
  },
]);

export const roomTypeIcon = style({
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  flexShrink: 0,
  marginRight: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textMuted,
  selectors: {
    [`${roomItem}[data-active="true"] &`]: {
      color: vars.color.textPrimary,
    },
  },
});

export const roomTypeIconVoice = style([
  roomTypeIcon,
  {
    color: vars.color.success,
  },
]);

export const callBadge = style({
  color: vars.color.success,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const mutedBadge = style({
  color: vars.color.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const bump = keyframes({
  '0%': { transform: 'scale(1)' },
  '40%': { transform: 'scale(1.2)' },
  '100%': { transform: 'scale(1)' },
});

export const badgeBump = style({
  animationName: bump,
  animationDuration: '150ms',
  animationTimingFunction: 'ease-out',
});

export const roomBadge = style({
  marginLeft: 'auto',
  backgroundColor: vars.color.accent,
  color: '#fff',
  borderRadius: '10px',
  fontSize: '0.72rem',
  fontWeight: 700,
  padding: '1px 6px',
  minWidth: '18px',
  textAlign: 'center',
});

export const roomBadgeNotif = style([roomBadge, { backgroundColor: vars.color.mention }]);

export const itemMenuButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: '0px',
  height: '18px',
  marginLeft: '0px',
  padding: 0,
  overflow: 'hidden',
  borderRadius: vars.radius.sm,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: vars.color.textMuted,
  opacity: 0,
  pointerEvents: 'none',
  transition: `width ${fast}, margin-left ${fast}, opacity ${fast}, color ${fast}`,
  selectors: {
    [`${roomItem}:hover &`]: {
      width: '18px',
      marginLeft: '8px',
      opacity: '1',
      pointerEvents: 'auto',
    },
    '&:hover': {
      color: vars.color.textPrimary,
    },
    '&:focus-visible': {
      width: '18px',
      marginLeft: '8px',
      opacity: '1',
      pointerEvents: 'auto',
      outline: `1px solid ${vars.color.accent}`,
      outlineOffset: '1px',
      color: vars.color.textPrimary,
    },
  },
  '@media': {
    '(pointer: coarse)': {
      width: '18px',
      marginLeft: '8px',
      opacity: '1',
      pointerEvents: 'auto',
    },
  },
});
