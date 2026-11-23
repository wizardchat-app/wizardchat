import { globalStyle, keyframes } from '@vanilla-extract/css';
import { vars } from './vars.css';
import { TOUCH_FIRST_QUERY } from './uiDensity';

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

globalStyle('.icon-spin', {
  animation: `${spin} 1s linear infinite`,
});

globalStyle('html', {
  fontSize: '16px',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
});

globalStyle('body', {
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgPrimary,
  lineHeight: '1.5',
});

globalStyle('body', {
  '@media': {
    [TOUCH_FIRST_QUERY]: {
      WebkitTouchCallout: 'none',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    },
  },
});

globalStyle('input, textarea, [contenteditable]:not([contenteditable="false"])', {
  '@media': {
    [TOUCH_FIRST_QUERY]: {
      WebkitTouchCallout: 'default',
      WebkitUserSelect: 'text',
      userSelect: 'text',
    },
  },
});

globalStyle('#root', {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

globalStyle('*', {
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

globalStyle('::-webkit-scrollbar', {
  width: '6px',
  height: '6px',
});

globalStyle('::-webkit-scrollbar-track', {
  background: 'transparent',
});

globalStyle('::-webkit-scrollbar-thumb', {
  background: vars.color.border,
  borderRadius: '3px',
  border: '1px solid transparent',
  backgroundClip: 'content-box',
});

globalStyle('::-webkit-scrollbar-thumb:hover', {
  background: vars.color.accent,
});

globalStyle('::selection', {
  backgroundColor: vars.color.accent,
  color: '#fff',
});

globalStyle(
  ':where(:focus-visible:not([tabindex="-1"], textarea, [contenteditable], input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"])))',
  {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  }
);

globalStyle('a', {
  color: vars.color.link,
});

globalStyle('a:hover', {
  textDecoration: 'underline',
});

globalStyle('html.reduce-motion *, html.reduce-motion *::before, html.reduce-motion *::after', {
  animationDuration: '0.01ms !important',
  animationIterationCount: '1 !important',
  transitionDuration: '0.01ms !important',
  transitionDelay: '0ms !important',
});

globalStyle('html.reduce-motion .icon-spin', {
  animationDuration: '1s !important',
  animationIterationCount: 'infinite !important',
});

globalStyle('html.reduce-motion', {
  scrollBehavior: 'auto',
});
