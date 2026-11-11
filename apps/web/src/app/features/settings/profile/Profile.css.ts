import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const AVATAR = 120;
const RING = 6;

const focusRing = {
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
};

export const card = style({
  maxWidth: '600px',
  margin: '0 auto',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
  paddingBottom: '24px',
});

export const banner = style({
  position: 'relative',
  height: '180px',
});

const bannerLayer = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
} as const;

export const bannerImg = style({ ...bannerLayer, objectFit: 'cover', display: 'block' });
export const bannerFill = style(bannerLayer);
export const bannerNeutral = style({ ...bannerLayer, backgroundColor: vars.color.bgHover });

export const bannerEdit = style({
  position: 'absolute',
  top: '12px',
  right: '12px',
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.md,
  border: 'none',
  backgroundColor: 'rgba(0,0,0,0.55)',
  color: '#fff',
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${fast}, background-color ${fast}`,
  selectors: {
    [`${banner}:hover &, &:focus-visible, &[aria-expanded="true"]`]: { opacity: 1 },
    '&:hover': { backgroundColor: 'rgba(0,0,0,0.75)' },
    '&:disabled': { cursor: 'progress', opacity: 1 },
  },
  ...focusRing,
});

export const head = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '4px',
  padding: '0 24px',
  marginTop: `-${AVATAR / 2 + RING}px`,
  position: 'relative',
});

export const avatarRing = style({
  position: 'relative',
  flexShrink: 0,
  padding: `${RING}px`,
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
});

export const avatarBtn = style({
  position: 'relative',
  display: 'block',
  width: `${AVATAR}px`,
  height: `${AVATAR}px`,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'none',
  cursor: 'pointer',
  overflow: 'hidden',
  selectors: { '&:disabled': { cursor: 'progress' } },
  ...focusRing,
});

export const avatarOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.5)',
  color: '#fff',
  opacity: 0,
  transition: `opacity ${fast}`,
  pointerEvents: 'none',
  selectors: {
    [`${avatarBtn}:hover &, ${avatarBtn}:focus-visible &, ${avatarBtn}[aria-expanded="true"] &, ${avatarBtn}:disabled &`]:
      { opacity: 1 },
  },
});

export const presenceDot = style({
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  display: 'flex',
  padding: '5px',
  border: 'none',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
  transition: `transform ${fast}`,
  ':hover': { transform: 'scale(1.1)' },
  ...focusRing,
});

export const statusSlot = style({
  flex: 1,
  display: 'flex',
  minWidth: 0,
  marginTop: `${AVATAR / 2 + RING + 6}px`,
  paddingLeft: '2px',
});

export const identity = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  padding: '12px 24px 0',
});

export const nameBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  maxWidth: '100%',
  margin: '0 -8px',
  padding: '2px 8px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'text',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ...focusRing,
});

const nameText = {
  fontSize: '1.6rem',
  fontWeight: 700,
  lineHeight: 1.25,
} as const;

export const name = style({ ...nameText, minWidth: 0, overflowWrap: 'anywhere' });

export const namePen = style({
  flexShrink: 0,
  color: vars.color.textMuted,
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: { [`${nameBtn}:hover &, ${nameBtn}:focus-visible &`]: { opacity: 1 } },
});

export const nameInput = style({
  ...nameText,
  width: '100%',
  margin: '0 -8px',
  padding: '2px 8px',
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  outline: 'none',
});

export const userIdRow = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '4px',
  minHeight: '28px',
});

export const pronounsText = style({
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
});

export const pronounsBtn = style({
  margin: '0 -6px',
  padding: '2px 6px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  cursor: 'text',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ...focusRing,
});

export const pronounsBtnEmpty = style([
  pronounsBtn,
  { color: vars.color.textMuted, fontStyle: 'italic' },
]);

export const pronounsInput = style({
  width: '180px',
  margin: '0 -6px',
  padding: '2px 6px',
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  outline: 'none',
});

export const userId = style({
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  wordBreak: 'break-all',
});

export const hiddenInput = style({ display: 'none' });

export const navProfile = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  marginBottom: '8px',
  padding: '8px 10px',
  border: 'none',
  borderRadius: vars.radius.md,
  background: 'none',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ...focusRing,
});

export const navProfileActive = style([
  navProfile,
  {
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive },
  },
]);

export const navProfileNarrow = style([
  navProfile,
  { gap: '14px', padding: '12px 16px', marginBottom: '4px', borderRadius: 0 },
]);

export const navProfileText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
});

export const navProfileName = style({
  fontSize: '1rem',
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const navProfileEdit = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});
