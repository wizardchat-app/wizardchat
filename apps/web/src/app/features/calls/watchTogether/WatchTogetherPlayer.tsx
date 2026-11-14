import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  EyeSlashIcon,
  XIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import {
  expectedPosition,
  watchingVideoIdAtom,
  youtubeWatchUrl,
  type WatchPatch,
  type WatchState,
} from './watchTogether';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import { WatchViewers } from './WatchViewers';
import { YT_STATE, createYouTubePlayer, type YTPlayer } from './youtube';
import * as css from './WatchTogether.css';

const IN_SYNC_S = 0.3;
const NUDGE_MAX_S = 3;
const SEEK_FALLBACK_S = 1.5;
const NUDGE_FACTOR = 0.25;
const SEEK_JUMP_S = 1.5;
const COMMAND_TIMEOUT_MS = 8000;
const BUFFER_WAIT_MS = 2000;
const BUFFER_AHEAD_S = 4;
const HOLD_COOLDOWN_MS = 8000;
const TICK_MS = 500;

interface Sample {
  time: number;
  at: number;
  playing: boolean;
}

interface Command {
  playing: boolean;
  seekTo: number | null;
  until: number;
}

interface Props {
  state: WatchState;
  compact?: boolean;
  onUpdate: (patch: WatchPatch) => void;
  onStop: () => void;
  onFocus?: () => void;
}

export function WatchTogetherPlayer({ state, compact, onUpdate, onStop, onFocus }: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const commandRef = useRef<Command | null>(null);
  const lastPlayerStateRef = useRef<number>(YT_STATE.UNSTARTED);
  const steadyRef = useRef<Sample | null>(null);
  const inSyncRef = useRef(false);
  const requestedRateRef = useRef(1);
  const bufferingSinceRef = useRef<number | null>(null);
  const holdCooldownUntilRef = useRef(0);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [failed, setFailed] = useState<'video' | 'bridge' | null>(null);
  const setWatching = useSetAtom(watchingVideoIdAtom);
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? '';

  const command = (playing: boolean, seekTo: number | null) => {
    commandRef.current = { playing, seekTo, until: Date.now() + COMMAND_TIMEOUT_MS };
    steadyRef.current = null;
  };

  const setRate = (player: YTPlayer, rate: number) => {
    if (requestedRateRef.current === rate) return;
    requestedRateRef.current = rate;
    player.setPlaybackRate(rate);
  };

  const apply = useCallback((s: WatchState) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const target = expectedPosition(s);
    const currentId = player.getVideoData?.().video_id;
    if (currentId && currentId !== s.videoId) {
      command(s.playing, target);
      if (s.playing) player.loadVideoById({ videoId: s.videoId, startSeconds: target });
      else player.cueVideoById({ videoId: s.videoId, startSeconds: target });
      return;
    }
    const playerState = player.getPlayerState();
    const running = playerState === YT_STATE.PLAYING || playerState === YT_STATE.BUFFERING;
    const seek = Math.abs(player.getCurrentTime() - target) > SEEK_FALLBACK_S ? target : null;
    if (seek !== null || s.playing !== running) command(s.playing, seek);
    if (seek !== null) player.seekTo(seek, true);
    if (s.playing && !running) player.playVideo();
    if (!s.playing && running) player.pauseVideo();
    setRate(player, s.rate);
  }, []);

  const handlePlayerState = useCallback((playerState: number) => {
    const player = playerRef.current;
    const s = stateRef.current;
    const previous = lastPlayerStateRef.current;
    lastPlayerStateRef.current = playerState;
    if (!player || !s) return;
    if (playerState === YT_STATE.BUFFERING) {
      bufferingSinceRef.current ??= Date.now();
      return;
    }
    bufferingSinceRef.current = null;
    const current = player.getCurrentTime();
    const pending =
      commandRef.current && Date.now() < commandRef.current.until ? commandRef.current : null;

    if (playerState === YT_STATE.PLAYING) {
      if (pending?.playing) commandRef.current = null;
      const firstStart = previous === YT_STATE.UNSTARTED || previous === YT_STATE.CUED;
      if (firstStart && Math.abs(current - expectedPosition(s)) > SEEK_FALLBACK_S) {
        command(s.playing, expectedPosition(s));
        player.seekTo(expectedPosition(s), true);
        if (!s.playing) player.pauseVideo();
        return;
      }
      if (!s.playing && !pending) onUpdateRef.current({ playing: true, position: current });
    } else if (playerState === YT_STATE.PAUSED) {
      if (pending && !pending.playing) commandRef.current = null;
      if (s.playing && !pending) onUpdateRef.current({ playing: false, position: current });
    } else if (playerState === YT_STATE.ENDED) {
      if (s.playing) onUpdateRef.current({ playing: false, position: player.getDuration() });
    }
  }, []);

  const handleRateChange = useCallback((rate: number) => {
    const s = stateRef.current;
    if (!s || rate === requestedRateRef.current || requestedRateRef.current !== s.rate) return;
    requestedRateRef.current = rate;
    onUpdateRef.current({ rate, position: playerRef.current?.getCurrentTime() });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (host) {
      const initial = stateRef.current;
      playerRef.current = createYouTubePlayer(host, {
        videoId: initial.videoId,
        autoplay: initial.playing,
        start: expectedPosition(initial),
        onReady: () => {
          readyRef.current = true;
          apply(stateRef.current);
        },
        onStateChange: handlePlayerState,
        onRateChange: handleRateChange,
        onError: (kind) => {
          if (!cancelled) setFailed(kind);
        },
      });
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apply, handlePlayerState, handleRateChange]);

  useEffect(() => apply(state), [state, apply]);

  useEffect(() => setFailed((kind) => (kind === 'video' ? null : kind)), [state.videoId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      const s = stateRef.current;
      if (!player || !readyRef.current) return;
      const playerState = player.getPlayerState();
      const current = player.getCurrentTime();
      const now = Date.now();
      const pending =
        commandRef.current && now < commandRef.current.until ? commandRef.current : null;

      const bufferingFor = bufferingSinceRef.current ? now - bufferingSinceRef.current : 0;
      if (
        s.playing &&
        !s.waitingFor &&
        bufferingFor > BUFFER_WAIT_MS &&
        now > holdCooldownUntilRef.current
      ) {
        holdCooldownUntilRef.current = now + HOLD_COOLDOWN_MS;
        onUpdateRef.current({ playing: false, position: current, waitingFor: myId });
        return;
      }
      if (!s.playing && s.waitingFor === myId && playerState !== YT_STATE.BUFFERING) {
        const loaded = player.getLoadedFraction();
        const duration = player.getDuration();
        const ready =
          loaded === null ||
          duration <= 0 ||
          loaded >= 0.99 ||
          loaded * duration >= s.position + BUFFER_AHEAD_S;
        if (ready) {
          holdCooldownUntilRef.current = now + HOLD_COOLDOWN_MS;
          onUpdateRef.current({ playing: true, position: s.position, waitingFor: null });
        }
        return;
      }

      const steady = playerState === YT_STATE.PLAYING || playerState === YT_STATE.PAUSED;
      if (
        pending &&
        steady &&
        pending.playing === (playerState === YT_STATE.PLAYING) &&
        (pending.seekTo === null || Math.abs(current - pending.seekTo) <= SEEK_FALLBACK_S)
      ) {
        commandRef.current = null;
      }
      if (commandRef.current || !steady) {
        steadyRef.current = null;
        return;
      }

      const target = expectedPosition(s);
      const offBy = current - target;

      const base = steadyRef.current;
      steadyRef.current = { time: current, at: now, playing: playerState === YT_STATE.PLAYING };
      if (base && inSyncRef.current) {
        const maxAdvance = base.playing ? ((now - base.at) / 1000) * player.getPlaybackRate() : 0;
        if (current < base.time - SEEK_JUMP_S || current > base.time + maxAdvance + SEEK_JUMP_S) {
          inSyncRef.current = true;
          onUpdateRef.current({ playing: playerState === YT_STATE.PLAYING, position: current });
          return;
        }
      }
      inSyncRef.current = Math.abs(offBy) <= SEEK_FALLBACK_S;

      if (s.playing && playerState === YT_STATE.PLAYING) {
        const canNudge = player.supportsRate() && s.rate === 1;
        if (Math.abs(offBy) <= IN_SYNC_S) {
          setRate(player, s.rate);
        } else if (canNudge && Math.abs(offBy) <= NUDGE_MAX_S) {
          setRate(player, offBy < 0 ? 1 + NUDGE_FACTOR : 1 - NUDGE_FACTOR);
        } else if (Math.abs(offBy) > (canNudge ? NUDGE_MAX_S : SEEK_FALLBACK_S)) {
          setRate(player, s.rate);
          command(true, target);
          player.seekTo(target, true);
        }
      } else if (!s.playing && playerState === YT_STATE.PAUSED && Math.abs(offBy) > IN_SYNC_S) {
        command(false, target);
        player.seekTo(target, true);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [myId]);

  const waitingFor = state.waitingFor && state.waitingFor !== myId ? state.waitingFor : null;
  const { data: waitingProfile } = useProfile(waitingFor);
  const waitingName = waitingFor ? (waitingProfile?.displayName ?? waitingFor) : null;

  return (
    <div className={compact ? css.playerCompact : css.player}>
      <div ref={hostRef} className={css.playerHost} />
      {waitingName && !failed && (
        <div className={css.playerWaiting}>
          {t('call.watchTogether.waitingFor', { name: waitingName })}
        </div>
      )}
      {failed && (
        <div className={css.playerError}>
          {failed === 'bridge'
            ? t('call.watchTogether.playerUnavailable')
            : t('call.watchTogether.unavailable')}
        </div>
      )}
      {!compact && (
        <>
          <span className={css.playerTop}>
            <span className={css.playerLabel}>
              <YoutubeLogoIcon size={14} weight="fill" />
              {t('call.watchTogether.badge')}
            </span>
            <WatchViewers />
          </span>
          <div className={css.playerBar}>
            <span className={css.playerButtons}>
              {onFocus && (
                <Tooltip content={t('call.watchTogether.focus')}>
                  <button
                    type="button"
                    className={css.playerButton}
                    onClick={onFocus}
                    aria-label={t('call.watchTogether.focus')}
                  >
                    <ArrowsOutSimpleIcon size={14} />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t('call.watchTogether.openOnYouTube')}>
                <a
                  className={css.playerButton}
                  href={youtubeWatchUrl(state.videoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('call.watchTogether.openOnYouTube')}
                  onClick={(e) => {
                    const current = playerRef.current?.getCurrentTime() ?? expectedPosition(state);
                    e.currentTarget.href = youtubeWatchUrl(state.videoId, current);
                  }}
                >
                  <ArrowSquareOutIcon size={14} />
                </a>
              </Tooltip>
              <Tooltip content={t('call.watchTogether.stopWatching')}>
                <button
                  type="button"
                  className={css.playerButton}
                  onClick={() => setWatching(null)}
                  aria-label={t('call.watchTogether.stopWatching')}
                >
                  <EyeSlashIcon size={14} />
                </button>
              </Tooltip>
              <Tooltip content={t('call.watchTogether.stop')}>
                <button
                  type="button"
                  className={css.playerStop}
                  onClick={onStop}
                  aria-label={t('call.watchTogether.stop')}
                >
                  <XIcon size={14} weight="bold" />
                </button>
              </Tooltip>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
