import { useQuery } from '@tanstack/react-query';
import { GITLAB_URL } from '@/const/links';

const FEED_URL =
  'https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/';

export const RELEASES_URL = `${GITLAB_URL}/-/releases`;
export const ANDROID_BETA_URL = 'https://wizardchat.org/android-beta/';
export const WEB_APP_URL = 'https://app.wizardchat.org';
export const ANDROID_OPTIONS_URL = `${GITLAB_URL}#android`;
export const IOS_OPTIONS_URL = `${GITLAB_URL}#ios`;

export type DesktopAsset =
  'windows' | 'mac-arm' | 'mac-intel' | 'appimage' | 'deb' | 'rpm' | 'arch' | 'tarball';

export interface ReleaseAssets {
  version: string;
  links: Record<DesktopAsset, string>;
}

interface Feed {
  version?: string;
  platforms?: Record<string, { url?: string }>;
}

function assetsFrom(feed: Feed): ReleaseAssets {
  const url = (key: string) => feed.platforms?.[key]?.url;
  const dir = (url('windows-x86_64') ?? url('linux-x86_64') ?? '').replace(/[^/]*$/, '');
  const v = feed.version;
  if (!v || !dir || v.includes('-next')) throw new Error('Unexpected release feed');
  return {
    version: v,
    links: {
      windows: url('windows-x86_64') ?? RELEASES_URL,
      'mac-arm': `${dir}WizardChat_${v}_aarch64.dmg`,
      'mac-intel': `${dir}WizardChat_${v}_x64.dmg`,
      appimage: url('linux-x86_64') ?? RELEASES_URL,
      deb: url('linux-x86_64-deb') ?? RELEASES_URL,
      rpm: url('linux-x86_64-rpm') ?? RELEASES_URL,
      arch: `${dir}wizardchat-bin-${v.replace(/-/g, '_')}-1-x86_64.pkg.tar.zst`,
      tarball: `${dir}wizardchat-${v}-linux-x86_64.tar.gz`,
    },
  };
}

export function useReleaseAssets(enabled: boolean) {
  return useQuery({
    queryKey: ['release-feed', 'stable'],
    queryFn: async () => {
      const res = await fetch(`${FEED_URL}stable/latest.json`);
      if (!res.ok) throw new Error(`Release feed: ${res.status}`);
      return assetsFrom((await res.json()) as Feed);
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export type DesktopPlatform = 'windows' | 'mac' | 'linux';

export function detectDesktopPlatform(): DesktopPlatform | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return null;
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Linux|X11/.test(ua)) return 'linux';
  return null;
}
