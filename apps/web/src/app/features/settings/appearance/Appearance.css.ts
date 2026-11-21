import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { chatSize } from '@/app/features/timeline/chatDisplay';
import { fast } from '@/theme/animations.css';

export const preview = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '10px 0',
  marginBottom: '8px',
  userSelect: 'none',
});

export const previewSender = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: 1.15,
});

export const swatchRow = style({
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
});

export const swatch = style({
  position: 'relative',
  width: '32px',
  height: '32px',
  borderRadius: '10px',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  backgroundClip: 'padding-box',
  boxShadow: 'inset 0 0 0 1px rgba(128, 128, 128, 0.28)',
  outline: '2px solid transparent',
  outlineOffset: '3px',
  transition: `outline-color ${fast}, transform ${fast}`,
  ':hover': { transform: 'scale(1.06)' },
  ':focus-visible': { outlineColor: vars.color.accent },
});

export const swatchActive = style([swatch, { outlineColor: vars.color.accent }]);

export const slot = style({
  position: 'relative',
  display: 'flex',
});

export const slotEdit = style({
  position: 'absolute',
  right: '-6px',
  bottom: '-6px',
  width: '20px',
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: '50%',
  border: `2px solid ${vars.color.bgSecondary}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}, transform ${fast}`,
  selectors: {
    '&:hover': { transform: 'scale(1.12)', backgroundColor: vars.color.accent, color: '#ffffff' },
  },
});

export const addSwatch = style([
  swatch,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: vars.color.textMuted,
    boxShadow: 'none',
    border: `2px dashed ${vars.color.border}`,
    ':hover': {
      color: vars.color.textPrimary,
      borderColor: vars.color.textMuted,
      transform: 'none',
    },
  },
]);

export const addSwatchDisabled = style([
  addSwatch,
  {
    opacity: 0.45,
    cursor: 'not-allowed',
    ':hover': { color: vars.color.textMuted, borderColor: vars.color.border },
  },
]);

export const modeSegmented = style({
  display: 'inline-grid',
  gridTemplateColumns: 'repeat(3, auto)',
  gap: '4px',
  padding: '4px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
});

export const modeSegment = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 12px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
});

export const modeSegmentActive = style([
  modeSegment,
  { backgroundColor: vars.color.bgTertiary, color: vars.color.textPrimary },
]);

export const slotUnused = style({
  opacity: 0.55,
  transition: `opacity ${fast}`,
  ':hover': { opacity: 1 },
  selectors: { '&:has(:focus-visible)': { opacity: 1 } },
});
