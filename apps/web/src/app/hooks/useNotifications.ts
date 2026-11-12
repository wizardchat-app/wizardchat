import { playVoiceSound } from '@/app/features/voice/voiceSounds';
import { getThemeLogoAssets } from '@/theme/themeLogos';

export type NotifLevel = 'default' | 'all' | 'mentions' | 'mute';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (window.desktopAPI?.showNotification) return 'granted';
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function playNotificationSound(soundEnabled: boolean): void {
  if (!soundEnabled) return;
  playVoiceSound('alert');
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistrationPromise) return swRegistrationPromise;
  if (!('serviceWorker' in navigator)) {
    swRegistrationPromise = Promise.resolve(null);
    return swRegistrationPromise;
  }
  swRegistrationPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      await reg.update();

      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      return reg;
    } catch (err) {
      console.warn('[useNotifications] service worker registration failed', err);
      return null;
    }
  })();
  return swRegistrationPromise;
}

const taggedNotifications = new Map<string, Notification>();

export async function showBrowserNotification(
  title: string,
  body: string,
  roomUrl?: string,
  icon = getThemeLogoAssets().notification,
  tag?: string
): Promise<void> {
  if (window.desktopAPI?.showNotification) {
    try {
      const shown = await window.desktopAPI.showNotification({
        title,
        body,
        icon,
        silent: true,
        roomUrl,
      });
      if (shown !== false) return;
    } catch (err) {
      console.warn('[useNotifications] desktop showNotification failed, falling back', err);
    }
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const data = roomUrl ? { url: roomUrl } : undefined;

  const reg = await registerNotificationServiceWorker();
  if (reg) {
    try {
      await reg.showNotification(title, { body, icon, silent: true, data, tag });
      return;
    } catch (err) {
      console.warn('[useNotifications] SW showNotification failed, falling back', err);
    }
  }

  try {
    const n = new Notification(title, { body, icon, silent: true, data, tag });
    if (tag) taggedNotifications.set(tag, n);
    n.onclick = roomUrl
      ? () => {
          window.focus();
          window.location.href = roomUrl;
        }
      : null;
    n.onerror = () => {};
  } catch {
    // ignore
  }
}

/** Closes a notification shown with `tag`; desktop notifications can't be withdrawn */
export async function closeBrowserNotification(tag: string): Promise<void> {
  taggedNotifications.get(tag)?.close();
  taggedNotifications.delete(tag);
  if (!('serviceWorker' in navigator) || !swRegistrationPromise) return;
  const reg = await swRegistrationPromise;
  const shown = await reg?.getNotifications({ tag }).catch(() => []);
  for (const notification of shown ?? []) notification.close();
}
