import { style, styleVariants, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

const spin = keyframes({
  to: { transform: 'rotate(360deg)' },
});

const base = style({
  borderRadius: '50%',
  borderStyle: 'solid',
  borderColor: vars.color.border,
  borderTopColor: vars.color.accent,
  animationName: spin,
  animationDuration: '0.8s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  flexShrink: 0,
  selectors: {
    'html.reduce-motion &': {
      animationDuration: '0.8s !important',
      animationIterationCount: 'infinite !important',
    },
  },
});

export const sizes = styleVariants({
  sm: [base, { width: '16px', height: '16px', borderWidth: '2px' }],
  md: [base, { width: '24px', height: '24px', borderWidth: '2px' }],
  lg: [base, { width: '32px', height: '32px', borderWidth: '3px' }],
  xl: [base, { width: '36px', height: '36px', borderWidth: '3px' }],
});

export const wrap = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
});
