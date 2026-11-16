import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayIcon, PauseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/app/components/Tooltip';
import { formatFileSize } from '@/util/format';
import * as css from './AudioFilePlayer.css';

interface Props {
  src: string | null;
  loadSrc?: () => Promise<string | null>;
  fileName: string;
  size?: number;
  durationMs?: number;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioFilePlayer({ src, loadSrc, fileName, size, durationMs }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(
    typeof durationMs === 'number' && durationMs > 0 ? durationMs / 1000 : 0
  );

  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playWhenReadyRef = useRef(false);
  const effectiveSrc = src ?? loadedSrc;

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = 'metadata';

    const onMeta = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !effectiveSrc) return;
    audio.src = effectiveSrc;
    if (playWhenReadyRef.current) {
      playWhenReadyRef.current = false;
      audio.play().catch(() => {});
    }
  }, [effectiveSrc]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!effectiveSrc) {
      if (!loadSrc || loading) return;
      setLoading(true);
      playWhenReadyRef.current = true;
      void loadSrc()
        .then((url) => {
          if (url) setLoadedSrc(url);
          else playWhenReadyRef.current = false;
        })
        .finally(() => setLoading(false));
      return;
    }
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, [effectiveSrc, loadSrc, loading]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className={css.card}>
      <button
        type="button"
        className={css.playBtn}
        onClick={togglePlay}
        aria-busy={loading}
        aria-label={playing ? t('voiceMessagePlayer.pause') : t('voiceMessagePlayer.play')}
      >
        {playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
      </button>

      <div className={css.body}>
        <div className={css.titleRow}>
          <Tooltip content={fileName} multiline>
            <span className={css.name}>{fileName}</span>
          </Tooltip>
          {size !== undefined && <span className={css.size}>{formatFileSize(size)}</span>}
        </div>
        <div className={css.timelineRow}>
          <div className={css.timeline} onClick={handleSeek}>
            <div className={css.timelineFill} style={{ width: `${progress * 100}%` }} />
          </div>
          <span className={css.time}>
            {duration > 0 ? formatTime(playing ? duration - currentTime : duration) : '--:--'}
          </span>
        </div>
      </div>
    </div>
  );
}
