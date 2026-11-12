import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '16px',
});

export const columns = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(max(220px, calc(50% - 12px)), 1fr))',
  columnGap: '24px',
});

export const micTest = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px',
});

export const meter = style({
  position: 'relative',
  flex: 1,
  height: '10px',
  borderRadius: '999px',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const meterFill = style({
  position: 'absolute',
  inset: 0,
  transformOrigin: 'left center',
  backgroundColor: vars.color.success,
  transition: 'transform 60ms linear',
});

export const preview = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '12px',
});

export const previewFrame = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  maxWidth: '360px',
  aspectRatio: '16 / 9',
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const previewVideo = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transform: 'scaleX(-1)',
});

export const previewIcon = style({
  color: vars.color.textMuted,
});
