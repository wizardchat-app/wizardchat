//! Linux on X11: RandR monitors and EWMH client windows, frames via MIT-SHM (plain `GetImage` if
//! that's unavailable), the cursor via XFixes and system audio from the default output's monitor
//! via `parec`. Wayland doesn't let apps capture other windows, so there the webview's own picker
//! (the desktop portal) is used.
//!
//! The shared audio includes the call's own audio: PulseAudio/PipeWire monitors can't leave out a
//! single app's streams.

use std::{
    ffi::c_void,
    io::{ErrorKind, Read},
    process::{Child, Command, Stdio},
    ptr::null_mut,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use rustix::mm::{mmap, munmap, MapFlags, ProtFlags};
use x11rb::{
    connection::Connection,
    errors::ReplyError,
    protocol::{
        randr::ConnectionExt as _,
        shm::{self, ConnectionExt as _},
        xfixes::{self, ConnectionExt as _},
        xproto::{
            AtomEnum, ConnectionExt as _, Drawable, ImageFormat, ImageOrder, MapState, Window,
            WindowClass,
        },
    },
    rust_connection::RustConnection,
};

use super::{thumbnail, Session, Sink, Source};

/// Off: a PulseAudio/PipeWire monitor can't leave out the call's own audio, which would echo
/// back to everyone. The `parec` capture below is ready for when it can.
pub const AUDIO: bool = false;

pub fn supported() -> bool {
    let set = |name| std::env::var_os(name).is_some_and(|v| !v.is_empty());
    set("DISPLAY")
        && !set("WAYLAND_DISPLAY")
        && std::env::var("XDG_SESSION_TYPE").map_or(true, |t| t != "wayland")
}

/// Shared streams are scaled to fit this, like the web's 1080p screen share preset
const MAX_WIDTH: usize = 1920;
const MAX_HEIGHT: usize = 1080;
const MIN_WINDOW_SIZE: u16 = 64;
/// Without shared memory every frame goes through the X socket
const PLAIN_INTERVAL: Duration = Duration::from_micros(66_666);

x11rb::atom_manager! {
    Atoms: AtomsCookie {
        _NET_CLIENT_LIST,
        _NET_WM_NAME,
        _NET_WM_PID,
        _NET_WM_STATE,
        _NET_WM_STATE_HIDDEN,
        _NET_WM_WINDOW_TYPE,
        _NET_WM_WINDOW_TYPE_NORMAL,
        UTF8_STRING,
    }
}

#[derive(Clone, Copy)]
struct Rect {
    x: i32,
    y: i32,
    width: usize,
    height: usize,
}

/// The on-screen part of a target (in the drawable's coordinates) and its position on the root
struct Region {
    drawable: Drawable,
    rect: Rect,
    origin: (i32, i32),
}

#[derive(Clone, Copy)]
enum Target {
    Screen(Rect),
    Window(Window),
}

struct WindowInfo {
    id: Window,
    name: String,
    app_name: Option<String>,
}

struct X {
    conn: RustConnection,
    root: Window,
    atoms: Atoms,
}

impl X {
    fn connect() -> Result<Self, String> {
        let (conn, screen) = x11rb::connect(None).map_err(|e| e.to_string())?;
        let root = conn.setup().roots[screen].root;
        let atoms = Atoms::new(&conn)
            .map_err(|e| e.to_string())?
            .reply()
            .map_err(|e| e.to_string())?;
        Ok(Self { conn, root, atoms })
    }

    fn property(&self, window: Window, property: u32, kind: impl Into<u32>) -> Option<Vec<u8>> {
        let reply = self
            .conn
            .get_property(false, window, property, kind, 0, 1 << 16)
            .ok()?
            .reply()
            .ok()?;
        (reply.format != 0).then_some(reply.value)
    }

    fn property32(&self, window: Window, property: u32, kind: impl Into<u32>) -> Vec<u32> {
        self.property(window, property, kind)
            .map(|v| {
                v.as_chunks::<4>()
                    .0
                    .iter()
                    .map(|b| u32::from_ne_bytes(*b))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn root_size(&self) -> Result<(i32, i32), ReplyError> {
        let root = self.conn.get_geometry(self.root)?.reply()?;
        Ok((root.width.into(), root.height.into()))
    }

    fn screens(&self) -> Vec<Rect> {
        let monitors = self
            .conn
            .randr_query_version(1, 5)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|_| self.conn.randr_get_monitors(self.root, true).ok())
            .and_then(|c| c.reply().ok())
            .map(|r| r.monitors)
            .unwrap_or_default();
        let screens: Vec<Rect> = monitors
            .iter()
            .map(|m| Rect {
                x: m.x.into(),
                y: m.y.into(),
                width: m.width.into(),
                height: m.height.into(),
            })
            .collect();
        if !screens.is_empty() {
            return screens;
        }
        let Ok((width, height)) = self.root_size() else {
            return Vec::new();
        };
        vec![Rect {
            x: 0,
            y: 0,
            width: width as usize,
            height: height as usize,
        }]
    }

    /// Normal windows of other apps that are on screen and have a title
    fn windows(&self) -> Vec<WindowInfo> {
        let a = &self.atoms;
        self.property32(self.root, a._NET_CLIENT_LIST, AtomEnum::WINDOW)
            .into_iter()
            .filter_map(|w| self.window(w))
            .collect()
    }

    fn window(&self, id: Window) -> Option<WindowInfo> {
        let a = &self.atoms;
        let attributes = self.conn.get_window_attributes(id).ok()?.reply().ok()?;
        if attributes.map_state != MapState::VIEWABLE || attributes.class == WindowClass::INPUT_ONLY
        {
            return None;
        }
        let geometry = self.conn.get_geometry(id).ok()?.reply().ok()?;
        if geometry.width < MIN_WINDOW_SIZE || geometry.height < MIN_WINDOW_SIZE {
            return None;
        }
        let pid = self.property32(id, a._NET_WM_PID, AtomEnum::CARDINAL);
        if pid.first() == Some(&std::process::id()) {
            return None;
        }
        let types = self.property32(id, a._NET_WM_WINDOW_TYPE, AtomEnum::ATOM);
        if !types.is_empty() && !types.contains(&a._NET_WM_WINDOW_TYPE_NORMAL) {
            return None;
        }
        if self
            .property32(id, a._NET_WM_STATE, AtomEnum::ATOM)
            .contains(&a._NET_WM_STATE_HIDDEN)
        {
            return None;
        }
        let name = self
            .property(id, a._NET_WM_NAME, a.UTF8_STRING)
            .or_else(|| self.property(id, AtomEnum::WM_NAME.into(), AtomEnum::ANY))
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .filter(|n| !n.is_empty())?;
        let app_name = self
            .property(id, AtomEnum::WM_CLASS.into(), AtomEnum::STRING)
            .and_then(|v| {
                v.split(|b| *b == 0)
                    .nth(1)
                    .map(|c| String::from_utf8_lossy(c).to_string())
            })
            .filter(|c| !c.is_empty());
        Some(WindowInfo { id, name, app_name })
    }

    fn region(&self, target: Target) -> Result<Option<Region>, ReplyError> {
        let (drawable, area, origin) = match target {
            Target::Screen(rect) => (self.root, rect, (rect.x, rect.y)),
            Target::Window(window) => {
                let geometry = self.conn.get_geometry(window)?;
                let position = self.conn.translate_coordinates(window, self.root, 0, 0)?;
                let (geometry, position) = (geometry.reply()?, position.reply()?);
                let area = Rect {
                    x: 0,
                    y: 0,
                    width: geometry.width.into(),
                    height: geometry.height.into(),
                };
                (window, area, (position.dst_x.into(), position.dst_y.into()))
            }
        };
        // `GetImage` fails for anything off screen
        let (root_width, root_height) = self.root_size()?;
        let left = origin.0.max(0);
        let top = origin.1.max(0);
        let right = (origin.0 + area.width as i32).min(root_width);
        let bottom = (origin.1 + area.height as i32).min(root_height);
        if right - left < 2 || bottom - top < 2 {
            return Ok(None);
        }
        let visible = Rect {
            x: area.x + left - origin.0,
            y: area.y + top - origin.1,
            width: (right - left) as usize,
            height: (bottom - top) as usize,
        };
        Ok(Some(Region {
            drawable,
            rect: visible,
            origin: (left, top),
        }))
    }

    /// Whether images of this depth are 32-bit BGRx
    fn bgrx(&self, depth: u8) -> bool {
        let setup = self.conn.setup();
        setup.image_byte_order == ImageOrder::LSB_FIRST
            && matches!(depth, 24 | 32)
            && setup
                .pixmap_formats
                .iter()
                .any(|f| f.depth == depth && f.bits_per_pixel == 32)
    }

    fn image(&self, drawable: Drawable, rect: Rect) -> Option<Vec<u8>> {
        let reply = self
            .conn
            .get_image(
                ImageFormat::Z_PIXMAP,
                drawable,
                rect.x as i16,
                rect.y as i16,
                rect.width as u16,
                rect.height as u16,
                !0,
            )
            .ok()?
            .reply()
            .ok()?;
        (self.bgrx(reply.depth) && reply.data.len() >= rect.width * rect.height * 4)
            .then_some(reply.data)
    }

    fn snapshot(&self, target: Target, width: usize, height: usize) -> Option<String> {
        let Region { drawable, rect, .. } = self.region(target).ok()??;
        let pixels = self.image(drawable, rect)?;
        let (w, h) = fit(rect.width, rect.height, width, height);
        let mut scaled = Vec::new();
        scale(
            &pixels,
            rect.width * 4,
            (rect.width, rect.height),
            (w, h),
            &mut scaled,
        );
        thumbnail(&scaled, w, h)
    }
}

fn fit(width: usize, height: usize, max_width: usize, max_height: usize) -> (usize, usize) {
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    (
        ((width as f64 * scale) as usize).max(2) & !1,
        ((height as f64 * scale) as usize).max(2) & !1,
    )
}

/// Scales BGRx pixels to tightly packed, opaque BGRA by averaging
fn scale(
    src: &[u8],
    stride: usize,
    (src_width, src_height): (usize, usize),
    (width, height): (usize, usize),
    out: &mut Vec<u8>,
) {
    let span = |i: usize, from: usize, to: usize| {
        let start = (i * from / to).min(from - 1);
        (start, ((i + 1) * from / to).clamp(start + 1, from))
    };
    let columns: Vec<(usize, usize)> = (0..width).map(|x| span(x, src_width, width)).collect();
    out.clear();
    out.reserve(width * height * 4);
    for y in 0..height {
        let (top, bottom) = span(y, src_height, height);
        for &(left, right) in &columns {
            let mut sum = [0u32; 3];
            for row in top..bottom {
                let line = &src[row * stride + left * 4..row * stride + right * 4];
                for px in line.as_chunks::<4>().0 {
                    sum[0] += u32::from(px[0]);
                    sum[1] += u32::from(px[1]);
                    sum[2] += u32::from(px[2]);
                }
            }
            let n = ((bottom - top) * (right - left)) as u32;
            out.extend_from_slice(&[
                (sum[0] / n) as u8,
                (sum[1] / n) as u8,
                (sum[2] / n) as u8,
                255,
            ]);
        }
    }
}

/// Draws the premultiplied ARGB cursor onto the BGRx pixels of the area at `origin` on the root
fn draw_cursor(
    pixels: &mut [u8],
    (width, height): (usize, usize),
    origin: (i32, i32),
    cursor: &xfixes::GetCursorImageReply,
) {
    let left = i32::from(cursor.x) - i32::from(cursor.xhot) - origin.0;
    let top = i32::from(cursor.y) - i32::from(cursor.yhot) - origin.1;
    let cursor_width = usize::from(cursor.width);
    for (cy, row) in cursor
        .cursor_image
        .chunks_exact(cursor_width.max(1))
        .enumerate()
    {
        let y = top + cy as i32;
        if y < 0 || y as usize >= height {
            continue;
        }
        for (cx, argb) in row.iter().enumerate() {
            let x = left + cx as i32;
            let alpha = argb >> 24;
            if x < 0 || x as usize >= width || alpha == 0 {
                continue;
            }
            let i = (y as usize * width + x as usize) * 4;
            for (c, dst) in pixels[i..i + 3].iter_mut().enumerate() {
                let src = (argb >> (c * 8)) & 0xff;
                *dst = (src + u32::from(*dst) * (255 - alpha) / 255).min(255) as u8;
            }
        }
    }
}

pub fn sources(width: usize, height: usize) -> Result<Vec<Source>, String> {
    let x = X::connect()?;
    let mut sources = Vec::new();
    for (n, screen) in x.screens().into_iter().enumerate() {
        sources.push(Source {
            id: format!("screen:{n}"),
            name: None,
            thumbnail: x
                .snapshot(Target::Screen(screen), width, height)
                .unwrap_or_default(),
            app_name: None,
        });
    }
    for window in x.windows() {
        sources.push(Source {
            id: format!("window:{}", window.id),
            name: Some(window.name),
            thumbnail: x
                .snapshot(Target::Window(window.id), width, height)
                .unwrap_or_default(),
            app_name: window.app_name,
        });
    }
    Ok(sources)
}

/// A shared memory segment the X server writes images into
struct Shm {
    seg: shm::Seg,
    data: *mut c_void,
    size: usize,
}

impl Shm {
    fn new(conn: &RustConnection, size: usize) -> Option<Self> {
        let seg = conn.generate_id().ok()?;
        let reply = conn
            .shm_create_segment(seg, u32::try_from(size).ok()?, false)
            .ok()?
            .reply()
            .ok()?;
        let data = unsafe {
            mmap(
                null_mut(),
                size,
                ProtFlags::READ | ProtFlags::WRITE,
                MapFlags::SHARED,
                &reply.shm_fd,
                0,
            )
        };
        let Ok(data) = data else {
            let _ = conn.shm_detach(seg);
            return None;
        };
        Some(Self { seg, data, size })
    }

    fn free(self, conn: &RustConnection) {
        unsafe {
            let _ = munmap(self.data, self.size);
        }
        let _ = conn.shm_detach(self.seg);
    }
}

/// Whether the server can hand out shared memory segments (MIT-SHM 1.2)
fn shm_supported(conn: &RustConnection) -> bool {
    conn.shm_query_version()
        .ok()
        .and_then(|c| c.reply().ok())
        .is_some_and(|v| (v.major_version, v.minor_version) >= (1, 2))
}

fn cursor_supported(conn: &RustConnection) -> bool {
    conn.xfixes_query_version(4, 0)
        .ok()
        .and_then(|c| c.reply().ok())
        .is_some()
}

fn capture(x: X, target: Target, sink: Sink, stop: Arc<AtomicBool>) {
    let mut shm = shm_supported(&x.conn).then_some(None::<Shm>);
    let cursor = cursor_supported(&x.conn);
    let mut scaled = Vec::new();
    let mut next = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        let Ok(region) = x.region(target) else {
            break;
        };
        if let Some(Region {
            drawable,
            rect,
            origin,
        }) = region
        {
            let size = rect.width * rect.height * 4;
            if let Some(segment) = shm.as_mut() {
                if let Some(old) = segment.take_if(|s| s.size < size) {
                    old.free(&x.conn);
                }
                if segment.is_none() {
                    *segment = Shm::new(&x.conn, size);
                }
            }
            // Remote displays, for one, can't share memory
            if shm.as_ref().is_some_and(|s| s.is_none()) {
                shm = None;
            }
            let cursor_image = cursor
                .then(|| x.conn.xfixes_get_cursor_image().ok())
                .flatten();
            let mut plain;
            let pixels: Option<&mut [u8]> = match shm.as_ref() {
                Some(Some(segment)) => x
                    .conn
                    .shm_get_image(
                        drawable,
                        rect.x as i16,
                        rect.y as i16,
                        rect.width as u16,
                        rect.height as u16,
                        !0,
                        ImageFormat::Z_PIXMAP.into(),
                        segment.seg,
                        0,
                    )
                    .ok()
                    .and_then(|c| c.reply().ok())
                    .filter(|r| x.bgrx(r.depth) && r.size as usize >= size)
                    .map(|_| unsafe {
                        std::slice::from_raw_parts_mut(segment.data.cast::<u8>(), size)
                    }),
                _ => match x.image(drawable, rect) {
                    Some(data) => {
                        plain = data;
                        Some(&mut plain[..size])
                    }
                    None => None,
                },
            };
            let cursor_image = cursor_image.and_then(|c| c.reply().ok());
            if let Some(pixels) = pixels {
                if let Some(cursor_image) = &cursor_image {
                    draw_cursor(pixels, (rect.width, rect.height), origin, cursor_image);
                }
                let (width, height) = fit(rect.width, rect.height, MAX_WIDTH, MAX_HEIGHT);
                scale(
                    pixels,
                    rect.width * 4,
                    (rect.width, rect.height),
                    (width, height),
                    &mut scaled,
                );
                sink.video(width, height, width * 4, &scaled);
            }
        }
        next += if shm.is_some() {
            sink.interval()
        } else {
            PLAIN_INTERVAL
        };
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            next = now;
        }
    }
    if let Some(Some(segment)) = shm {
        segment.free(&x.conn);
    }
}

/// The default output's monitor, as interleaved stereo float samples at 48 kHz
fn system_audio(sink: Sink) -> Option<(Child, JoinHandle<()>)> {
    let mut child = Command::new("parec")
        .args([
            "--device=@DEFAULT_MONITOR@",
            "--format=float32le",
            "--rate=48000",
            "--channels=2",
            "--latency-msec=20",
            "--raw",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let Some(mut out) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    };
    let reader = std::thread::spawn(move || {
        // 10 ms of stereo samples
        let mut buffer = [0u8; 480 * 8];
        let mut filled = 0;
        let mut samples = Vec::new();
        loop {
            match out.read(&mut buffer[filled..]) {
                Ok(0) => return,
                Ok(n) => filled += n,
                Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                Err(_) => return,
            }
            let whole = filled - filled % 8;
            if whole == 0 {
                continue;
            }
            samples.clear();
            samples.extend(
                buffer[..whole]
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .map(|b| f32::from_le_bytes(*b)),
            );
            sink.audio(&samples);
            buffer.copy_within(whole..filled, 0);
            filled -= whole;
        }
    });
    Some((child, reader))
}

struct Capture {
    stop: Arc<AtomicBool>,
    video: JoinHandle<()>,
    audio: Option<(Child, JoinHandle<()>)>,
}

impl Session for Capture {
    fn stop(self: Box<Self>) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some((mut child, reader)) = self.audio {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
        }
        let _ = self.video.join();
    }
}

pub fn start(id: &str, with_audio: bool, sink: Sink) -> Result<Box<dyn Session>, String> {
    let with_audio = with_audio && AUDIO;
    let x = X::connect()?;
    let (kind, number) = id.split_once(':').ok_or("unknown source")?;
    let number: u32 = number.parse().map_err(|_| "unknown source")?;
    let target = match kind {
        "screen" => Target::Screen(*x.screens().get(number as usize).ok_or("screen not found")?),
        "window" => {
            x.conn
                .get_geometry(number)
                .map_err(|e| e.to_string())?
                .reply()
                .map_err(|_| "window not found")?;
            Target::Window(number)
        }
        _ => return Err("unknown source".into()),
    };
    let audio = with_audio.then(|| system_audio(sink.clone())).flatten();
    let stop = Arc::new(AtomicBool::new(false));
    let video_stop = stop.clone();
    let video = std::thread::spawn(move || capture(x, target, sink, video_stop));
    Ok(Box::new(Capture { stop, video, audio }))
}
