import { style, globalStyle } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { fast, med } from '@/theme/animations.css';

export const composerWrap = style({
  ...backdrop('secondary'),
  padding: '0 8px 9px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flexShrink: 0,
  position: 'relative',
});

export const hiddenInput = style({
  display: 'none',
});

export const popoverLayerFixed = style({
  position: 'fixed',
  zIndex: 5000,
});

export const replyPreview = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  padding: '6px 8px 6px 14px',
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: '0.85rem',
  color: vars.color.textMuted,
});

export const replyIcon = style({
  flexShrink: 0,
});

export const replyText = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const replyName = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const replySnippet = style({
  marginLeft: '6px',
});

export const statusStrip = style([replyPreview, { position: 'relative' }]);

export const uploadStrip = style([statusStrip, { paddingBottom: '12px' }]);

export const statusName = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const statusMeta = style({
  marginLeft: '6px',
});

export const uploadProgressTrack = style({
  position: 'absolute',
  left: '14px',
  right: '8px',
  bottom: '4px',
  height: '3px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  overflow: 'hidden',
});

export const uploadProgressFill = style({
  height: '100%',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  transition: `width ${med} ease`,
});

export const replyCancel = style({
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 4px',
  borderRadius: vars.radius.sm,
  ':hover': { color: vars.color.textPrimary, backgroundColor: vars.color.bgHover },
});

const TOOLBAR_GAP = 6;
const TOOLBAR_HEIGHT = 38;
const TOOLBAR_ABOVE = `calc(100% + ${TOOLBAR_HEIGHT + TOOLBAR_GAP}px)`;

export const inputArea = style({
  position: 'relative',
});

export const floatingToolbar = style({
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: `${TOOLBAR_GAP}px`,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 6px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  zIndex: 200,
  pointerEvents: 'auto',
});

export const fmtBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.82rem',
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const fmtBtnActive = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.accent,
  fontSize: '0.82rem',
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
});

export const composerBox = style({
  minWidth: 0,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  transition: `border-color ${fast}, box-shadow ${fast}`,
  ':focus-within': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  minHeight: '48px',
  overflowX: 'hidden',
  padding: '0 14px',
});

export const attachBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.95rem',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const textarea = style({
  flex: 1,
  resize: 'none',
  minHeight: '32px',
  maxHeight: '180px',
  padding: '6px 8px',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  border: 'none',
  outline: 'none',
  fontSize: '0.97rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  overflowY: 'hidden',
  '::placeholder': { color: vars.color.textMuted },
});

// Slate contentEditable editor replacing the textarea in the composer.
export const richEditor = style({
  flex: 1,
  minWidth: 0,
  minHeight: '32px',
  maxHeight: '180px',
  padding: '6px 8px',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  border: 'none',
  outline: 'none',
  fontSize: '0.97rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  overflowY: 'auto',
  overflowX: 'hidden',
  wordBreak: 'break-word',
});

globalStyle(`${richEditor} p`, { margin: 0 });
globalStyle(`${richEditor} p + p`, { marginTop: '2px' });
globalStyle(`${richEditor} blockquote`, {
  margin: '2px 0',
  paddingLeft: '10px',
  borderLeft: `3px solid ${vars.color.accent}`,
  color: vars.color.textMuted,
});
globalStyle(`${richEditor} pre`, {
  margin: '2px 0',
  padding: '4px 8px',
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
  overflowX: 'auto',
});
globalStyle(`${richEditor} code`, {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '3px',
  padding: '1px 4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
});
globalStyle(`${richEditor} a`, {
  color: vars.color.link,
  textDecoration: 'underline',
  cursor: 'pointer',
});
globalStyle(`${richEditor} [data-slate-placeholder]`, {
  color: `${vars.color.textMuted} !important`,
  pointerEvents: 'none',
  userSelect: 'none',
  opacity: '1 !important',
  top: '6px !important',
  left: '8px !important',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
});
globalStyle(`${richEditor} .mention-pill`, {
  display: 'inline-block',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  borderRadius: '4px',
  padding: '0 4px',
  fontSize: '0.9em',
  fontWeight: 600,
  userSelect: 'none',
  cursor: 'default',
});

globalStyle(`${richEditor} .mention-pill.room-mention-pill`, {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 22%, transparent)`,
  color: vars.color.mention,
});

export const sendBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.accent,
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.82rem',
  flexShrink: 0,
  transition: `background-color ${fast}, transform ${fast}`,
  ':hover': { backgroundColor: vars.color.accentHover },
  ':disabled': { opacity: 0.4, cursor: 'not-allowed', transform: 'none' },
});

export const emojiBtn = style([attachBtn]);

export const emojiBtnActive = style([
  attachBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const moreBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.95rem',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const moreBtnActive = style([
  moreBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const linkPopover = style({
  position: 'absolute',
  bottom: TOOLBAR_ABOVE,
  left: 0,
  zIndex: 5000,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
});

export const linkLabel = style({
  fontSize: '0.72rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
});

export const linkInput = style({
  width: '240px',
  padding: '6px 8px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  outline: 'none',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  transition: `border-color ${fast}, box-shadow ${fast}`,
  ':focus': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
  '::placeholder': { color: vars.color.textMuted },
});

export const linkActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '6px',
});

const linkBtnBase = style({
  padding: '5px 14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
  transition: `background-color ${fast}, color ${fast}`,
});

export const linkApply = style([
  linkBtnBase,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
    ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
]);

export const linkCancel = style([
  linkBtnBase,
  {
    backgroundColor: 'transparent',
    color: vars.color.textMuted,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
]);

export const identityStrip = style([statusStrip, { alignItems: 'center', gap: '10px' }]);

export const identityIcon = style({
  flexShrink: 0,
  color: vars.color.warning,
});

export const identityText = style({
  flex: 1,
  minWidth: 0,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});
