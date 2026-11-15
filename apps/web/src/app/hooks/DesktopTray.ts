import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useRoom } from '@/app/data';
import { callActionsAtom, callSessionAtom } from '@/app/store/atoms/call';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';

export function DesktopTray() {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const actions = useAtomValue(callActionsAtom);
  const room = useRoom(session?.roomId ?? null);
  const [updateReady, setUpdateReady] = useState(false);
  const handlers = useRef(actions);
  handlers.current = actions;

  useEffect(() => {
    window.desktopAPI?.onUpdateDownloaded?.(() => setUpdateReady(true));
  }, []);

  useEffect(
    () =>
      window.desktopAPI?.onTrayAction?.((action) => {
        const call = handlers.current;
        if (action === 'mute') call?.toggleMute();
        else if (action === 'deafen') call?.toggleDeafen();
        else if (action === 'leave-call') call?.hangup();
      }),
    []
  );

  const inCall = !!session && !!snapshot;
  const roomName = room?.name ?? '';
  const muted = !!snapshot && !snapshot.microphone;
  const deafened = !!snapshot?.deafened;

  useEffect(() => {
    window.desktopAPI?.setTrayState?.({
      labels: {
        open: t('settings.desktop.trayOpen'),
        quit: t('settings.desktop.trayQuit'),
        mute: t('call.mute'),
        deafen: t('call.deafen'),
        leaveCall: t('call.leave'),
        restartToUpdate: t('settings.desktop.trayRestartToUpdate'),
      },
      call: inCall
        ? { title: t('settings.desktop.trayInCall', { room: roomName }), muted, deafened }
        : null,
      updateReady,
    });
  }, [t, inCall, roomName, muted, deafened, updateReady]);

  return null;
}
