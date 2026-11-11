import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const body = style({
  height: '70vh',
  display: 'flex',
  flexDirection: 'column',
});

export const status = style({
  margin: 'auto',
  color: vars.color.textMuted,
});

export const text = style({
  flex: 1,
  margin: 0,
  overflow: 'auto',
  padding: '12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontFamily: 'monospace',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

export const markdown = style({
  flex: 1,
  overflow: 'auto',
  padding: '4px 4px 12px',
  color: vars.color.textPrimary,
  lineHeight: 1.55,
  overflowWrap: 'anywhere',
});

globalStyle(`${markdown} h1, ${markdown} h2, ${markdown} h3`, {
  margin: '1em 0 0.5em',
  lineHeight: 1.3,
});

globalStyle(`${markdown} pre`, {
  padding: '10px',
  overflowX: 'auto',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
});

globalStyle(`${markdown} code`, {
  fontFamily: 'monospace',
  fontSize: '0.9em',
});

globalStyle(`${markdown} blockquote`, {
  margin: '0.5em 0',
  paddingLeft: '12px',
  borderLeft: `3px solid ${vars.color.border}`,
  color: vars.color.textMuted,
});

globalStyle(`${markdown} table`, {
  borderCollapse: 'collapse',
});

globalStyle(`${markdown} th, ${markdown} td`, {
  padding: '4px 8px',
  border: `1px solid ${vars.color.border}`,
});

globalStyle(`${markdown} a`, {
  color: vars.color.link,
});

export const pdf = style({
  flex: 1,
  width: '100%',
  border: 'none',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
});
