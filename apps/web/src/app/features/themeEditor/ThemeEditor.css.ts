import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const panel = style({
  width: '320px',
});

export const body = style({
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '22px',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const sectionTitle = style({
  fontSize: '13px',
  fontWeight: 600,
  color: vars.color.textMuted,
});

export const textInput = style({
  height: '36px',
  padding: '0 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  fontSize: '14px',
  ':focus': { outline: 'none', borderColor: vars.color.accent },
});

export const segmented = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4px',
  padding: '4px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
});

export const segment = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const segmentActive = style([
  segment,
  { backgroundColor: vars.color.bgTertiary, color: vars.color.textPrimary },
]);

export const strip = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '44px',
  padding: '0 10px',
  borderRadius: vars.radius.md,
});

export const stop = style({
  width: '24px',
  height: '24px',
  borderRadius: '6px',
  border: '2px solid rgba(255, 255, 255, 0.85)',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
  cursor: 'pointer',
  padding: 0,
  transition: `transform ${fast}`,
  ':hover': { transform: 'scale(1.08)' },
});

export const stopActive = style([
  stop,
  { width: '30px', height: '30px', border: '3px solid #ffffff' },
]);

export const picker = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const square = style({
  position: 'relative',
  height: '150px',
  borderRadius: vars.radius.md,
  backgroundImage:
    'linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)',
  cursor: 'crosshair',
  touchAction: 'none',
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

const thumb = {
  position: 'absolute',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: '3px solid #ffffff',
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.4)',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
} as const;

export const squareThumb = style(thumb);

export const hue = style({
  position: 'relative',
  height: '12px',
  borderRadius: '999px',
  background:
    'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
  cursor: 'pointer',
  touchAction: 'none',
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

export const hueThumb = style({ ...thumb, top: '50%', width: '18px', height: '18px' });

export const hexRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
});

export const hexSwatch = style({
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  flexShrink: 0,
  boxShadow: 'inset 0 0 0 1px rgba(128, 128, 128, 0.35)',
});

export const hexInput = style({
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  color: vars.color.textPrimary,
  fontFamily: 'monospace',
  fontSize: '14px',
  ':focus': { outline: 'none' },
});

export const iconButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const control = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const controlLabel = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '14px',
  color: vars.color.textPrimary,
});

export const controlValue = style({
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
});

export const footer = style({
  padding: '12px 16px',
  borderTop: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
});

export const slider = style({ width: '100%' });
