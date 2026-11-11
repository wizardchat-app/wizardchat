import { DEFAULT_THEME } from './themes.css';
import { STORAGE_KEY_PREFERENCES, STORAGE_KEY_THEME } from '@/const/storageKeys';
import type { ThemeName } from '@/app/store/atoms/settings';

export interface ThemeLogoAssets {
  logo: string;
  notification: string;
}

const BASE_ASSETS: ThemeLogoAssets = {
  logo: '/assets/images/logo.svg',
  notification: '/assets/images/logo-notification.svg',
};

export const THEME_LOGO_ASSETS: Record<ThemeName, ThemeLogoAssets> = {
  Carbon: BASE_ASSETS,
  Custom: BASE_ASSETS,
  Parrot: {
    logo: '/assets/images/logo_parrot.svg',
    notification: '/assets/images/logo-notification_parrot.svg',
  },
  Hallow: {
    logo: '/assets/images/logo_hallow.svg',
    notification: '/assets/images/logo-notification_hallow.svg',
  },
  Ethereal: {
    logo: '/assets/images/logo_ethereal.svg',
    notification: '/assets/images/logo-notification_ethereal.svg',
  },
  Pewter: {
    logo: '/assets/images/logo_pewter.svg',
    notification: '/assets/images/logo-notification_pewter.svg',
  },
  Umbra: {
    logo: '/assets/images/logo_umbra.svg',
    notification: '/assets/images/logo-notification_umbra.svg',
  },
  Eclipse: {
    logo: '/assets/images/logo_eclipse.svg',
    notification: '/assets/images/logo-notification_eclipse.svg',
  },
  Garnet: {
    logo: '/assets/images/logo_garnet.svg',
    notification: '/assets/images/logo-notification_garnet.svg',
  },
  Blossom: {
    logo: '/assets/images/logo_blossom.svg',
    notification: '/assets/images/logo-notification_blossom.svg',
  },
};

export function hasThemedLogo(theme: ThemeName): boolean {
  return THEME_LOGO_ASSETS[theme] !== BASE_ASSETS;
}

export function resolveLogoAssets(theme: ThemeName, themedAppIcon: boolean): ThemeLogoAssets {
  return themedAppIcon ? THEME_LOGO_ASSETS[theme] : BASE_ASSETS;
}

function readThemedAppIcon(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}');
    return prefs?.themedAppIcon === true;
  } catch {
    return false;
  }
}

export function getThemeLogoAssets(): ThemeLogoAssets {
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  const theme = stored && stored in THEME_LOGO_ASSETS ? (stored as ThemeName) : DEFAULT_THEME;
  return resolveLogoAssets(theme, readThemedAppIcon());
}
