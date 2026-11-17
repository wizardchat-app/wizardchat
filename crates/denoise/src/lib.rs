use nnnoiseless::DenoiseState;

pub const FRAME: usize = DenoiseState::FRAME_SIZE;
pub const SAMPLE_RATE: u32 = 48_000;

pub struct Denoiser {
    state: Box<DenoiseState<'static>>,
    scale: f32,
    input: [f32; FRAME],
    output: [f32; FRAME],
    pos: usize,
    streaming: bool,
    vad: f32,
}

impl Denoiser {
    pub fn new(scale: f32) -> Self {
        Self {
            state: DenoiseState::new(),
            scale,
            input: [0.0; FRAME],
            output: [0.0; FRAME],
            pos: 0,
            streaming: false,
            vad: 0.0,
        }
    }

    pub fn process(&mut self, samples: &mut [f32]) -> f32 {
        if !self.streaming && samples.len().is_multiple_of(FRAME) {
            for chunk in samples.as_chunks_mut::<FRAME>().0 {
                for (input, sample) in self.input.iter_mut().zip(chunk.iter()) {
                    *input = sample * self.scale;
                }
                self.run();
                for (sample, output) in chunk.iter_mut().zip(self.output.iter()) {
                    *sample = output / self.scale;
                }
            }
            return self.vad;
        }
        self.streaming = true;
        for sample in samples.iter_mut() {
            self.input[self.pos] = *sample * self.scale;
            *sample = self.output[self.pos] / self.scale;
            self.pos += 1;
            if self.pos == FRAME {
                self.run();
                self.pos = 0;
            }
        }
        self.vad
    }

    fn run(&mut self) {
        self.vad = self.state.process_frame(&mut self.output, &self.input);
    }
}

#[no_mangle]
pub extern "C" fn wz_denoise_new(scale: f32) -> *mut Denoiser {
    Box::into_raw(Box::new(Denoiser::new(scale)))
}

/// # Safety
/// `denoiser` comes from `wz_denoise_new`, and `samples` points to `len` floats
#[no_mangle]
pub unsafe extern "C" fn wz_denoise_process(
    denoiser: *mut Denoiser,
    samples: *mut f32,
    len: usize,
) -> f32 {
    if denoiser.is_null() || samples.is_null() {
        return 0.0;
    }
    (*denoiser).process(std::slice::from_raw_parts_mut(samples, len))
}

/// # Safety
/// `denoiser` comes from `wz_denoise_new` and isn't used afterwards
#[no_mangle]
pub unsafe extern "C" fn wz_denoise_free(denoiser: *mut Denoiser) {
    if !denoiser.is_null() {
        drop(Box::from_raw(denoiser));
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn wz_denoise_buffer(len: usize) -> *mut f32 {
    Box::leak(vec![0.0f32; len].into_boxed_slice()).as_mut_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noise(len: usize) -> Vec<f32> {
        let mut seed = 12345u64;
        (0..len)
            .map(|_| {
                seed = seed
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                ((seed >> 33) as f32 / (1u64 << 31) as f32 * 2.0 - 1.0) * 0.001
            })
            .collect()
    }

    fn energy(samples: &[f32]) -> f32 {
        samples.iter().map(|s| s * s).sum()
    }

    #[test]
    fn suppresses_quiet_noise() {
        let input = noise(FRAME * 200);
        let mut output = input.clone();
        let mut denoiser = Denoiser::new(32768.0);
        for chunk in output.chunks_mut(FRAME) {
            denoiser.process(chunk);
        }
        let tail = FRAME * 100..;
        let ratio = energy(&output[tail.clone()]) / energy(&input[tail]);
        assert!(ratio < 0.01);
    }

    #[test]
    fn streaming_matches_whole_frames_one_frame_later() {
        let input = noise(FRAME * 20);
        let mut whole = input.clone();
        Denoiser::new(32768.0).process(&mut whole);
        let mut streamed = input.clone();
        let mut denoiser = Denoiser::new(32768.0);
        for chunk in streamed.chunks_mut(128) {
            denoiser.process(chunk);
        }
        assert!(streamed[..FRAME].iter().all(|s| *s == 0.0));
        let end = streamed.len() - streamed.len() % FRAME;
        for (a, b) in streamed[FRAME..end].iter().zip(&whole[..end - FRAME]) {
            assert!((a - b).abs() < 1e-6);
        }
    }
}
