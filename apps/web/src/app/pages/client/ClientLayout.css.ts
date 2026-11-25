import { style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { SPACES_LIST_WIDTH } from './SpacesList.css';
import { ROOM_LIST_WIDTH_MIN, TIMELINE_WIDTH_MIN } from '@/const/panelWidths';

export const appFrame = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: vars.color.bgPrimary,
});

export const appShell = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
  ...backdrop('primary'),
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  padding:
    'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
});

export const sidebar = style({
  display: 'flex',
  flexShrink: 1,
  minWidth: `${SPACES_LIST_WIDTH + ROOM_LIST_WIDTH_MIN}px`,
  height: '100%',
  overflow: 'hidden',
});

export const mainContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: `${TIMELINE_WIDTH_MIN}px`,
  overflow: 'hidden',
  position: 'relative',
  ...backdrop('secondary'),
});

export const mainContentHidden = style({
  display: 'none',
});

export const homeLayout = style({
  display: 'flex',
  height: '100%',
  minHeight: 0,
});
