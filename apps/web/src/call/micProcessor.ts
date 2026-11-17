import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { createDenoiseNode, denoiseSupported, stopDenoiseNode } from './denoise/denoise';

export class MicProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'wizardchat-mic';
  processedTrack?: MediaStreamTrack;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private denoise?: AudioWorkletNode;
  private node?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private wiring = 0;

  constructor(
    private gain: number,
    private denoising: boolean,
    private readonly onError: (error: unknown) => void
  ) {}

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    this.context = audioContext;
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.node = audioContext.createGain();
    this.node.gain.value = this.gain;
    this.destination = audioContext.createMediaStreamDestination();
    this.node.connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
    await this.wire();
    if (audioContext.state === 'suspended') await audioContext.resume();
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(options);
  }

  async destroy(): Promise<void> {
    this.wiring++;
    this.source?.disconnect();
    if (this.denoise) stopDenoiseNode(this.denoise);
    this.node?.disconnect();
    this.processedTrack?.stop();
    this.context = undefined;
    this.source = undefined;
    this.denoise = undefined;
    this.node = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
  }

  get denoiseActive() {
    return !!this.denoise;
  }

  setGain(gain: number): void {
    this.gain = gain;
    if (this.node) this.node.gain.value = gain;
  }

  async setDenoise(enabled: boolean): Promise<void> {
    if (this.denoising === enabled) return;
    this.denoising = enabled;
    await this.wire();
  }

  private async wire() {
    const { context, source, node } = this;
    if (!context || !source || !node) return;
    const wiring = ++this.wiring;
    let denoise: AudioWorkletNode | undefined;
    if (this.denoising && denoiseSupported(context)) {
      try {
        denoise = await createDenoiseNode(context);
      } catch (error) {
        this.onError(error);
      }
      if (wiring !== this.wiring) {
        if (denoise) stopDenoiseNode(denoise);
        return;
      }
    }
    source.disconnect();
    if (this.denoise) stopDenoiseNode(this.denoise);
    this.denoise = denoise;
    if (denoise) source.connect(denoise).connect(node);
    else source.connect(node);
  }
}
