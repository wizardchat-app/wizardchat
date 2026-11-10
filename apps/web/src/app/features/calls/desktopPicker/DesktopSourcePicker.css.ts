import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const tabs = style({
  display: 'flex',
  gap: '4px',
  marginBottom: '4px',
});

export const tab = style({
  padding: '6px 12px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.88rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const tabActive = style([
  tab,
  { backgroundColor: vars.color.bgActive, color: vars.color.textPrimary },
]);

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '10px',
  maxHeight: '420px',
  overflowY: 'auto',
});

export const source = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '6px',
  borderRadius: vars.radius.md,
  border: '2px solid transparent',
  background: 'none',
  cursor: 'pointer',
  color: vars.color.textPrimary,
  textAlign: 'left',
  transition: `background-color ${fast}, border-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const sourceSelected = style([source, { borderColor: vars.color.accent }]);

export const thumbnail = style({
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  borderRadius: vars.radius.sm,
  backgroundColor: '#000',
});

export const sourceName = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  fontSize: '0.82rem',
});

export const appIcon = style({ width: '16px', height: '16px', flexShrink: 0 });

export const sourceNameText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const audioToggle = style({
  marginRight: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.textPrimary,
  fontSize: '0.88rem',
  cursor: 'pointer',
});

export const window = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
});

export const windowBody = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '14px 16px 0',
});

globalStyle(`${windowBody} ${grid}`, { flex: 1, maxHeight: 'none', alignContent: 'start' });

export const windowFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 16px',
  borderTop: `1px solid ${vars.color.border}`,
});
