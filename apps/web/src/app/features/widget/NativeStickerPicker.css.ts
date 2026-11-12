import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { pulse } from '@/theme/animations.css';

export const popoverNaked = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
});

export const popover = style({
  width: '352px',
  height: '460px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 5000,
});

export const searchWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 8px 0',
  flexShrink: 0,
});

export const searchInner = style({
  position: 'relative',
  flex: 1,
  minWidth: 0,
});

export const searchInput = style({
  width: '100%',
  padding: '6px 28px 6px 10px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  outline: 'none',
  '::placeholder': {
    color: vars.color.textMuted,
  },
  ':focus': {
    borderColor: vars.color.accent,
  },
  boxSizing: 'border-box',
});

export const searchClearBtn = style({
  position: 'absolute',
  right: '2px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const bodyMain = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

export const body = style({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  height: '100%',
});

export const navSidebar = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: '6px 4px',
  backgroundColor: vars.color.bgPrimary,
  borderRight: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const navBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  fontSize: '1rem',
  lineHeight: 1,
  padding: 0,
  position: 'relative',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const navBtnActive = style({
  backgroundColor: vars.color.bgHover,
});

export const navPill = style({
  position: 'absolute',
  left: '-4px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '4px',
  height: '0',
  opacity: 0,
  borderRadius: '0 2px 2px 0',
  backgroundColor: vars.color.accent,
  transition: 'height 0.12s ease, opacity 0.12s ease',
  selectors: {
    [`${navBtn}:hover &`]: {
      height: '8px',
      opacity: 1,
    },
    [`${navBtnActive} &`]: {
      height: '20px',
      opacity: 1,
    },
    [`${navBtnActive}:hover &`]: {
      height: '20px',
      opacity: 1,
    },
  },
});

export const navImg = style({
  width: '18px',
  height: '18px',
  objectFit: 'contain',
  borderRadius: '2px',
});

export const contentCol = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

export const stickerBody = style({
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '0 0 4px',
});

export const packSection = style({
  marginBottom: '4px',
});

export const packLabel = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  padding: '4px 8px',
  position: 'sticky',
  top: 0,
  backgroundColor: vars.color.bgSecondary,
  zIndex: 1,
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '2px',
  padding: '0 4px',
});

export const item = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 2px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  transition: 'background-color 0.15s',
  minWidth: 0,
  width: '100%',
  overflow: 'hidden',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: 1 },
});

export const image = style({
  width: '48px',
  height: '48px',
  maxWidth: '100%',
  objectFit: 'contain',
});

export const emptyState = style({
  padding: '24px 16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  fontStyle: 'italic',
});

export const emptyLink = style({
  color: vars.color.accent,
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 'none',
  fontSize: '0.85rem',
  padding: 0,
  ':hover': { color: vars.color.accentHover },
});

export const skeletonLabel = style({
  width: '96px',
  height: '10px',
  margin: '3px 0',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.4s ease-in-out infinite`,
});

export const skeletonTile = style({
  height: '48px',
  margin: '4px 2px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.4s ease-in-out infinite`,
});
