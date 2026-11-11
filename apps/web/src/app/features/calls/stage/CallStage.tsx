import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  DotsThreeIcon,
  LockKeyIcon,
  EyeIcon,
  EyeSlashIcon,
  HandIcon,
  MicrophoneSlashIcon,
  MonitorIcon,
  PhoneIcon,
} from '@phosphor-icons/react';
import type { CallMedia, CallParticipant, RingState, TrackHandle } from '@/call/media';
import { useClient, useMembers, useRoom } from '@/app/data';
import { isDmRoom } from '@/util/matrix';
import { Avatar, useAvatarBlobUrl } from '@/app/components/Avatar';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { Tooltip } from '@/app/components/Tooltip';
import {
  callEffectiveViewAtom,
  callUiAtom,
  callSessionAtom,
  callPanelAtom,
  showNonVideoParticipantsAtom,
  showOwnScreenShareAtom,
} from '@/app/store/atoms/call';
import { themeAtom } from '@/app/store/atoms/settings';
import { buildCallBackground } from '@/app/features/calls/callBackground';
import { shownParticipants, useCallSnapshot } from './useCallSnapshot';
import { StreamCallMenu, UserCallMenu, type UserMenuAnchor } from './UserCallMenu';
import { useDismiss } from './useDismiss';
import { useMemberLookup, type MemberInfo } from '../useMemberLookup';
import {
  watchActionsAtom,
  watchStateAtom,
  watchingVideoIdAtom,
} from '../watchTogether/watchTogether';
import { WATCH_TILE_KEY, WatchPlayerLayer, WatchSlot } from '../watchTogether/WatchStage';
import * as css from './CallStage.css';

function VideoTrack({
  track,
  mirror,
  contain,
}: {
  track: TrackHandle;
  mirror: boolean;
  contain: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  const className = [css.video, contain ? css.videoContain : '', mirror ? css.mirrored : '']
    .filter(Boolean)
    .join(' ');
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

interface ParticipantTile {
  kind: 'participant';
  key: string;
  participant: CallParticipant;
  screen: boolean;
}

interface WatchTile {
  kind: 'watch';
  key: typeof WATCH_TILE_KEY;
}

type StageTile = ParticipantTile | WatchTile;

function UserBackdrop({ name, mxc }: { name: string; mxc: string | null }) {
  const { data: avatarSrc } = useAvatarBlobUrl(mxc, useClient());
  const gradient = useBannerGradient(avatarSrc, name);
  return <span className={css.backdrop} style={{ backgroundImage: gradient }} />;
}

function useFullscreen(ref: React.RefObject<HTMLElement | null>): [boolean, () => void] {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [ref]);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  }, [ref]);
  return [active, toggle];
}

/** The user's other devices in the call are named as such */
function participantInfo(
  participant: CallParticipant,
  lookup: (userId: string) => MemberInfo,
  myId: string | null,
  t: TFunction
): MemberInfo {
  const info = lookup(participant.userId);
  if (participant.isLocal || participant.userId !== myId) return info;
  return { ...info, name: t('call.ownOtherDevice', { name: info.name }) };
}

function Tile({
  tile,
  lookup,
  focused,
  compact,
  onSelect,
  onMenu,
  onWatch,
}: {
  tile: ParticipantTile;
  lookup: (userId: string) => MemberInfo;
  focused?: boolean;
  compact?: boolean;
  onSelect?: () => void;
  onMenu?: (x: number, y: number) => void;
  onWatch?: () => void;
}) {
  const showOwnScreen = useAtomValue(showOwnScreenShareAtom);
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const client = useClient();
  const { participant, screen } = tile;
  const { name, avatarUrl: mxc } = participantInfo(participant, lookup, client.userId(), t);
  const previewHidden = screen && participant.isLocal && !showOwnScreen;
  const unwatched = screen && !participant.watchingScreen;
  const track = screen ? participant.screen : participant.camera;
  const speaking = !screen && participant.speaking;
  const videoHidden = !screen && participant.cameraHidden;
  const canFullscreen = !!track && !previewHidden && !unwatched;
  const [isFullscreen, toggleFullscreen] = useFullscreen(ref);
  const fullscreenLabel = isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen');

  const classes = [
    css.tile,
    screen ? css.tileScreen : '',
    speaking ? css.tileSpeaking : '',
    focused ? css.tileFocused : '',
    onSelect ? css.tileClickable : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      onClick={onSelect ? (e) => e.detail < 2 && onSelect() : undefined}
      onDoubleClick={canFullscreen ? toggleFullscreen : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              onMenu(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      {(!screen || unwatched) && <UserBackdrop name={name} mxc={mxc} />}
      {unwatched ? (
        <span className={css.watchOverlay}>
          {onWatch && (
            <button
              type="button"
              className={css.watchBtn}
              onClick={(e) => {
                e.stopPropagation();
                onWatch();
              }}
            >
              <EyeIcon size={16} weight="bold" />
              {t('call.watchStream')}
            </button>
          )}
        </span>
      ) : previewHidden ? (
        <span className={css.previewHidden}>{t('call.ownScreenHidden')}</span>
      ) : track ? (
        <VideoTrack track={track} mirror={participant.isLocal && !screen} contain={screen} />
      ) : (
        !screen && (
          <span className={participant.connected ? css.avatar : `${css.avatar} ${css.connecting}`}>
            <Avatar
              name={name}
              mxcUrl={mxc}
              client={client}
              size={compact ? 'lg' : 'xl'}
              placeholder="logo"
            />
          </span>
        )
      )}
      {screen && (
        <span className={css.liveRow}>
          <span className={css.liveBadge}>{t('call.live')}</span>
          {participant.isLocal && participant.screenWatchers.length > 0 && (
            <Tooltip content={participant.screenWatchers.map((uid) => lookup(uid).name).join(', ')}>
              <span
                className={css.viewersChip}
                aria-label={t('call.streamViewers', { count: participant.screenWatchers.length })}
              >
                <EyeIcon size={12} weight="bold" />
                {participant.screenWatchers.length}
              </span>
            </Tooltip>
          )}
        </span>
      )}
      {!screen && participant.handRaised && (
        <span className={css.badge} title={t('call.handRaised')}>
          ✋
        </span>
      )}
      {!screen && participant.reaction && (
        <span key={participant.reaction} className={css.reaction}>
          {participant.reaction}
        </span>
      )}
      {participant.keyMissing && (
        <Tooltip
          content={t(participant.isLocal ? 'call.keyMissingSelfHint' : 'call.keyMissingHint')}
          multiline
        >
          <span className={css.keyMissing} role="status">
            <LockKeyIcon size={13} weight="bold" />
            {t('call.keyMissing')}
          </span>
        </Tooltip>
      )}
      {videoHidden && (
        <Tooltip content={t('call.videoHiddenForYou')}>
          <span className={css.videoHiddenBadge} aria-label={t('call.videoHiddenForYou')}>
            <EyeSlashIcon size={16} weight="bold" />
          </span>
        </Tooltip>
      )}
      {canFullscreen && (
        <Tooltip content={fullscreenLabel}>
          <button
            type="button"
            className={videoHidden ? css.tileFullscreenBtnShifted : css.tileFullscreenBtn}
            aria-label={fullscreenLabel}
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
          >
            {isFullscreen ? (
              <ArrowsInIcon size={16} weight="bold" />
            ) : (
              <ArrowsOutIcon size={16} weight="bold" />
            )}
          </button>
        </Tooltip>
      )}
      {onMenu && (
        <button
          type="button"
          className={videoHidden ? css.tileMenuBtnShifted : css.tileMenuBtn}
          aria-label={t('common.more')}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onMenu(rect.right, rect.bottom + 4);
          }}
        >
          <DotsThreeIcon size={18} weight="bold" />
        </button>
      )}
      <span className={css.label}>
        {screen && <MonitorIcon size={13} weight="fill" />}
        {!screen && participant.audioMuted && (
          <MicrophoneSlashIcon size={13} weight="fill" className={css.mutedIcon} />
        )}
        <span className={css.labelName}>{name}</span>
        {!screen && !participant.connected && (
          <span
            className={css.connectingSpinner}
            role="status"
            aria-label={t('call.statusConnecting')}
          />
        )}
      </span>
    </div>
  );
}

function AvatarBubble({
  participant,
  lookup,
  onMenu,
}: {
  participant: CallParticipant;
  lookup: (userId: string) => MemberInfo;
  onMenu: (x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const client = useClient();
  const { name, avatarUrl } = participantInfo(participant, lookup, client.userId(), t);
  return (
    <div
      className={css.bubble}
      title={name}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <span
        className={[
          participant.speaking ? css.bubbleRingSpeaking : css.bubbleRing,
          participant.connected ? '' : css.connecting,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Avatar name={name} mxcUrl={avatarUrl} client={client} size="fill" placeholder="logo" />
      </span>
      {!participant.connected && (
        <span
          className={css.bubbleConnecting}
          role="status"
          aria-label={t('call.statusConnecting')}
        >
          <span className={css.connectingSpinner} />
        </span>
      )}
      {participant.audioMuted && (
        <span className={css.bubbleMuted} aria-label={t('call.mute')}>
          <MicrophoneSlashIcon size={14} weight="fill" />
        </span>
      )}
      {participant.handRaised && (
        <span className={css.bubbleHand} title={t('call.handRaised')}>
          ✋
        </span>
      )}
      {participant.reaction && (
        <span key={participant.reaction} className={css.bubbleReaction}>
          {participant.reaction}
        </span>
      )}
    </div>
  );
}

function CallingView({
  roomId,
  lookup,
  ring,
  compact,
  onRingAgain,
}: {
  roomId: string;
  lookup: (userId: string) => MemberInfo;
  ring: RingState;
  compact: boolean;
  onRingAgain: () => void;
}) {
  const { t } = useTranslation();
  const client = useClient();
  const { data: members } = useMembers(roomId);
  const room = useRoom(roomId);
  const myId = client.userId();
  const self = myId ? lookup(myId) : null;
  // A group rings everyone in it, so it shows the room instead of one person
  const group = !!room && !isDmRoom(room);
  const targetId = members?.find((m) => m.userId !== myId)?.userId ?? null;
  const target = group
    ? { name: room.name ?? '', avatarUrl: room.avatarUrl }
    : targetId
      ? lookup(targetId)
      : null;
  const targetName = target?.name ?? '';
  const bubble = (member: { name: string; avatarUrl: string | null } | null, pulsing: boolean) => (
    <span
      className={[css.bubbleRing, compact ? css.bubbleRingSmall : '', pulsing ? css.ringPulse : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar
        name={member?.name ?? ''}
        mxcUrl={member?.avatarUrl ?? null}
        client={client}
        size="fill"
        placeholder="logo"
      />
    </span>
  );
  const status =
    ring === 'ringing'
      ? t('call.calling', { name: targetName })
      : ring === 'declined'
        ? group
          ? t('call.event.declined')
          : t('call.declined', { name: targetName })
        : t('call.event.unanswered');

  return (
    <div className={css.calling}>
      <div className={css.callingRow}>
        {!compact && bubble(self, false)}
        {target && bubble(target, ring === 'ringing')}
      </div>
      <span className={css.callingStatus} aria-live="polite">
        {status}
      </span>
      {ring !== 'ringing' && !compact && (
        <button type="button" className={css.watchBtn} onClick={onRingAgain}>
          <PhoneIcon size={16} weight="bold" />
          {t('call.ringAgain')}
        </button>
      )}
    </div>
  );
}

const TILE_ASPECT = 16 / 9;
const GRID_GAP = 8;

function useGridLayout(count: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  let best = { columns: 1, width: 0 };
  for (let columns = 1; columns <= Math.max(count, 1); columns++) {
    const rows = Math.ceil(count / columns);
    const byWidth = (size.width - GRID_GAP * (columns - 1)) / columns;
    const byHeight = ((size.height - GRID_GAP * (rows - 1)) / rows) * TILE_ASPECT;
    const width = Math.floor(Math.min(byWidth, byHeight));
    if (width > best.width) best = { columns, width };
  }
  return { ref: setElement, columns: best.columns, tileWidth: Math.max(best.width, 0) };
}

const REACTIONS: { emoji: string; name: string }[] = [
  { emoji: '👍', name: 'thumbsup' },
  { emoji: '👏', name: 'clap' },
  { emoji: '😂', name: 'laugh' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '🎉', name: 'party' },
  { emoji: '😮', name: 'surprised' },
  { emoji: '🤔', name: 'thinking' },
  { emoji: '👎', name: 'thumbsdown' },
];

function ReactionsPanel({
  session,
  handRaised,
  onClose,
}: {
  session: CallMedia;
  handRaised: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const handLabel = handRaised ? t('call.lowerHand') : t('call.raiseHand');
  return (
    <div ref={ref} className={css.panel}>
      <div className={css.reactionRow}>
        <Tooltip content={handLabel}>
          <button
            type="button"
            className={handRaised ? css.handBtnActive : css.handBtn}
            aria-pressed={handRaised}
            aria-label={handLabel}
            onClick={() => void session.setHandRaised(!handRaised)}
          >
            <HandIcon size={20} weight={handRaised ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
        <span className={css.reactionDivider} aria-hidden />
        {REACTIONS.map((r) => (
          <button
            key={r.name}
            type="button"
            className={css.reactionBtn}
            aria-label={r.name}
            onClick={() => void session.sendReaction(r.emoji, r.name)}
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CallStage() {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const [ui, setUi] = useAtom(callUiAtom);
  const view = useAtomValue(callEffectiveViewAtom);
  const theme = useAtomValue(themeAtom);
  const [panel, setPanel] = useAtom(callPanelAtom);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState<UserMenuAnchor | null>(null);
  const closePanel = useCallback(() => setPanel(null), [setPanel]);
  const closeUserMenu = useCallback(() => setUserMenu(null), []);
  const roomId = session?.roomId ?? null;
  const lookup = useMemberLookup(roomId);
  const client = useClient();
  const background = buildCallBackground(theme);

  const watch = useAtomValue(watchStateAtom);
  const watchActions = useAtomValue(watchActionsAtom);
  const watchingVideoId = useAtomValue(watchingVideoIdAtom);
  const watchActive = !!watch && !!watchActions;
  const watchingNow = watchActive && watchingVideoId === watch.videoId;
  const stageRef = useRef<HTMLDivElement>(null);
  const [showNonVideo, setShowNonVideo] = useAtom(showNonVideoParticipantsAtom);
  const hasVideo = watchActive || !!snapshot?.participants.some((p) => p.camera || p.screenShared);
  useEffect(() => {
    if (!hasVideo && !showNonVideo) setShowNonVideo(true);
  }, [hasVideo, showNonVideo, setShowNonVideo]);
  const tiles = useMemo<StageTile[]>(() => {
    const list: StageTile[] = [];
    if (watchActive) list.push({ kind: 'watch', key: WATCH_TILE_KEY });
    for (const p of shownParticipants(snapshot)) {
      if (showNonVideo || p.camera) {
        list.push({ kind: 'participant', key: p.identity, participant: p, screen: false });
      }
    }
    for (const p of shownParticipants(snapshot)) {
      if (p.screenShared) {
        list.push({
          kind: 'participant',
          key: `${p.identity}:screen`,
          participant: p,
          screen: true,
        });
      }
    }
    return list;
  }, [snapshot, showNonVideo, watchActive]);

  useEffect(() => {
    if (!watchingNow) return;
    setFocusedKey(WATCH_TILE_KEY);
    setUi((prev) => (prev.isSpotlight ? prev : { ...prev, isSpotlight: true }));
  }, [watchingNow, watchingVideoId, setUi]);

  const compact = view === 'tile';
  const docked = view === 'docked';
  const stageView = compact || ui.isSpotlight;
  const grid = useGridLayout(tiles.length);

  const people = tiles.filter((tile): tile is ParticipantTile => tile.kind === 'participant');
  const focused =
    tiles.find((tile) => tile.key === focusedKey) ??
    people.find((tile) => tile.screen) ??
    people.find((tile) => tile.participant.speaking && !tile.participant.isLocal) ??
    people.find((tile) => !tile.participant.isLocal) ??
    tiles[0];

  if (!session || !snapshot || !roomId) return null;
  const own = snapshot.participants.find((p) => p.isLocal);
  const style = { backgroundColor: background.base, backgroundImage: background.glow };

  const select = (key: string) => {
    if (stageView && focused?.key === key) {
      setFocusedKey(null);
      setUi((prev) => ({ ...prev, isSpotlight: false }));
    } else {
      setFocusedKey(key);
      setUi((prev) => ({ ...prev, isSpotlight: true }));
    }
  };

  const watchFor = (tile: ParticipantTile) =>
    tile.screen && !tile.participant.watchingScreen
      ? () => {
          session.setWatchingScreen(tile.participant.identity, true);
          setFocusedKey(tile.key);
          setUi((prev) => ({ ...prev, isSpotlight: true }));
        }
      : undefined;

  const openMenu = (tile: ParticipantTile) => (x: number, y: number) =>
    setUserMenu({
      userId: tile.participant.userId,
      screen: tile.screen,
      local: tile.participant.isLocal,
      participantId: tile.participant.identity,
      x,
      y,
    });

  const myId = client.userId();
  const alone = !shownParticipants(snapshot).some((p) => p.userId !== myId);
  const watchStartedBy = watch
    ? (lookup(watch.startedBy).member?.displayName ?? watch.startedBy)
    : '';

  const renderTile = (
    tile: StageTile,
    opts: { focused?: boolean; compact?: boolean; onSelect?: () => void; menu?: boolean }
  ) =>
    tile.kind === 'watch' ? (
      <WatchSlot
        startedByName={watchStartedBy}
        focused={opts.focused}
        compact={opts.compact}
        onSelect={opts.onSelect}
      />
    ) : (
      <Tile
        tile={tile}
        lookup={lookup}
        focused={opts.focused}
        compact={opts.compact}
        onSelect={opts.onSelect}
        onWatch={watchFor(tile)}
        onMenu={opts.menu === false ? undefined : openMenu(tile)}
      />
    );

  let content: React.ReactNode;
  if (snapshot.ring && alone && !watchActive) {
    content = (
      <CallingView
        roomId={roomId}
        lookup={lookup}
        ring={snapshot.ring}
        compact={compact}
        onRingAgain={() => void session.ringAgain()}
      />
    );
  } else if (tiles.length === 0 || !focused) {
    content = <span className={css.empty}>{t('call.statusConnecting')}</span>;
  } else if (docked) {
    content = (
      <div className={css.dockedRow}>
        {watchActive && (
          <div className={css.dockedVideo}>
            {renderTile({ kind: 'watch', key: WATCH_TILE_KEY }, { compact: true })}
          </div>
        )}
        {shownParticipants(snapshot).map((p) => {
          const tile: ParticipantTile = {
            kind: 'participant',
            key: p.identity,
            participant: p,
            screen: false,
          };
          return p.camera ? (
            <div key={tile.key} className={css.dockedVideo}>
              {renderTile(tile, { compact: true })}
            </div>
          ) : (
            <AvatarBubble key={tile.key} participant={p} lookup={lookup} onMenu={openMenu(tile)} />
          );
        })}
        {people
          .filter((tile) => tile.screen)
          .map((tile) => (
            <div key={tile.key} className={css.dockedVideo}>
              {renderTile(tile, { compact: true })}
            </div>
          ))}
      </div>
    );
  } else if (stageView) {
    const others = tiles.filter((tile) => tile.key !== focused.key);
    content = (
      <>
        <div className={css.stageMain}>
          <div
            key={focused.key}
            className={!compact && others.length > 0 ? css.stageFocusWithStrip : css.stageFocus}
          >
            {renderTile(focused, {
              focused: true,
              compact,
              onSelect: compact ? undefined : () => select(focused.key),
              menu: !compact,
            })}
          </div>
        </div>
        {!compact && others.length > 0 && (
          <div className={css.strip}>
            {others.map((tile) => (
              <div key={tile.key} className={css.stripItem}>
                {renderTile(tile, { compact: true, onSelect: () => select(tile.key) })}
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else {
    content = (
      <div
        className={css.grid}
        style={{
          maxWidth: grid.columns * grid.tileWidth + GRID_GAP * (grid.columns - 1),
        }}
      >
        {tiles.map((tile) => (
          <div key={tile.key} className={css.gridItem} style={{ width: grid.tileWidth }}>
            {renderTile(tile, { onSelect: () => select(tile.key) })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={stageRef} className={compact ? css.stageCompact : css.stage} style={style}>
      <div ref={grid.ref} className={css.area}>
        {content}
      </div>
      {watchActive && <WatchPlayerLayer rootRef={stageRef} startedByName={watchStartedBy} />}
      {!compact && panel === 'reactions' && (
        <ReactionsPanel session={session} handRaised={!!own?.handRaised} onClose={closePanel} />
      )}
      {userMenu?.screen && (
        <StreamCallMenu
          anchor={userMenu}
          roomId={roomId}
          isSelf={!!userMenu.local}
          onClose={closeUserMenu}
        />
      )}
      {userMenu && !userMenu.screen && (
        <UserCallMenu
          anchor={userMenu}
          roomId={roomId}
          isSelf={userMenu.userId === myId}
          onClose={closeUserMenu}
        />
      )}
    </div>
  );
}
