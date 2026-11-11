import { globalStyle, style } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';
import { spacesList } from './SpacesList.css';
import { bottomDock, roomList } from './RoomListPanel.css';
import { NATIVE_TAB_BAR, TAB_BAR_HEIGHT } from './MobileTabBar.css';
import { navList } from '@/app/components/Settings/Settings.css';

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
  '@media': {
    '(max-width: 768px)': { paddingTop: 0 },
  },
});

export const sidebar = style({
  display: 'flex',
  flexShrink: 0,
  height: '100%',
  overflow: 'hidden',
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'calc(48px + env(safe-area-inset-top))',
      bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
      height: 'auto',
      zIndex: 5000,
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      ...backdrop('primary'),
      transform: 'translateX(-100%)',
      transition: `transform ${med} ease`,
    },
  },
});

export const sidebarNoRail = style({});
globalStyle(`${sidebarNoRail} ${spacesList}`, {
  '@media': { '(max-width: 768px)': { display: 'none' } },
});
globalStyle(`${sidebarNoRail} ${bottomDock}`, {
  '@media': { '(max-width: 768px)': { marginLeft: '8px' } },
});

export const sidebarOpen = style({
  '@media': {
    '(max-width: 768px)': {
      transform: 'translateX(0)',
    },
  },
});

export const mainContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
  ...backdrop('secondary'),
});

export const mainContentHidden = style({
  '@media': {
    '(min-width: 769px)': {
      display: 'none',
    },
  },
});

export const homeLayout = style({
  display: 'flex',
  height: '100%',
  minHeight: 0,
});

export const panelDrawerOverlay = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

export const membersDrawerOverlay = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

export const drawerOverlay = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

export const mobileInbox = style({
  position: 'fixed',
  left: 0,
  right: 0,
  top: 'calc(48px + env(safe-area-inset-top))',
  bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
  zIndex: 5000,
  paddingLeft: 'env(safe-area-inset-left)',
  paddingRight: 'env(safe-area-inset-right)',
  ...backdrop('primary'),
});

const UNDER_TAB_BAR = `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`;
const mobileOnly = (rule: Record<string, string>) => ({ '@media': { '(max-width: 768px)': rule } });
globalStyle(
  `${NATIVE_TAB_BAR} ${sidebar}, ${NATIVE_TAB_BAR} ${mobileInbox}`,
  mobileOnly({ bottom: '0' })
);
globalStyle(`${NATIVE_TAB_BAR} ${roomList}`, mobileOnly({ paddingBottom: UNDER_TAB_BAR }));
globalStyle(
  `${NATIVE_TAB_BAR} ${spacesList}`,
  mobileOnly({ paddingBottom: `calc(var(--bottom-dock-inset, 72px) + ${UNDER_TAB_BAR})` })
);
globalStyle(
  `${NATIVE_TAB_BAR} ${bottomDock}`,
  mobileOnly({ marginBottom: `calc(${UNDER_TAB_BAR} + 8px)` })
);
globalStyle(`${NATIVE_TAB_BAR} ${mobileInbox} ${navList}`, { paddingBottom: UNDER_TAB_BAR });
globalStyle(`${mobileInbox} ${navList}`, { height: '100%' });
