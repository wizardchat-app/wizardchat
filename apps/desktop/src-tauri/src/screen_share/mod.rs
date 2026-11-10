//! Screen sharing with the app's own picker. The system webviews can't
//! be told which source `getDisplayMedia()` should use, so screens and windows are captured
//! natively and streamed into the webview: video as JPEG frames (the newest one; older ones are
//! dropped when the webview falls behind), system audio as 48 kHz stereo float samples. The web app
//! turns them into the tracks it publishes to the call.

use std::sync::{Arc, Condvar, Mutex};

use base64::Engine;
use serde::Serialize;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as platform;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as platform;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
mod unsupported;
#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
use unsupported as platform;

/// A screen or window for the picker; `id` is `screen:<n>` or `window:<n>`
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    id: String,
    /// The window title; screens have none (the app numbers them)
    name: Option<String>,
    thumbnail: String,
    app_name: Option<String>,
}

pub(crate) trait Session: Send {
    fn stop(self: Box<Self>);
}

/// Where a platform capture delivers its frames and audio
#[derive(Clone)]
pub(crate) struct Sink {
    frame: FrameSlot,
    audio: Channel<InvokeResponseBody>,
}

#[derive(Default)]
struct Slot {
    frame: Option<Frame>,
    stopped: bool,
}

struct Frame {
    width: usize,
    height: usize,
    bgra: Vec<u8>,
}

impl Sink {
    /// A BGRA frame; rows may be padded to `stride` bytes
    pub(crate) fn video(&self, width: usize, height: usize, stride: usize, data: &[u8]) {
        let row = width * 4;
        if width == 0 || height == 0 || stride < row || data.len() < stride * (height - 1) + row {
            return;
        }
        let (slot, ready) = &*self.frame;
        let mut slot = slot.lock().unwrap();
        let mut bgra = slot.frame.take().map(|f| f.bgra).unwrap_or_default();
        bgra.clear();
        for y in 0..height {
            bgra.extend_from_slice(&data[y * stride..y * stride + row]);
        }
        slot.frame = Some(Frame {
            width,
            height,
            bgra,
        });
        ready.notify_one();
    }

    /// Interleaved stereo samples at 48 kHz
    pub(crate) fn audio(&self, samples: &[f32]) {
        let bytes = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let _ = self.audio.send(InvokeResponseBody::Raw(bytes));
    }
}

/// Encodes the newest frame and sends it to the webview until the capture stops
fn encode_frames(frame: FrameSlot, out: Channel<InvokeResponseBody>) {
    let (slot, ready) = &*frame;
    loop {
        let next = {
            let mut slot = slot.lock().unwrap();
            while slot.frame.is_none() && !slot.stopped {
                slot = ready.wait(slot).unwrap();
            }
            if slot.stopped {
                return;
            }
            slot.frame.take()
        };
        let Some(next) = next else { continue };
        if let Ok(jpeg) = jpeg(&next.bgra, next.width, next.height, 80) {
            if out.send(InvokeResponseBody::Raw(jpeg)).is_err() {
                return;
            }
        }
    }
}

fn jpeg(bgra: &[u8], width: usize, height: usize, quality: u8) -> Result<Vec<u8>, String> {
    let (Ok(w), Ok(h)) = (u16::try_from(width), u16::try_from(height)) else {
        return Err("frame too large".into());
    };
    let mut out = Vec::with_capacity(width * height / 4);
    jpeg_encoder::Encoder::new(&mut out, quality)
        .encode(bgra, w, h, jpeg_encoder::ColorType::Bgra)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// A thumbnail for the picker, as a data URL
pub(crate) fn thumbnail(bgra: &[u8], width: usize, height: usize) -> Option<String> {
    let jpeg = jpeg(bgra, width, height, 70).ok()?;
    Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg)
    ))
}

type FrameSlot = Arc<(Mutex<Slot>, Condvar)>;

#[derive(Default)]
pub struct Capture(Mutex<Option<(Box<dyn Session>, FrameSlot)>>);

impl Capture {
    fn stop(&self) {
        let Some((session, frame)) = self.0.lock().unwrap().take() else {
            return;
        };
        session.stop();
        let (slot, ready) = &*frame;
        slot.lock().unwrap().stopped = true;
        ready.notify_all();
    }
}

#[derive(Serialize)]
pub struct Support {
    /// Native capture with the app's picker (otherwise the webview's own picker)
    video: bool,
    /// System audio can be shared too
    audio: bool,
}

#[tauri::command]
pub fn screen_capture_supported() -> Support {
    let video = platform::supported();
    Support {
        video,
        audio: video && platform::AUDIO,
    }
}

#[tauri::command]
pub async fn desktop_sources(width: u32, height: u32) -> Result<Vec<Source>, String> {
    tauri::async_runtime::spawn_blocking(move || platform::sources(width as usize, height as usize))
        .await
        .map_err(|e| e.to_string())?
}

/// Starts capturing `id`; JPEG frames arrive on `frames`, system audio (if `audio`) on `audio_out`
#[tauri::command]
pub fn start_screen_capture(
    capture: State<'_, Capture>,
    id: String,
    audio: bool,
    frames: Channel<InvokeResponseBody>,
    audio_out: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    capture.stop();
    let frame = Arc::new((Mutex::new(Slot::default()), Condvar::new()));
    let sink = Sink {
        frame: frame.clone(),
        audio: audio_out,
    };
    let session = platform::start(&id, audio, sink)?;
    let encoder_frame = frame.clone();
    std::thread::spawn(move || encode_frames(encoder_frame, frames));
    *capture.0.lock().unwrap() = Some((session, frame));
    Ok(())
}

#[tauri::command]
pub fn stop_screen_capture(capture: State<'_, Capture>) {
    capture.stop();
}

const PICKER: &str = "share-picker";
const PICKER_SIZE: (f64, f64) = (760.0, 520.0);

#[tauri::command]
pub async fn open_share_picker(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PICKER) {
        let _ = window.set_focus();
        return Ok(());
    }
    let url = WebviewUrl::App("index.html?window=share-picker".into());
    let (width, height) = PICKER_SIZE;
    let builder = WebviewWindowBuilder::new(&app, PICKER, url)
        .title(title)
        .inner_size(width, height)
        .min_inner_size(480.0, 360.0)
        .always_on_top(true)
        .focused(true);
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten());
    let builder = match monitor {
        Some(monitor) => {
            let scale = monitor.scale_factor();
            let origin = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            builder.position(
                origin.x + (size.width - width) / 2.0,
                origin.y + (size.height - height) / 2.0,
            )
        }
        None => builder.center(),
    };
    let window = builder.build().map_err(|e| e.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.emit("share-picker-choice", None::<()>);
        }
    });
    let _ = window.set_focus();
    Ok(())
}
