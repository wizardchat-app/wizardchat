import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { currentRoomIdAtom } from '@/app/store/atoms';
import { notificationSoundsAtom, notificationBannersAtom } from '@/app/store/atoms/settings';
import { showBrowserNotification, playNotificationSound } from '@/app/hooks/useNotifications';
import type { Notification as CoreNotification } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { useSyncReady } from '@/app/hooks/useSync';

export function useClientNotifications() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const navigate = useNavigate();
  const notificationSounds = useAtomValue(notificationSoundsAtom);
  const [notificationBanners, setNotificationBanners] = useAtom(notificationBannersAtom);
  const syncReady = useSyncReady();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const currentRoomIdRef = useRef<string | null>(null);
  const [currentRoomId] = useAtom(currentRoomIdAtom);
  currentRoomIdRef.current = currentRoomId;

  const notificationSoundsRef = useRef(notificationSounds);
  notificationSoundsRef.current = notificationSounds;

  const notificationBannersRef = useRef(notificationBanners);
  notificationBannersRef.current = notificationBanners;

  const tRef = useRef(t);
  tRef.current = t;

  const syncReadyRef = useRef(syncReady);
  syncReadyRef.current = syncReady;

  const notifyForEvent = useRef((notification: CoreNotification) => {
    const mx = getMatrixClientOrNull();
    const myId = mx?.userId();
    if (notification.sender === myId) return;

    const isWindowVisible = document.visibilityState === 'visible';
    const isCurrentRoom = notification.roomId === currentRoomIdRef.current;
    if (isWindowVisible && isCurrentRoom) return;

    const senderName = notification.senderName ?? notification.sender;
    const body = notification.spoiler
      ? tRef.current('common.spoilerNotification')
      : notification.body || tRef.current('common.newMessage');

    if (!isWindowVisible && notificationBannersRef.current) {
      const roomUrl = notification.isDirect
        ? `/dm/${encodeURIComponent(notification.roomId)}`
        : `/r/${encodeURIComponent(notification.roomId)}`;
      showBrowserNotification(
        `${senderName} in ${notification.roomName ?? notification.roomId}`,
        body,
        roomUrl
      );
    }
    playNotificationSound(notificationSoundsRef.current);
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'navigateTo' && typeof event.data.url === 'string') {
        const url = new URL(event.data.url);
        navigateRef.current(url.pathname + url.search + url.hash);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const onOpenRoom = (url: string) => navigateRef.current(url);
    window.desktopAPI?.onOpenRoom?.(onOpenRoom);
    window.desktopAPI
      ?.getPendingRoom?.()
      .then((url) => {
        if (url) navigateRef.current(url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (window.desktopAPI?.showNotification || !('permissions' in navigator)) return;
    navigator.permissions.query({ name: 'notifications' }).then((status) => {
      const handler = () => {
        if (status.state !== 'granted') {
          setNotificationBanners(false);
        }
      };
      status.addEventListener('change', handler);
      return () => status.removeEventListener('change', handler);
    });
  }, [setNotificationBanners]);

  useEffect(() => {
    if (!client) return;
    const subscription = client.watchNotifications((notification) => {
      if (!syncReadyRef.current) return;
      notifyForEvent.current(notification);
    });
    return () => subscription.cancel();
  }, [client]);

  const rooms = useAllRooms();
  const knownInvitesRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const invites = new Set(rooms.filter((r) => r.isInvite).map((r) => r.id));
    const known = knownInvitesRef.current;
    if (!syncReady) return;
    knownInvitesRef.current = invites;
    if (!client || !known) return;
    for (const roomId of invites) {
      if (known.has(roomId)) continue;
      void client
        .inviteInfo(roomId)
        .catch(() => null)
        .then((info) => {
          const inviterName =
            info?.inviterName ??
            (info?.inviterId ? formatUserId(info.inviterId) : null) ??
            t('invite.unknownInviter');

          const msg = t('invite.receivedInviteSimple', { user: inviterName });

          if (document.visibilityState !== 'visible' && notificationBannersRef.current) {
            showBrowserNotification(t('invite.newInvite'), msg);
          }
          playNotificationSound(notificationSoundsRef.current);
        });
    }
  }, [client, rooms, syncReady, t]);
}
