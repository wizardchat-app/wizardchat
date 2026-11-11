import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  HeadphonesIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  SpeakerHighIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  PhoneXIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { callUiAtom, callActionsAtom } from '@/app/store/atoms/call';
import { useRoom } from '@/app/data';
import { useReturnToCall } from './useReturnToCall';
import { useCallTileVisible } from './useCallParticipants';
import { useCallSnapshot } from './stage/useCallSnapshot';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import * as css from './CallBar.css';

export function CallBar() {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const returnToCall = useReturnToCall();
  // Mobile has no user panel, so mute/deafen live here
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { micMuted, deafened, toggleMic, toggleDeafen } = useGlobalVoiceState();

  const roomId = ui.roomId;
  const room = useRoom(roomId);
  const roomName = room?.name ?? roomId ?? '';

  const joined = ui.phase === 'joined';
  const tileVisible = useCallTileVisible();
  const snapshot = useCallSnapshot();
  const status = snapshot?.status;
  const reconnecting = status === 'reconnecting';
  const connected = joined && tileVisible && status === 'connected';
  const CamIcon = ui.isVideoMuted ? VideoCameraSlashIcon : VideoCameraIcon;
  const videoTitle = ui.isVideoMuted ? t('call.cameraOff') : t('call.cameraOn');
  const shareTitle = ui.isScreenSharing ? t('call.stopShare') : t('call.shareScreen');

  if (!roomId) return null;

  return (
    <div className={css.bar}>
      <div className={css.info}>
        <div className={connected ? css.statusRow : css.statusRowConnecting}>
          <SpeakerHighIcon size={14} weight="fill" />
          <span className={css.callStatus}>
            {reconnecting
              ? t('call.statusReconnecting')
              : connected
                ? t('call.statusConnected')
                : t('call.statusConnecting')}
          </span>
        </div>
        <button type="button" className={css.callerName} onClick={returnToCall}>
          {roomName}
        </button>
      </div>

      <div className={css.controls}>
        {isMobile && (
          <>
            <button
              type="button"
              className={micMuted ? css.ctrlMuted : css.ctrl}
              onClick={toggleMic}
              aria-label={micMuted ? t('call.unmute') : t('call.mute')}
              aria-pressed={micMuted}
            >
              {micMuted ? <MicrophoneSlashIcon size={16} /> : <MicrophoneIcon size={16} />}
            </button>
            <button
              type="button"
              className={deafened ? css.ctrlMuted : css.ctrl}
              onClick={toggleDeafen}
              aria-label={deafened ? t('call.undeafen') : t('call.deafen')}
              aria-pressed={deafened}
            >
              <HeadphonesIcon size={16} weight={deafened ? 'fill' : 'regular'} />
            </button>
          </>
        )}
        <Tooltip content={videoTitle}>
          <button
            type="button"
            className={ui.isVideoMuted ? css.ctrl : css.ctrlActive}
            onClick={() => actions?.toggleVideo()}
            aria-label={videoTitle}
          >
            {ui.isVideoMuted ? <CamIcon size={16} /> : <CamIcon size={16} weight="fill" />}
          </button>
        </Tooltip>

        <Tooltip content={shareTitle}>
          <button
            type="button"
            className={ui.isScreenSharing ? css.ctrlActive : css.ctrl}
            onClick={() => actions?.toggleScreenshare()}
            aria-label={shareTitle}
            aria-pressed={ui.isScreenSharing}
          >
            <MonitorArrowUpIcon size={16} weight={ui.isScreenSharing ? 'fill' : 'regular'} />
          </button>
        </Tooltip>

        <Tooltip content={t('call.hangup')}>
          <button
            type="button"
            className={css.leaveBtn}
            onClick={() => actions?.hangup()}
            aria-label={t('call.hangup')}
          >
            <PhoneXIcon size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
