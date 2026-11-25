import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { MEMBERS_PANEL_WIDTH_DEFAULT, MEMBERS_PANEL_WIDTH_MIN } from '@/const/panelWidths';

const base = {
  width: `${MEMBERS_PANEL_WIDTH_DEFAULT}px`,
  ...backdrop('secondary'),
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
} as const;

export const membersSidebar = style(base);

export const membersSidebarOpen = style({
  ...base,
  position: 'relative',
  flexShrink: 1,
  minWidth: `${MEMBERS_PANEL_WIDTH_MIN}px`,
});

export const membersSidebarClosed = style({
  ...base,
  width: '0px',
  minWidth: '0px',
  flex: '0 0 0px',
  overflow: 'hidden',
  borderLeft: 'none',
  padding: 0,
});

export const membersSidebarHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const membersSidebarTitle = style({
  flex: 1,
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
});

export const membersSidebarClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const membersList = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
});
