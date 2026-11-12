import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useAllRooms } from '@/app/data';
import { themeAtom, themedAppIconAtom } from '@/app/store/atoms';
import { resolveLogoAssets } from '@/theme/themeLogos';

import { getRoomUnreadCount } from '@/util/mentions';

function setFavicon(href: string) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
}

export function useFaviconBadge() {
  const rooms = useAllRooms();
  const theme = useAtomValue(themeAtom);
  const themedAppIcon = useAtomValue(themedAppIconAtom);

  const hasUnread = rooms.some(
    (room) => !room.isInvite && !room.isTombstoned && getRoomUnreadCount(room) > 0
  );

  useEffect(() => {
    const assets = resolveLogoAssets(theme, themedAppIcon);
    const icon = hasUnread ? assets.notification : assets.logo;
    setFavicon(icon);
    window.desktopAPI?.setUnread?.(hasUnread, icon);
  }, [hasUnread, theme, themedAppIcon]);
}
