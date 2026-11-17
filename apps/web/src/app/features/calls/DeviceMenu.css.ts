import { globalStyle, style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const split = style({
  display: 'inline-flex',
  alignItems: 'stretch',
  flexShrink: 0,
});

export const splitOpen = style({});

const caretBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: `0 ${vars.radius.sm} ${vars.radius.sm} 0`,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    '&:hover, &[aria-expanded="true"]': { color: vars.color.textPrimary },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
  },
});

export const caret = styleVariants({
  bar: [caretBase, { width: '18px', height: '40px' }],
  panel: [caretBase, { width: '14px', height: '28px' }],
});

const softHover = `color-mix(in srgb, ${vars.color.bgHover} 50%, transparent)`;

globalStyle(`${split} > :first-child`, {
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
});
globalStyle(`${split}:hover > *, ${splitOpen} > *`, { backgroundColor: softHover });
globalStyle(`${split} > *:hover, ${splitOpen} > [aria-expanded="true"]`, {
  backgroundColor: vars.color.bgHover,
});

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '220px',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.86rem',
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: vars.color.bgHover },
    '&:disabled': { cursor: 'default', opacity: 0.6 },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
  },
});

export const itemLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const check = style({ flexShrink: 0, color: vars.color.accent });

export const checkSpacer = style({ width: '16px', flexShrink: 0 });

export const divider = style({
  height: '1px',
  margin: '4px 0',
  backgroundColor: vars.color.border,
});

export const volumeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 10px 8px',
});

export const volumeIcon = style({ flexShrink: 0, color: vars.color.textMuted });

export const rowWrap = style({ position: 'relative' });

export const itemOpen = style({ backgroundColor: vars.color.bgHover });

export const rowText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const rowCurrent = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

export const rowArrow = style({ flexShrink: 0, color: vars.color.textMuted });

export const flyout = style({
  position: 'fixed',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: '220px',
  maxWidth: '320px',
  maxHeight: '320px',
  overflowY: 'auto',
  padding: '6px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
});

export const itemIcon = style({ flexShrink: 0, color: vars.color.textMuted });

export const previewFrame = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '16 / 9',
  margin: '2px 4px 4px',
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const previewVideo = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transform: 'scaleX(-1)',
});

export const previewError = style({
  padding: '0 12px',
  fontSize: '0.75rem',
  textAlign: 'center',
  color: vars.color.textMuted,
});
