import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

const CONTROL_BAR_SPACE = 76;

export const panel = style({
  position: 'absolute',
  top: '12px',
  right: '12px',
  bottom: `${CONTROL_BAR_SPACE}px`,
  zIndex: 80,
  width: 'min(360px, calc(100% - 24px))',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  pointerEvents: 'auto',
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 10px 6px 14px',
});

export const heading = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '8px',
  fontSize: '0.95rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const count = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
});

export const headerActions = style({
  display: 'inline-flex',
  gap: '2px',
});

export const action = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const actionDanger = style([action, { ':hover': { color: vars.color.danger } }]);

export const actionDestructive = style([
  action,
  { color: vars.color.danger, ':hover': { color: vars.color.danger } },
]);

export const sectionRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingRight: '4px',
});

export const addRow = style({
  display: 'flex',
  gap: '6px',
  padding: '4px 12px 8px',
});

export const addInput = style({
  flex: 1,
  minWidth: 0,
  height: '34px',
  padding: '0 10px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  outline: 'none',
  ':focus': { borderColor: vars.color.accent },
  '::placeholder': { color: vars.color.textMuted },
});

export const addButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '56px',
  height: '34px',
  padding: '0 12px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.accentHover },
  ':disabled': { opacity: 0.5, cursor: 'default' },
});

export const notice = style({
  padding: '0 14px 8px',
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const noticeError = style([notice, { color: vars.color.error }]);

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 6px 10px',
});

export const sectionLabel = style({
  padding: '10px 8px 4px',
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const row = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 6px 6px 2px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const rowDragging = style([
  row,
  { zIndex: 1, backgroundColor: vars.color.bgActive, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' },
]);

export const rowCurrent = style([row, { paddingLeft: '8px', ':hover': {} }]);

export const rowPlayed = style([row, { paddingLeft: '8px', opacity: 0.75 }]);

export const handle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '32px',
  flexShrink: 0,
  color: vars.color.textMuted,
  cursor: 'grab',
  touchAction: 'none',
});

export const thumb = style({
  width: '64px',
  height: '36px',
  flexShrink: 0,
  objectFit: 'cover',
  borderRadius: '4px',
  backgroundColor: '#000',
});

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
});

export const title = style({
  fontSize: '0.82rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const titleCurrent = style([title, { color: vars.color.accent }]);

export const meta = style({
  fontSize: '0.72rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const actions = style({
  display: 'none',
  flexShrink: 0,
  selectors: {
    [`${row}:hover &, ${row}:focus-within &`]: { display: 'inline-flex' },
  },
});

export const empty = style({
  padding: '6px 8px',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const historyToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  margin: '10px 0 4px',
  padding: '4px 8px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  ':hover': { color: vars.color.textPrimary },
});
