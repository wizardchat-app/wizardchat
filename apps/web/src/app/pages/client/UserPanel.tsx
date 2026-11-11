import { useCallback, useRef } from 'react';
import {
  GearIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
} from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/app/components/Avatar';
import { IconButton } from '@/app/components/Button';
import { settingsOpenAtom, userIdAtom, ownPresenceAtom, userProfileAtom } from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import { DeviceControl } from '@/app/features/calls/DeviceMenu';
import { PushToTalkDot } from '@/app/features/calls/PushToTalkDot';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import { useUserStatusText } from '@/app/features/status/customStatus';
import * as css from './UserPanel.css';

export function UserPanel() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const [, setSettingsOpen] = useAtom(settingsOpenAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const { micMuted, deafened, toggleMic, toggleDeafen } = useGlobalVoiceState();
  const callSnapshot = useCallSnapshot();
  const speaking =
    callSnapshot?.phase === 'joined' &&
    !!callSnapshot.participants.find((p) => p.isLocal)?.speaking;

  const { data: user } = useProfile(userId);
  const displayName = user?.displayName ?? '';
  const avatarMxc = user?.avatarUrl ?? null;
  const statusText = useUserStatusText(client, userId);

  const openOwnProfile = useCallback(() => {
    if (!userId) return;
    const anchor = panelRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setProfile({
      userId,
      roomId: null,
      anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      placement: 'top',
      source: 'userpanel',
    });
  }, [userId, setProfile]);

  const MicIcon = micMuted ? MicrophoneSlashIcon : MicrophoneIcon;
  const micTitle = micMuted ? t('call.unmute') : t('call.mute');
  const deafenTitle = deafened ? t('call.undeafen') : t('call.deafen');

  const syncReady = useSyncReady();
  const presence: PresenceState | undefined = syncReady ? ownPresence : undefined;

  return (
    <div ref={panelRef} className={css.userPanel}>
      <div
        className={css.userPanelIdentity}
        onClick={userId ? openOwnProfile : undefined}
        role={userId ? 'button' : undefined}
        tabIndex={userId ? 0 : undefined}
        onKeyDown={(e) => {
          if (!userId) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          openOwnProfile();
        }}
      >
        <span className={speaking ? css.avatarRingSpeaking : css.avatarRing}>
          <Avatar
            name={displayName}
            mxcUrl={avatarMxc}
            client={client ?? undefined}
            size="sm"
            placeholder="logo"
            presence={presence}
          />
        </span>
        <span className={css.userPanelText}>
          <span className={css.userPanelId}>{displayName}</span>
          {statusText && <span className={css.userPanelStatus}>{statusText}</span>}
        </span>
      </div>
      <div className={css.voiceControls}>
        <DeviceControl kinds={['audioinput']} label={t('call.inputSettings')} variant="panel">
          <IconButton
            size="sm"
            danger={micMuted}
            tooltip={micTitle}
            aria-label={micTitle}
            onClick={toggleMic}
          >
            <PushToTalkDot>
              <MicIcon size={16} />
            </PushToTalkDot>
          </IconButton>
        </DeviceControl>
        <DeviceControl kinds={['audiooutput']} label={t('call.outputSettings')} variant="panel">
          <IconButton
            size="sm"
            danger={deafened}
            tooltip={deafenTitle}
            aria-label={deafenTitle}
            onClick={toggleDeafen}
          >
            <span className={css.deafenStrike}>
              <HeadphonesIcon size={16} />
              {deafened && (
                <span className={css.deafenStrikeSlash}>
                  <span className={css.deafenStrikeOutline} />
                  <span className={css.deafenStrikeCore} />
                </span>
              )}
            </span>
          </IconButton>
        </DeviceControl>
        <IconButton
          size="sm"
          tooltip={t('settings.title')}
          aria-label={t('settings.title')}
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon size={16} />
        </IconButton>
      </div>
    </div>
  );
}
