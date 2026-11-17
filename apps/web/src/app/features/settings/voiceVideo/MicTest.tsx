import { useEffect, useRef, useState } from 'react';
import { useAtomValue, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import { callActionsAtom, callUiAtom } from '@/app/store/atoms/call';
import type { NoiseFilter } from '@/call/media';
import {
  createDenoiseNode,
  createMicAudioContext,
  denoiseSupported,
  stopDenoiseNode,
} from '@/call/denoise/denoise';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceVideo.css';

const FLOOR_DB = -60;

export function MicTest({
  deviceId,
  volume,
  noiseFilter,
}: {
  deviceId?: string;
  volume: number;
  noiseFilter: NoiseFilter;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const callActions = useAtomValue(callActionsAtom);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [failed, setFailed] = useState(false);
  const gainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!testing) return;
    const ui = store.get(callUiAtom);
    const mutedCall = ui.roomId && !ui.isMuted ? ui.roomId : null;
    if (mutedCall) callActions?.setMicrophone(false);

    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let denoise: AudioWorkletNode | null = null;
    let frame = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: noiseFilter === 'standard',
          },
        });
      } catch {
        if (!cancelled) {
          setFailed(true);
          setTesting(false);
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setFailed(false);
      context = noiseFilter === 'enhanced' ? createMicAudioContext() : new AudioContext();
      const gain = context.createGain();
      gain.gain.value = volumeRef.current;
      gainRef.current = gain;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      const source = context.createMediaStreamSource(stream);
      if (noiseFilter === 'enhanced' && denoiseSupported(context)) {
        try {
          denoise = await createDenoiseNode(context);
        } catch {
          denoise = null;
        }
        if (cancelled) return;
      }
      (denoise ? source.connect(denoise) : source).connect(gain).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
        setLevel(Math.min(Math.max((db - FLOOR_DB) / -FLOOR_DB, 0), 1));
        frame = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (denoise) stopDenoiseNode(denoise);
      void context?.close();
      gainRef.current = null;
      setLevel(0);
      const now = store.get(callUiAtom);
      if (mutedCall && now.roomId === mutedCall && now.isMuted) callActions?.setMicrophone(true);
    };
  }, [testing, deviceId, noiseFilter, store, callActions]);

  return (
    <>
      <div className={css.micTest}>
        <Button variant={testing ? 'secondary' : 'primary'} onClick={() => setTesting((v) => !v)}>
          {testing ? t('settings.voiceVideo.stopTest') : t('settings.voiceVideo.startTest')}
        </Button>
        <div
          className={css.meter}
          role="meter"
          aria-label={t('settings.voiceVideo.inputLevel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          <div className={css.meterFill} style={{ transform: `scaleX(${level})` }} />
        </div>
      </div>
      <p className={layoutCss.settingNote}>
        {failed ? t('settings.voiceVideo.testFailed') : t('settings.voiceVideo.testNote')}
      </p>
    </>
  );
}
