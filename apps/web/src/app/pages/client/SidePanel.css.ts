import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { THREAD_PANEL_WIDTH_DEFAULT, THREAD_PANEL_WIDTH_MIN } from '@/const/panelWidths';

const base = {
  width: `${THREAD_PANEL_WIDTH_DEFAULT}px`,
  position: 'relative',
  ...backdrop('secondary'),
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 1,
  minWidth: `${THREAD_PANEL_WIDTH_MIN}px`,
} as const;

export const sidePanel = style(base);

export const sidePanelOpen = style({
  ...base,
  flexShrink: 1,
  minWidth: `${THREAD_PANEL_WIDTH_MIN}px`,
});

export const sidePanelExpanded = style({
  flexGrow: 1,
});

export const sidePanelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const sidePanelTitle = style({
  fontSize: 'inherit',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sidePanelClose = style({
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
