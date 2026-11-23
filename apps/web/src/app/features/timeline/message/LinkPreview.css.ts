import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { pulse } from '@/theme/animations.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  marginTop: '8px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  overflow: 'hidden',
  maxWidth: '360px',
  textDecoration: 'none',
  color: 'inherit',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const image = style({
  width: '100%',
  maxHeight: '180px',
  objectFit: 'cover',
  display: 'block',
  backgroundColor: vars.color.bgTertiary,
});

export const imagePlaceholder = style([
  image,
  {
    aspectRatio: '1.91 / 1',
    animation: `${pulse} 1.5s ease-in-out infinite`,
  },
]);

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 10px',
  minWidth: 0,
});

export const title = style({
  fontSize: '13px',
  fontWeight: 600,
  color: vars.color.textPrimary,
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.35',
  ':hover': {
    textDecoration: 'none',
  },
});

export const description = style({
  fontSize: '12px',
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.4',
});

export const siteName = style({
  fontSize: '11px',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: '2px',
});

globalStyle(`${card} a`, {
  textDecoration: 'none',
});
globalStyle(`${card} a:hover`, {
  textDecoration: 'none',
});
