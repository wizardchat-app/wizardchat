import { useEffect, useRef, useState } from 'react';
import type { TrackHandle } from '@/call/media';

export interface StreamStats {
  width: number;
  height: number;
  fps: number;
}

interface VideoRtpStats {
  type: string;
  kind?: string;
  timestamp: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  framesDecoded?: number;
  framesSent?: number;
  active?: boolean;
}

const POLL_MS = 5000;

export function useStreamStats(
  track: TrackHandle | null,
  enabled: boolean,
  sendingFps: number
): StreamStats | null {
  const [stats, setStats] = useState<StreamStats | null>(null);
  const sendingFpsRef = useRef(sendingFps);
  sendingFpsRef.current = sendingFps;

  useEffect(() => {
    setStats(null);
    if (!track || !enabled) return;
    let cancelled = false;
    let previous: { frames: number; timestamp: number } | null = null;

    const poll = async () => {
      const report = await track.getRTCStatsReport().catch(() => undefined);
      if (cancelled || !report) return;
      let best: VideoRtpStats | null = null;
      report.forEach((entry: VideoRtpStats) => {
        if (entry.type !== 'inbound-rtp' && entry.type !== 'outbound-rtp') return;
        if (entry.kind && entry.kind !== 'video') return;
        if (!best || (entry.frameHeight ?? 0) > (best.frameHeight ?? 0)) best = entry;
      });
      const rtp = best as VideoRtpStats | null;
      if (rtp?.type === 'outbound-rtp' && (rtp.active === false || !rtp.frameHeight)) {
        previous = null;
        const { width, height, frameRate } = track.mediaStreamTrack.getSettings();
        setStats(
          width && height
            ? { width, height, fps: Math.round(frameRate ?? sendingFpsRef.current) }
            : null
        );
        return;
      }
      if (!rtp?.frameWidth || !rtp.frameHeight) {
        setStats(null);
        return;
      }
      const frames = rtp.type === 'inbound-rtp' ? rtp.framesDecoded : rtp.framesSent;
      let fps = rtp.framesPerSecond;
      if (frames !== undefined) {
        if (previous && rtp.timestamp > previous.timestamp)
          fps = ((frames - previous.frames) * 1000) / (rtp.timestamp - previous.timestamp);
        previous = { frames, timestamp: rtp.timestamp };
      }
      if (fps === undefined) return;
      setStats({
        width: rtp.frameWidth,
        height: rtp.frameHeight,
        fps: Math.max(0, Math.round(fps)),
      });
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [track, enabled]);

  return stats;
}
