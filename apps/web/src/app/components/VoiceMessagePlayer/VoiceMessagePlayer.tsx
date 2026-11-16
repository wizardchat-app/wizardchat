import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayIcon, PauseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { vars } from '@/theme/vars.css';
import { Waveform } from '../Waveform/Waveform';
import * as css from './VoiceMessagePlayer.css';

interface Props {
  src: string | null;
  loadSrc?: () => Promise<string | null>;
  waveform?: number[];
  durationMs?: number;
}

function normalizeWaveform(values: number[]): number[] {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  return max > 1 ? values.map((v) => Math.min(1, v / 1024)) : values;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function extractWaveform(src: string, bars = 60): Promise<number[]> {
  const ctx = new AudioContext();
  const res = await fetch(src);
  const buffer = await res.arrayBuffer();
  const audio = await ctx.decodeAudioData(buffer);
  ctx.close();

  const pcm = audio.getChannelData(0);
  const samplesPerBar = Math.floor(pcm.length / bars);
  const result: number[] = [];

  for (let i = 0; i < bars; i++) {
    const start = i * samplesPerBar;
    const end = start + samplesPerBar;
    let sumSq = 0;
    let count = 0;
    for (let j = start; j < end && j < pcm.length; j++) {
      sumSq += pcm[j] * pcm[j];
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    result.push(Math.min(rms * 4, 1));
  }

  return result;
}

export function VoiceMessagePlayer({ src, loadSrc, waveform: waveformProp, durationMs }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(
    typeof durationMs === 'number' && durationMs > 0 ? durationMs / 1000 : null
  );
  const [waveformData, setWaveformData] = useState<number[]>(() =>
    waveformProp && waveformProp.length > 0 ? normalizeWaveform(waveformProp) : []
  );
  const progress = duration && duration > 0 ? currentTime / duration : 0;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playWhenReadyRef = useRef(false);
  const effectiveSrc = src ?? loadedSrc;

  useEffect(() => {
    if (waveformProp && waveformProp.length > 0) {
      setWaveformData(normalizeWaveform(waveformProp));
      return;
    }
    if (!effectiveSrc) return;
    let cancelled = false;
    extractWaveform(effectiveSrc).then((data) => {
      if (!cancelled) setWaveformData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveSrc, waveformProp]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = 'metadata';

    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
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

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration || duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );

  const remaining = duration !== null ? duration - currentTime : 0;

  return (
    <div className={css.player}>
      <button
        type="button"
        className={css.playBtn}
        onClick={togglePlay}
        aria-busy={loading}
        aria-label={playing ? t('voiceMessagePlayer.pause') : t('voiceMessagePlayer.play')}
      >
        {playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
      </button>

      <div className={css.waveformWrap} onClick={handleWaveformClick}>
        {waveformData.length > 0 ? (
          <Waveform
            data={waveformData}
            height={32}
            progress={progress}
            color={`rgba(${vars.color.accentRgb}, 0.2)`}
            progressColor={vars.color.accent}
          />
        ) : (
          <div className={css.waveformLoading} />
        )}
      </div>

      <span className={css.time}>
        {duration !== null ? formatTime(playing ? remaining : duration) : '--:--'}
      </span>
    </div>
  );
}
