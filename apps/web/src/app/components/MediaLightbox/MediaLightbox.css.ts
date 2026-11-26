import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fadeIn, fast } from '@/theme/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.85)',
  zIndex: 8000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  touchAction: 'none',
  animation: `${fadeIn} ${fast} ease`,
});

export const mediaWrap = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  maxWidth: '90vw',
  maxHeight: '90vh',
  position: 'relative',
});

export const spoilerSlide = style({
  position: 'relative',
  width: 'min(80vw, 560px)',
  height: 'min(70vh, 420px)',
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
  backgroundColor: 'rgba(0,0,0,0.35)',
});

export const image = style({
  maxWidth: '90vw',
  maxHeight: '90vh',
  objectFit: 'contain',
  borderRadius: vars.radius.sm,
  userSelect: 'none',
  transformOrigin: '0 0',
  touchAction: 'none',
});

export const imagePannable = style({
  cursor: 'grab',
  ':active': {
    cursor: 'grabbing',
  },
});

export const video = style({
  maxWidth: '90vw',
  maxHeight: '90vh',
  borderRadius: vars.radius.sm,
  backgroundColor: '#000',
  outline: 'none',
});

export const closeBtn = style({
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: 'rgba(0,0,0,0.5)',
  color: '#fff',
  fontSize: '1.5rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 8001,
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
});

export const toolbar = style({
  position: 'fixed',
  bottom: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: '6px 12px',
  borderRadius: vars.radius.md,
  zIndex: 8001,
  color: '#fff',
  fontSize: '14px',
  userSelect: 'none',
});

export const toolbarMeta = style({
  display: 'flex',
  flexDirection: 'column',
  lineHeight: 1.3,
  marginRight: '4px',
});

export const senderName = style({
  fontWeight: 600,
  fontSize: '13px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '160px',
});

export const imageName = style({
  fontSize: '11px',
  opacity: 0.7,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '160px',
});

export const zoomBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '6px',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: 1,
  ':hover': {
    background: 'rgba(255,255,255,0.25)',
  },
  ':disabled': {
    opacity: 0.35,
    cursor: 'default',
  },
});

export const zoomLabel = style({
  fontSize: '13px',
  fontWeight: 600,
  opacity: 0.85,
  minWidth: '44px',
  textAlign: 'center',
  border: 'none',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '4px',
  ':hover': {
    background: 'rgba(255,255,255,0.15)',
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.85,
  },
});

export const downloadBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: 'none',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  padding: '4px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
  textDecoration: 'none',
  ':hover': {
    background: 'rgba(255,255,255,0.25)',
    textDecoration: 'none',
  },
});

export const actionBtn = style([downloadBtn]);

export const counter = style({
  fontSize: '12px',
  opacity: 0.8,
  marginRight: '4px',
  minWidth: '40px',
  textAlign: 'center',
});

export const navBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '6px',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  cursor: 'pointer',
  marginRight: '5px',
  ':hover': {
    background: 'rgba(255,255,255,0.25)',
  },
});

export const loading = style({
  minWidth: '120px',
  minHeight: '120px',
  borderRadius: vars.radius.sm,
  backgroundColor: 'rgba(255,255,255,0.15)',
  animation: `${fadeIn} 1.2s ease infinite alternate`,
});
