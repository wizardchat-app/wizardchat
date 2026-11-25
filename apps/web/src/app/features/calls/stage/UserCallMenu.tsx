import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  MonitorArrowUpIcon,
  MonitorIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { Toggle } from '@/app/components/Toggle';
import {
  type CallUserAudio,
  callActionsAtom,
  callSessionAtom,
  callUserAudioAtom,
  screenShareFpsAtom,
  showOwnScreenShareAtom,
} from '@/app/store/atoms/call';
import type { ScreenShareFps } from '@/call/media';
import { userProfileAtom } from '@/app/store/atoms/userProfile';
import { useDismiss } from './useDismiss';
import { useCallSnapshot } from './useCallSnapshot';
import { VolumeSlider } from '../VolumeSlider';
import { useMemberLookup } from '../useMemberLookup';
import * as css from './CallStage.css';

export interface UserMenuAnchor {
  userId: string;
  screen?: boolean;
  local?: boolean;
  participantId?: string;
  x: number;
  y: number;
}

const EDGE = 8;

function saveUserAudio(
  prev: Record<string, CallUserAudio>,
  userId: string,
  patch: Partial<CallUserAudio>
): Record<string, CallUserAudio> {
  const next: CallUserAudio = {
    volume: prev[userId]?.volume ?? 1,
    muted: prev[userId]?.muted ?? false,
    streamVolume: prev[userId]?.streamVolume,
    ...patch,
  };
  const rest = { ...prev };
  if (next.volume === 1 && !next.muted && (next.streamVolume ?? 1) === 1) delete rest[userId];
  else rest[userId] = next;
  return rest;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const stopBubbling = {
  onPointerDown: stop,
  onMouseDown: stop,
  onTouchStart: stop,
  onClick: stop,
  onKeyDown: stop,
  onDragStart: stop,
};

function useMenuPosition(
  ref: React.RefObject<HTMLDivElement | null>,
  anchor: { x: number; y: number }
) {
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(anchor.x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(anchor.y, window.innerHeight - height - EDGE)),
    });
  }, [ref, anchor]);
  return position;
}

const SCREEN_SHARE_FPS: ScreenShareFps[] = [30, 60];

export function StreamFpsMenu({
  anchor,
  onClose,
}: {
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const session = useAtomValue(callSessionAtom);
  const current = useCallSnapshot()?.screenShareFps ?? 30;
  const setPreferred = useSetAtom(screenShareFpsAtom);
  const position = useMenuPosition(ref, anchor);
  useDismiss(ref, onClose);
  const title = t('call.streamFrameRate');

  return createPortal(
    <div
      ref={ref}
      className={css.userMenu}
      style={position}
      role="menu"
      tabIndex={-1}
      aria-label={title}
      onContextMenu={(e) => e.preventDefault()}
      {...stopBubbling}
    >
      <span className={css.userMenuName}>{title}</span>
      {SCREEN_SHARE_FPS.map((fps) => (
        <button
          key={fps}
          type="button"
          role="menuitemradio"
          aria-checked={fps === current}
          className={css.userMenuItem}
          onClick={() => {
            setPreferred(fps);
            void session?.setScreenShareFps(fps);
            onClose();
          }}
        >
          <span className={css.userMenuText}>{t('call.streamFps', { fps })}</span>
          {fps === current && <CheckIcon size={16} weight="bold" className={css.userMenuCheck} />}
        </button>
      ))}
    </div>,
    document.body
  );
}

export function StreamCallMenu({
  anchor,
  roomId,
  isSelf,
  onClose,
}: {
  anchor: UserMenuAnchor;
  roomId: string;
  isSelf: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [showOwn, setShowOwn] = useAtom(showOwnScreenShareAtom);
  const session = useAtomValue(callSessionAtom);
  const actions = useAtomValue(callActionsAtom);
  const setSaved = useSetAtom(callUserAudioAtom);
  const participant = useCallSnapshot()?.participants.find(
    (p) => p.identity === anchor.participantId
  );
  const watching = !!participant?.watchingScreen;
  const setStreamVolume = (value: number) => {
    session?.setStreamVolume(anchor.userId, value);
    setSaved((prev) => saveUserAudio(prev, anchor.userId, { streamVolume: value }));
  };
  const position = useMenuPosition(ref, anchor);
  useDismiss(ref, onClose);
  const name = useMemberLookup(roomId)(anchor.userId).name;
  const title = t('call.screenShareOf', { name });

  return createPortal(
    <div
      ref={ref}
      className={css.userMenu}
      style={position}
      role="menu"
      tabIndex={-1}
      aria-label={title}
      onContextMenu={(e) => e.preventDefault()}
      {...stopBubbling}
    >
      <span className={css.userMenuName}>{title}</span>
      {isSelf && (
        <>
          <div className={css.userMenuDivider} />
          <label className={css.userMenuRow}>
            <MonitorIcon size={18} className={css.userMenuIcon} />
            <span className={css.userMenuText}>{t('call.showOwnScreen')}</span>
            <Toggle
              size="sm"
              checked={showOwn}
              onChange={setShowOwn}
              ariaLabel={t('call.showOwnScreen')}
            />
          </label>
          <div className={css.userMenuDivider} />
          <button
            type="button"
            role="menuitem"
            className={css.userMenuItemDanger}
            onClick={() => {
              actions?.toggleScreenshare();
              onClose();
            }}
          >
            <MonitorArrowUpIcon size={18} className={css.userMenuIcon} />
            <span className={css.userMenuText}>{t('call.stopShare')}</span>
          </button>
        </>
      )}
      {!isSelf && watching && participant?.screenAudio && (
        <>
          <div className={css.userMenuDivider} />
          <div className={css.userMenuRow}>
            <SpeakerHighIcon size={18} className={css.userMenuIcon} />
            <VolumeSlider
              value={participant.streamVolume}
              label={t('call.streamVolume')}
              onChange={setStreamVolume}
            />
          </div>
        </>
      )}
      {!isSelf && watching && anchor.participantId && (
        <>
          <div className={css.userMenuDivider} />
          <button
            type="button"
            role="menuitem"
            className={css.userMenuItem}
            onClick={() => {
              session?.setWatchingScreen(anchor.participantId!, false);
              onClose();
            }}
          >
            <EyeSlashIcon size={18} className={css.userMenuIcon} />
            <span className={css.userMenuText}>{t('call.stopWatching')}</span>
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

export function UserCallMenu({
  anchor,
  roomId,
  isSelf,
  onClose,
}: {
  anchor: UserMenuAnchor;
  roomId: string;
  isSelf?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const session = useAtomValue(callSessionAtom);
  const [savedAudio, setSaved] = useAtom(callUserAudioAtom);
  const volume = savedAudio[anchor.userId]?.volume ?? 1;
  const muted = savedAudio[anchor.userId]?.muted ?? false;
  const setProfile = useSetAtom(userProfileAtom);
  const position = useMenuPosition(ref, anchor);
  useDismiss(ref, onClose);
  const participant = useCallSnapshot()?.participants.find(
    (p) => p.identity === anchor.participantId
  );
  const canHideVideo = !isSelf && !!participant?.cameraShared;

  const name = useMemberLookup(roomId)(anchor.userId).name;
  const save = (patch: { volume?: number; muted?: boolean }) => {
    if (patch.volume !== undefined) session?.setUserVolume(anchor.userId, patch.volume);
    if (patch.muted !== undefined) session?.setUserMuted(anchor.userId, patch.muted);
    setSaved((prev) => saveUserAudio(prev, anchor.userId, patch));
  };

  const openProfile = () => {
    const rect = ref.current?.getBoundingClientRect();
    setProfile({
      userId: anchor.userId,
      roomId,
      anchorRect: {
        top: rect?.top ?? anchor.y,
        left: rect?.left ?? anchor.x,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      },
    });
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className={css.userMenu}
      style={position}
      role="menu"
      tabIndex={-1}
      aria-label={name}
      onContextMenu={(e) => e.preventDefault()}
      {...stopBubbling}
    >
      <span className={css.userMenuName}>{name}</span>
      <div className={css.userMenuDivider} />
      {!isSelf && (
        <>
          <div className={css.userMenuRow}>
            <SpeakerSlashIcon size={18} className={css.userMenuIcon} />
            <span className={css.userMenuText}>{t('call.muteForMe')}</span>
            <Toggle
              size="sm"
              checked={muted}
              onChange={(value) => save({ muted: value })}
              ariaLabel={t('call.muteForMe')}
            />
          </div>
          <div className={css.userMenuRow}>
            <SpeakerHighIcon size={18} className={css.userMenuIcon} />
            <VolumeSlider
              value={volume}
              label={t('call.userVolume')}
              disabled={muted}
              onChange={(value) => save({ volume: value })}
            />
          </div>
          <div className={css.userMenuDivider} />
        </>
      )}
      {canHideVideo && participant && (
        <button
          type="button"
          role="menuitem"
          className={css.userMenuItem}
          onClick={() => {
            session?.setCameraHidden(participant.identity, !participant.cameraHidden);
            onClose();
          }}
        >
          {participant.cameraHidden ? (
            <EyeIcon size={18} className={css.userMenuIcon} />
          ) : (
            <EyeSlashIcon size={18} className={css.userMenuIcon} />
          )}
          <span className={css.userMenuText}>
            {participant.cameraHidden ? t('call.showVideo') : t('call.hideVideo')}
          </span>
        </button>
      )}
      <button type="button" role="menuitem" className={css.userMenuItem} onClick={openProfile}>
        <UserIcon size={18} className={css.userMenuIcon} />
        <span className={css.userMenuText}>{t('call.viewProfile')}</span>
      </button>
    </div>,
    document.body
  );
}
