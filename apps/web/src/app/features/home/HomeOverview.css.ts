import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const page = style({
  flex: 1,
  minWidth: 0,
  height: '100%',
  overflowY: 'auto',
});

export const content = style({
  maxWidth: '980px',
  margin: '0 auto',
  padding: '28px 24px 40px',
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
  '@media': { '(max-width: 768px)': { padding: '20px 16px 32px' } },
});

export const hero = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '18px',
  padding: '24px 28px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const heroText = style({
  flex: 1,
  minWidth: '180px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const heroTitle = style({
  margin: 0,
  fontSize: '1.6rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const heroActions = style({ display: 'flex', gap: '8px' });

export const heroButton = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const dot = style({
  position: 'absolute',
  top: '-3px',
  right: '-3px',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  border: `2px solid ${vars.color.bgSecondary}`,
});

export const dotMention = style([dot, { backgroundColor: vars.color.mention }]);

export const section = style({ display: 'flex', flexDirection: 'column', gap: '12px' });

export const sectionTitle = style({
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const actions = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '12px',
  '@media': { '(max-width: 640px)': { gridTemplateColumns: 'minmax(0, 1fr)' } },
});

export const action = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  padding: '22px 12px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: '0.9rem',
  textAlign: 'center',
  cursor: 'pointer',
  transition: `background-color ${fast}, border-color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    borderColor: `rgba(${vars.color.accentRgb}, 0.5)`,
  },
});

export const actionIcon = style({ color: vars.color.accent });

export const appsCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '16px 20px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const appsIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '44px',
  height: '44px',
  flexShrink: 0,
  borderRadius: '50%',
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.14)`,
});

export const appsText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const appsTitle = style({ fontWeight: 600, color: vars.color.textPrimary });

export const appsSub = style({ fontSize: '0.85rem', color: vars.color.textMuted });
