import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { uiSize, uiZoom } from '@/theme/uiDensity';

export const membersListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
});

export const membersScrollArea = style({
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
});

export const memberRow = style({
  zoom: uiZoom,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: `calc((${uiSize('memberRow')} - 28px) / 2) 12px`,
  borderRadius: vars.radius.sm,
  margin: '0 4px',
  cursor: 'default',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const memberName = style({
  fontSize: '0.88rem',
  color: vars.color.textPrimary,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const memberText = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  flex: 1,
  minWidth: 0,
});

export const memberNameStacked = style([memberName, { flex: 'none', lineHeight: '16px' }]);

export const memberStatus = style({
  fontSize: '0.7rem',
  lineHeight: '12px',
  color: vars.color.textMuted,
  opacity: 0.8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const emptyState = style({
  padding: '16px',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textAlign: 'center',
});

const skeletonPulseKeyframes = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

const skeletonPulse = style({
  animation: `${skeletonPulseKeyframes} 1.4s ease-in-out infinite`,
});

export const skeletonList = style({
  padding: '0 12px',
});

export const skeletonRow = style([
  skeletonPulse,
  {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 0',
  },
]);

export const skeletonAvatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonLine = style({
  height: '12px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  flex: 1,
  maxWidth: '140px',
});

export const roleHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 12px',
  userSelect: 'none',
});

export const roleHeaderLabel = style({
  zoom: uiZoom,
  fontSize: '0.75rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const roleHeaderCount = style({
  zoom: uiZoom,
  fontSize: '0.75rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  opacity: 0.7,
  flexShrink: 0,
});
