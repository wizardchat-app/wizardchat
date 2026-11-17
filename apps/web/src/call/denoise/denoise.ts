const VERSION = `?v=${import.meta.env.APP_VERSION}`;
const WASM_URL = `/assets/denoise/denoise.wasm${VERSION}`;
const WORKLET_URL = `/assets/denoise/worklet.js${VERSION}`;

export const DENOISE_SAMPLE_RATE = 48000;

export function createMicAudioContext() {
  // Firefox can't connect a microphone to a context running at another rate
  return navigator.userAgent.includes('Firefox')
    ? new AudioContext()
    : new AudioContext({ sampleRate: DENOISE_SAMPLE_RATE });
}

let wasm: Promise<ArrayBuffer> | undefined;
const worklets = new WeakMap<BaseAudioContext, Promise<void>>();

function loadWasm() {
  if (!wasm) {
    wasm = fetch(WASM_URL).then((response) => {
      if (!response.ok) throw new Error(`denoise.wasm: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    wasm.catch(() => {
      wasm = undefined;
    });
  }
  return wasm;
}

function loadWorklet(context: BaseAudioContext) {
  let ready = worklets.get(context);
  if (!ready) {
    ready = context.audioWorklet.addModule(WORKLET_URL);
    worklets.set(context, ready);
    ready.catch(() => worklets.delete(context));
  }
  return ready;
}

export function denoiseSupported(context: BaseAudioContext) {
  return typeof AudioWorkletNode !== 'undefined' && context.sampleRate === DENOISE_SAMPLE_RATE;
}

export async function createDenoiseNode(context: BaseAudioContext): Promise<AudioWorkletNode> {
  const [bytes] = await Promise.all([loadWasm(), loadWorklet(context)]);
  return new AudioWorkletNode(context, 'wizardchat-denoise', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { wasm: bytes },
  });
}

export function stopDenoiseNode(node: AudioWorkletNode) {
  node.disconnect();
  node.port.postMessage('stop');
}
