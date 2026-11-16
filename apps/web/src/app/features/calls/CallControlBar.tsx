import { useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Toggle } from '@/app/components/Toggle';
import { useTranslation } from 'react-i18next';
import {
  ArrowSquareOutIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ChatTextIcon,
  ClipboardTextIcon,
  CornersInIcon,
  CornersOutIcon,
  DotsThreeVerticalIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PhoneXIcon,
  PresentationIcon,
  SmileyIcon,
  SquaresFourIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  VinylRecordIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Popover } from '@/app/components/Popover';
import {
  callActionsAtom,
  callEffectiveViewAtom,
  callIsVoiceRoomAtom,
  callPanelAtom,
  callUiAtom,
  callSessionAtom,
  showNonVideoParticipantsAtom,
} from '@/app/store/atoms/call';
import {
  openRoomChatAtom,
  closeRoomChatAtom,
  roomChatPanelOpenAtom,
  roomChatRoomIdAtom,
} from '@/app/store/atoms';
import { DeviceControl } from './DeviceMenu';
import { PushToTalkDot } from './PushToTalkDot';
import { useCallSnapshot } from './stage/useCallSnapshot';
import { useCallContainer } from './CallContainer';
import {
  watchActionsAtom,
  watchDialogOpenAtom,
  watchQueueOpenAtom,
  watchStateAtom,
} from './watchTogether/watchTogether';
import * as css from './CallControlBar.css';
import * as layoutCss from './CallLayer.css';

export function CallControlBar() {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const view = useAtomValue(callEffectiveViewAtom);
  const isVoiceCall = useAtomValue(callIsVoiceRoomAtom);
  const callSession = useAtomValue(callSessionAtom);
  const panel = useAtomValue(callPanelAtom);
  const [showNonVideo, setShowNonVideo] = useAtom(showNonVideoParticipantsAtom);
  const callSnapshot = useCallSnapshot();
  const status = callSnapshot?.status ?? 'joiningMedia';
  const roomChatOpen = useAtomValue(roomChatPanelOpenAtom);
  const roomChatRoomId = useAtomValue(roomChatRoomIdAtom);
  const openRoomChat = useSetAtom(openRoomChatAtom);
  const closeRoomChat = useSetAtom(closeRoomChatAtom);
  const menuBtnRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const watching = !!useAtomValue(watchStateAtom);
  const [queueOpen, setQueueOpen] = useAtom(watchQueueOpenAtom);
  const watchActions = useAtomValue(watchActionsAtom);
  const hasVideo =
    (watching && !!watchActions) ||
    !!callSnapshot?.participants.some((p) => p.camera || p.screenShared);
  const openWatchDialog = useSetAtom(watchDialogOpenAtom);
  const { containerRef } = useCallContainer();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === document.documentElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen();
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const on = isFullscreen && (view === 'docked' || view === 'fullscreen');
    el?.classList.toggle(layoutCss.trueFullscreen, on);
    if (isFullscreen && !on) void document.exitFullscreen();
    return () => el?.classList.remove(layoutCss.trueFullscreen);
  }, [containerRef, isFullscreen, view]);

  if (!actions) return null;

  const micTitle = ui.isMuted ? t('call.unmute') : t('call.mute');
  const cameraTitle = ui.isVideoMuted ? t('call.cameraOff') : t('call.cameraOn');
  const shareTitle = ui.isScreenSharing ? t('call.stopShare') : t('call.shareScreen');
  const viewTitle = ui.isSpotlight ? t('call.switchToGrid') : t('call.switchToSpotlight');
  const closeMenu = () => setMenuOpen(false);
  const expandTitle = view === 'docked' ? t('common.expand') : t('common.collapse');
  const fullscreenTitle = isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen');
  const toggleFullscreen = () => {
    if (isFullscreen) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  const watchTitle = watching ? t('call.watchTogether.queue.title') : t('call.watchTogether.name');

  const chatRoomId = ui.roomId;
  const chatOpen = roomChatOpen && roomChatRoomId === chatRoomId;
  const chatTitle = chatOpen ? t('common.close') : t('room.openChat');
  const toggleChat = () => {
    if (!chatRoomId) return;
    if (chatOpen) closeRoomChat();
    else openRoomChat(chatRoomId);
  };

  return (
    <>
      {view !== 'tile' && !isFullscreen && (isVoiceCall || view === 'fullscreen') && (
        <div className={css.chatCorner}>
          <Tooltip content={chatTitle}>
            <button
              type="button"
              className={chatOpen ? css.ctrlAccent : css.ctrl}
              onClick={toggleChat}
              aria-label={chatTitle}
              aria-pressed={chatOpen}
            >
              <ChatTextIcon size={20} />
            </button>
          </Tooltip>
        </div>
      )}
      {(view === 'docked' || view === 'fullscreen') && (
        <div className={css.viewCorner}>
          <Tooltip content={t('call.popOut')}>
            <button
              type="button"
              className={css.ctrl}
              onClick={() => actions.setPresentation('tile')}
              aria-label={t('call.popOut')}
            >
              <ArrowSquareOutIcon size={20} />
            </button>
          </Tooltip>
          {!isVoiceCall && (
            <Tooltip content={expandTitle}>
              <button
                type="button"
                className={css.ctrl}
                onClick={() => actions.setPresentation(view === 'docked' ? 'fullscreen' : 'room')}
                aria-label={expandTitle}
              >
                {view === 'docked' ? (
                  <ArrowsOutSimpleIcon size={20} />
                ) : (
                  <ArrowsInSimpleIcon size={20} />
                )}
              </button>
            </Tooltip>
          )}
          <Tooltip content={fullscreenTitle}>
            <button
              type="button"
              className={css.ctrl}
              onClick={toggleFullscreen}
              aria-label={fullscreenTitle}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? <CornersInIcon size={20} /> : <CornersOutIcon size={20} />}
            </button>
          </Tooltip>
        </div>
      )}
      <div className={css.bar} role="group" aria-label={t('call.controls')}>
        {callSnapshot && status !== 'connected' && (
          <div className={css.reconnecting} role="status" aria-live="polite">
            <span className={css.reconnectingSpinner} aria-hidden="true" />
            {status === 'reconnecting'
              ? t('call.reconnecting')
              : status === 'joiningSlow'
                ? t('call.joiningSlow')
                : t('call.joining')}
          </div>
        )}
        <div className={css.group}>
          <DeviceControl
            kinds={['audioinput', 'audiooutput']}
            label={t('call.audioSettings')}
            variant="bar"
          >
            <Tooltip content={micTitle}>
              <button
                type="button"
                className={ui.isMuted ? css.ctrlDanger : css.ctrl}
                onClick={() => actions.toggleMute()}
                aria-label={micTitle}
                aria-pressed={ui.isMuted}
              >
                <PushToTalkDot>
                  {ui.isMuted ? <MicrophoneSlashIcon size={20} /> : <MicrophoneIcon size={20} />}
                </PushToTalkDot>
              </button>
            </Tooltip>
          </DeviceControl>

          <DeviceControl kinds={['videoinput']} label={t('call.cameraSettings')} variant="bar">
            <Tooltip content={cameraTitle}>
              <button
                type="button"
                className={ui.isVideoMuted ? css.ctrl : css.ctrlActive}
                onClick={() => actions.toggleVideo()}
                aria-label={cameraTitle}
                aria-pressed={ui.isVideoMuted}
              >
                {ui.isVideoMuted ? (
                  <VideoCameraSlashIcon size={20} />
                ) : (
                  <VideoCameraIcon size={20} weight="fill" />
                )}
              </button>
            </Tooltip>
          </DeviceControl>

          <Tooltip content={shareTitle}>
            <button
              type="button"
              className={ui.isScreenSharing ? css.ctrlActive : css.ctrl}
              onClick={() => actions.toggleScreenshare()}
              aria-label={shareTitle}
              aria-pressed={ui.isScreenSharing}
            >
              <MonitorArrowUpIcon size={20} weight={ui.isScreenSharing ? 'fill' : 'regular'} />
            </button>
          </Tooltip>
        </div>

        {callSession && view !== 'tile' && (
          <>
            <span className={css.divider} />
            <div className={css.group}>
              <Tooltip content={t('call.soundboard.title')}>
                <button
                  type="button"
                  data-call-panel-toggle
                  className={panel === 'soundboard' ? css.ctrlAccent : css.ctrl}
                  onClick={() => actions.openSoundboard()}
                  aria-label={t('call.soundboard.title')}
                  aria-pressed={panel === 'soundboard'}
                >
                  <VinylRecordIcon size={20} weight={panel === 'soundboard' ? 'fill' : 'regular'} />
                </button>
              </Tooltip>
              {watchActions && (
                <Tooltip content={watchTitle}>
                  <button
                    type="button"
                    className={watching ? css.ctrlAccent : css.ctrl}
                    onClick={() =>
                      watching ? setQueueOpen((open) => !open) : openWatchDialog(true)
                    }
                    aria-label={watchTitle}
                    aria-pressed={watching && queueOpen}
                  >
                    <YoutubeLogoIcon size={20} weight={watching ? 'fill' : 'regular'} />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t('call.reactions')}>
                <button
                  type="button"
                  data-call-panel-toggle
                  className={panel === 'reactions' ? css.ctrlAccent : css.ctrl}
                  onClick={() => actions.openReactions()}
                  aria-label={t('call.reactions')}
                  aria-pressed={panel === 'reactions'}
                >
                  <SmileyIcon size={20} weight={panel === 'reactions' ? 'fill' : 'regular'} />
                </button>
              </Tooltip>
            </div>
          </>
        )}

        <span className={css.divider} />

        <div className={css.group}>
          {view !== 'docked' && (
            <Tooltip content={viewTitle}>
              <button
                type="button"
                className={css.ctrl}
                onClick={() => actions.setSpotlight(!ui.isSpotlight)}
                aria-label={viewTitle}
                aria-pressed={ui.isSpotlight}
              >
                {ui.isSpotlight ? <PresentationIcon size={20} /> : <SquaresFourIcon size={20} />}
              </button>
            </Tooltip>
          )}

          <span ref={menuBtnRef} className={css.menuAnchor}>
            <Tooltip content={t('common.moreOptions')}>
              <button
                type="button"
                className={menuOpen ? css.ctrlAccent : css.ctrl}
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={t('common.moreOptions')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <DotsThreeVerticalIcon size={20} weight="bold" />
              </button>
            </Tooltip>
          </span>

          <Tooltip content={t('call.hangup')}>
            <button
              type="button"
              className={css.ctrlDanger}
              onClick={() => actions.hangup()}
              aria-label={t('call.hangup')}
            >
              <PhoneXIcon size={20} />
            </button>
          </Tooltip>
        </div>

        <Popover
          open={menuOpen}
          onClose={closeMenu}
          anchorRef={menuBtnRef}
          placement="top"
          role="menu"
          dense
        >
          <div className={css.menu}>
            {callSession && (
              <>
                <label className={css.menuItem}>
                  <VideoCameraIcon size={16} />
                  <span className={css.menuItemLabel}>{t('call.showNonVideo')}</span>
                  <Toggle
                    size="sm"
                    checked={showNonVideo}
                    disabled={!hasVideo}
                    onChange={setShowNonVideo}
                    ariaLabel={t('call.showNonVideo')}
                  />
                </label>
                <div className={css.menuDivider} role="separator" />
              </>
            )}

            <button
              type="button"
              role="menuitem"
              className={css.menuItem}
              onClick={() => {
                actions.copyCallLog();
                closeMenu();
              }}
            >
              <ClipboardTextIcon size={16} />
              <span className={css.menuItemLabel}>{t('call.copyLog')}</span>
              <span className={css.menuItemSpacer} />
            </button>
          </div>
        </Popover>
      </div>
    </>
  );
}
