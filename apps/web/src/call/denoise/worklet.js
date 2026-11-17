/* global registerProcessor, AudioWorkletProcessor, sampleRate */

class DenoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.running = true;
    if (sampleRate === 48000) {
      const instance = new WebAssembly.Instance(
        new WebAssembly.Module(options.processorOptions.wasm),
        {}
      );
      this.wasm = instance.exports;
      this.denoiser = this.wasm.wz_denoise_new(32768);
      this.buffer = this.wasm.wz_denoise_buffer(128);
      this.view = null;
    }
    this.port.onmessage = () => {
      this.running = false;
      if (this.wasm) this.wasm.wz_denoise_free(this.denoiser);
      this.wasm = null;
    };
  }

  process(inputs, outputs) {
    if (!this.running) return false;
    const input = inputs[0][0];
    const output = outputs[0][0];
    if (!input) {
      output.fill(0);
      return true;
    }
    if (!this.wasm || input.length > 128) {
      output.set(input);
      return true;
    }
    if (!this.view || this.view.buffer !== this.wasm.memory.buffer) {
      this.view = new Float32Array(this.wasm.memory.buffer, this.buffer, 128);
    }
    const samples = this.view.subarray(0, input.length);
    samples.set(input);
    this.wasm.wz_denoise_process(this.denoiser, this.buffer, input.length);
    output.set(samples);
    return true;
  }
}

registerProcessor('wizardchat-denoise', DenoiseProcessor);
