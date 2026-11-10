//! Windows: GDI for the source list and thumbnails, Windows Graphics Capture for video and WASAPI
//! process loopback for system audio

use std::{
    collections::HashMap,
    ffi::c_void,
    mem::{size_of, ManuallyDrop},
    ptr::null_mut,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};

use windows::{
    core::{factory, implement, Interface, Ref, BOOL, HRESULT, PCWSTR, PWSTR},
    Foundation::TimeSpan,
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM, RECT, WAIT_OBJECT_0},
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
                D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
            },
            Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
            Dxgi::IDXGIDevice,
            Gdi::{
                CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection, DeleteDC,
                DeleteObject, EnumDisplayMonitors, GdiFlush, GetDC, GetMonitorInfoW, ReleaseDC,
                SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
                CAPTUREBLT, DIB_RGB_COLORS, HALFTONE, HDC, HMONITOR, MONITORINFO, SRCCOPY,
            },
        },
        Media::{
            Audio::{
                ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
                IActivateAudioInterfaceCompletionHandler,
                IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient,
                AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
                AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
                PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
                PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, WAVEFORMATEX,
            },
            Multimedia::WAVE_FORMAT_IEEE_FLOAT,
        },
        Storage::{
            FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW},
            Xps::{PrintWindow, PRINT_WINDOW_FLAGS},
        },
        System::{
            Com::{CoInitializeEx, StructuredStorage::PROPVARIANT, BLOB, COINIT_MULTITHREADED},
            Threading::{
                CreateEventW, OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject,
                PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
            },
            Variant::VT_BLOB,
            WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
            },
        },
        UI::WindowsAndMessaging::{
            EnumChildWindows, EnumWindows, GetShellWindow, GetWindow, GetWindowLongW,
            GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
            IsHungAppWindow, IsIconic, IsWindow, IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
            WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        },
    },
};

use super::{thumbnail, Session, Sink, Source};

/// System audio without the app's own (process loopback excludes it)
pub const AUDIO: bool = true;

pub fn supported() -> bool {
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
}

/// Shared streams are scaled to fit this, like the web's 1080p screen share preset
const MAX_WIDTH: usize = 1920;
const MAX_HEIGHT: usize = 1080;
const MIN_WINDOW_SIZE: i32 = 64;
const FRAME_INTERVAL: Duration = Duration::from_micros(33_333);
const TIMEOUT: Duration = Duration::from_secs(10);
/// Renders windows drawn with DirectComposition too (Chromium, WinUI)
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

fn fit(width: usize, height: usize, max_width: usize, max_height: usize) -> (usize, usize) {
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    (
        ((width as f64 * scale) as usize).max(2) & !1,
        ((height as f64 * scale) as usize).max(2) & !1,
    )
}

fn size(rect: &RECT) -> (i32, i32) {
    (rect.right - rect.left, rect.bottom - rect.top)
}

fn monitors() -> Vec<(HMONITOR, RECT)> {
    unsafe extern "system" fn add(monitor: HMONITOR, _: HDC, _: *mut RECT, list: LPARAM) -> BOOL {
        let list = unsafe { &mut *(list.0 as *mut Vec<(HMONITOR, RECT)>) };
        let mut info = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
            list.push((monitor, info.rcMonitor));
        }
        true.into()
    }
    let mut list: Vec<(HMONITOR, RECT)> = Vec::new();
    let _ = unsafe { EnumDisplayMonitors(None, None, Some(add), LPARAM(&raw mut list as isize)) };
    list
}

/// The window's visible bounds, without the invisible resize borders
fn bounds(window: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&raw mut rect).cast(),
            size_of::<RECT>() as u32,
        )
    }
    .or_else(|_| unsafe { GetWindowRect(window, &mut rect) })
    .ok()?;
    Some(rect)
}

fn title(window: HWND) -> Option<String> {
    let length = unsafe { GetWindowTextLengthW(window) };
    if length <= 0 {
        return None;
    }
    let mut text = vec![0u16; length as usize + 1];
    let length = unsafe { GetWindowTextW(window, &mut text) };
    let title = String::from_utf16_lossy(&text[..length.max(0) as usize]);
    (!title.trim().is_empty()).then_some(title)
}

/// Normal windows of other apps that are on screen and have a title
fn windows() -> Vec<(HWND, String, RECT, u32)> {
    unsafe extern "system" fn add(window: HWND, list: LPARAM) -> BOOL {
        let list = unsafe { &mut *(list.0 as *mut Vec<HWND>) };
        list.push(window);
        true.into()
    }
    let mut all: Vec<HWND> = Vec::new();
    let _ = unsafe { EnumWindows(Some(add), LPARAM(&raw mut all as isize)) };
    let own = std::process::id();
    let shell = unsafe { GetShellWindow() };
    all.into_iter()
        .filter_map(|window| unsafe {
            // Drawing a hung window's thumbnail would block
            if window == shell
                || !IsWindowVisible(window).as_bool()
                || IsIconic(window).as_bool()
                || IsHungAppWindow(window).as_bool()
            {
                return None;
            }
            let style = GetWindowLongW(window, GWL_EXSTYLE) as u32;
            let owned = GetWindow(window, GW_OWNER).is_ok_and(|o| !o.is_invalid());
            if style & WS_EX_TOOLWINDOW.0 != 0 || (owned && style & WS_EX_APPWINDOW.0 == 0) {
                return None;
            }
            let mut cloaked = 0u32;
            let _ = DwmGetWindowAttribute(
                window,
                DWMWA_CLOAKED,
                (&raw mut cloaked).cast(),
                size_of::<u32>() as u32,
            );
            let mut pid = 0;
            GetWindowThreadProcessId(window, Some(&mut pid));
            if cloaked != 0 || pid == own {
                return None;
            }
            let rect = bounds(window)?;
            let (w, h) = size(&rect);
            if w < MIN_WINDOW_SIZE || h < MIN_WINDOW_SIZE {
                return None;
            }
            Some((window, title(window)?, rect, pid))
        })
        .collect()
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

fn process_path(pid: u32) -> Option<String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut path = vec![0u16; 1024];
    let mut length = path.len() as u32;
    let found = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        )
    };
    let _ = unsafe { CloseHandle(process) };
    found.ok()?;
    Some(String::from_utf16_lossy(&path[..length as usize]))
}

fn app_name(pid: u32) -> Option<String> {
    let path = process_path(pid)?;
    description(&path).or_else(|| {
        std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
    })
}

fn description(path: &str) -> Option<String> {
    let path = wide(path);
    let size = unsafe { GetFileVersionInfoSizeW(PCWSTR(path.as_ptr()), None) };
    if size == 0 {
        return None;
    }
    let mut info = vec![0u8; size as usize];
    unsafe { GetFileVersionInfoW(PCWSTR(path.as_ptr()), None, size, info.as_mut_ptr().cast()) }
        .ok()?;
    let query = |key: &str| -> Option<(*const c_void, u32)> {
        let key = wide(key);
        let mut value = null_mut();
        let mut length = 0;
        unsafe {
            VerQueryValueW(
                info.as_ptr().cast(),
                PCWSTR(key.as_ptr()),
                &mut value,
                &mut length,
            )
        }
        .as_bool()
        .then_some((value.cast_const(), length))
    };
    let (translation, length) = query("\\VarFileInfo\\Translation")?;
    if length < 4 {
        return None;
    }
    let [language, codepage] = unsafe { *translation.cast::<[u16; 2]>() };
    let (text, length) = query(&format!(
        "\\StringFileInfo\\{language:04x}{codepage:04x}\\FileDescription"
    ))?;
    let text = unsafe { std::slice::from_raw_parts(text.cast::<u16>(), length as usize) };
    let text = String::from_utf16_lossy(text);
    let text = text.trim_end_matches('\0').trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Scales a `src_width`x`src_height` area of `source` at (x, y) into a `width`x`height` BGRA image
fn scaled(
    source: HDC,
    (x, y, src_width, src_height): (i32, i32, i32, i32),
    width: usize,
    height: usize,
) -> Option<Vec<u8>> {
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    unsafe {
        let target = CreateCompatibleDC(Some(source));
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(Some(target), &info, DIB_RGB_COLORS, &mut bits, None, 0);
        let mut pixels = None;
        if let Ok(bitmap) = bitmap {
            let previous = SelectObject(target, bitmap.into());
            SetStretchBltMode(target, HALFTONE);
            let drawn = StretchBlt(
                target,
                0,
                0,
                width as i32,
                height as i32,
                Some(source),
                x,
                y,
                src_width,
                src_height,
                SRCCOPY | CAPTUREBLT,
            );
            let _ = GdiFlush();
            if drawn.as_bool() && !bits.is_null() {
                pixels = Some(
                    std::slice::from_raw_parts(bits.cast::<u8>(), width * height * 4).to_vec(),
                );
            }
            SelectObject(target, previous);
            let _ = DeleteObject(bitmap.into());
        }
        let _ = DeleteDC(target);
        pixels
    }
}

fn screen_thumbnail(rect: &RECT, width: usize, height: usize) -> Option<String> {
    let (w, h) = size(rect);
    let screen = unsafe { GetDC(None) };
    let pixels = scaled(screen, (rect.left, rect.top, w, h), width, height);
    unsafe { ReleaseDC(None, screen) };
    thumbnail(&pixels?, width, height)
}

/// Windows that are covered or off screen are drawn too
fn window_thumbnail(window: HWND, visible: &RECT, width: usize, height: usize) -> Option<String> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(window, &mut rect) }.ok()?;
    let (w, h) = size(&rect);
    let (vw, vh) = size(visible);
    unsafe {
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        let previous = SelectObject(memory, bitmap.into());
        let pixels = PrintWindow(window, memory, PW_RENDERFULLCONTENT)
            .as_bool()
            .then(|| {
                scaled(
                    memory,
                    (visible.left - rect.left, visible.top - rect.top, vw, vh),
                    width,
                    height,
                )
            })
            .flatten();
        SelectObject(memory, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);
        thumbnail(&pixels?, width, height)
    }
}

pub fn sources(width: usize, height: usize) -> Result<Vec<Source>, String> {
    let mut sources = Vec::new();
    for (monitor, rect) in monitors() {
        let (w, h) = size(&rect);
        let (w, h) = fit(w as usize, h as usize, width, height);
        sources.push(Source {
            id: format!("screen:{}", monitor.0 as usize),
            name: None,
            thumbnail: screen_thumbnail(&rect, w, h).unwrap_or_default(),
            app_name: None,
        });
    }
    let mut apps = HashMap::new();
    for (window, title, rect, pid) in windows() {
        let (w, h) = size(&rect);
        let (w, h) = fit(w as usize, h as usize, width, height);
        sources.push(Source {
            id: format!("window:{}", window.0 as usize),
            name: Some(title),
            thumbnail: window_thumbnail(window, &rect, w, h).unwrap_or_default(),
            app_name: apps.entry(pid).or_insert_with(|| app_name(pid)).clone(),
        });
    }
    Ok(sources)
}

/// Averages four samples per pixel: a box filter when halving, close to one otherwise
fn downscale(
    data: &[u8],
    stride: usize,
    (sw, sh): (usize, usize),
    (dw, dh): (usize, usize),
    out: &mut Vec<u8>,
) {
    let columns: Vec<(usize, usize)> = (0..dw)
        .map(|x| {
            (
                (4 * x + 1) * sw / (4 * dw) * 4,
                (4 * x + 3) * sw / (4 * dw) * 4,
            )
        })
        .collect();
    out.clear();
    out.reserve(dw * dh * 4);
    for y in 0..dh {
        let top = &data[(4 * y + 1) * sh / (4 * dh) * stride..];
        let bottom = &data[(4 * y + 3) * sh / (4 * dh) * stride..];
        for &(a, b) in &columns {
            out.extend((0..4).map(|c| {
                let sum = top[a + c] as u32
                    + top[b + c] as u32
                    + bottom[a + c] as u32
                    + bottom[b + c] as u32;
                ((sum + 2) / 4) as u8
            }));
        }
    }
}

struct Frames {
    sink: Sink,
    device: IDirect3DDevice,
    d3d: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: Option<(ID3D11Texture2D, u32, u32)>,
    size: SizeInt32,
    last: Option<Instant>,
    scaled: Vec<u8>,
}

// D3D11 devices are free-threaded; the context is only used behind the mutex
unsafe impl Send for Frames {}

impl Frames {
    /// Waits out the frame interval, then takes the newest frame, so the last change isn't lost
    fn arrived(&mut self, pool: &Direct3D11CaptureFramePool) -> windows::core::Result<()> {
        if let Some(last) = self.last {
            std::thread::sleep(FRAME_INTERVAL.saturating_sub(last.elapsed()));
        }
        let mut frame = pool.TryGetNextFrame()?;
        while let Ok(next) = pool.TryGetNextFrame() {
            frame = next;
        }
        let size = frame.ContentSize()?;
        if size != self.size {
            self.size = size;
            return pool.Recreate(
                &self.device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                2,
                size,
            );
        }
        self.last = Some(Instant::now());
        let texture: ID3D11Texture2D = unsafe {
            frame
                .Surface()?
                .cast::<IDirect3DDxgiInterfaceAccess>()?
                .GetInterface()?
        };
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };
        let staging = match &self.staging {
            Some((staging, w, h)) if (*w, *h) == (desc.Width, desc.Height) => staging.clone(),
            _ => {
                let staging_desc = D3D11_TEXTURE2D_DESC {
                    MipLevels: 1,
                    ArraySize: 1,
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                    MiscFlags: 0,
                    ..desc
                };
                let mut staging = None;
                unsafe {
                    self.d3d
                        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                }?;
                let staging = staging.ok_or_else(|| windows::core::Error::from(HRESULT(-1)))?;
                self.staging = Some((staging.clone(), desc.Width, desc.Height));
                staging
            }
        };
        let width = (size.Width.max(0) as u32).min(desc.Width) as usize;
        let height = (size.Height.max(0) as u32).min(desc.Height) as usize;
        if width < 2 || height < 2 {
            return Ok(());
        }
        unsafe { self.context.CopyResource(&staging, &texture) };
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
        }?;
        let stride = mapped.RowPitch as usize;
        let data = unsafe {
            std::slice::from_raw_parts(mapped.pData.cast::<u8>(), stride * (height - 1) + width * 4)
        };
        let (w, h) = fit(width, height, MAX_WIDTH, MAX_HEIGHT);
        if (w, h) == (width & !1, height & !1) {
            self.sink.video(w, h, stride, data);
        } else {
            downscale(data, stride, (width, height), (w, h), &mut self.scaled);
            self.sink.video(w, h, w * 4, &self.scaled);
        }
        unsafe { self.context.Unmap(&staging, 0) };
        Ok(())
    }
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Activated(mpsc::Sender<()>);

impl IActivateAudioInterfaceCompletionHandler_Impl for Activated_Impl {
    fn ActivateCompleted(
        &self,
        _: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        let _ = self.0.send(());
        Ok(())
    }
}

fn window_process(window: HWND) -> Option<u32> {
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
    if pid == 0 {
        return None;
    }
    let host = process_path(pid).is_some_and(|path| {
        path.to_ascii_lowercase()
            .ends_with("\\applicationframehost.exe")
    });
    if !host {
        return Some(pid);
    }
    unsafe extern "system" fn find(child: HWND, found: LPARAM) -> BOOL {
        let (host, app) = unsafe { &mut *(found.0 as *mut (u32, u32)) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(child, Some(&mut pid)) };
        if pid != 0 && pid != *host {
            *app = pid;
            return false.into();
        }
        true.into()
    }
    let mut found = (pid, 0u32);
    let _ = unsafe { EnumChildWindows(Some(window), Some(find), LPARAM(&raw mut found as isize)) };
    Some(if found.1 != 0 { found.1 } else { pid })
}

/// A loopback client for one app's audio (`app`, with its child processes), or for everything
/// playing except this process and its children (the webview), so the call's own audio doesn't
/// echo back to everyone. Needs Windows 10 2004 or later.
fn loopback_client(app: Option<u32>) -> windows::core::Result<IAudioClient> {
    let params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: app.unwrap_or_else(std::process::id),
                ProcessLoopbackMode: if app.is_some() {
                    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                } else {
                    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
                },
            },
        },
    };
    // PROPVARIANT's Drop would CoTaskMemFree the blob, but `params` is on the stack
    let mut variant = ManuallyDrop::new(PROPVARIANT::default());
    unsafe {
        let inner = &mut *variant.Anonymous.Anonymous;
        inner.vt = VT_BLOB;
        inner.Anonymous.blob = BLOB {
            cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
            pBlobData: (&raw const params).cast_mut().cast(),
        };
    }
    let (tx, rx) = mpsc::channel();
    let handler: IActivateAudioInterfaceCompletionHandler = Activated(tx).into();
    let operation = unsafe {
        ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&raw const *variant),
            &handler,
        )
    }?;
    rx.recv_timeout(TIMEOUT)
        .map_err(|_| windows::core::Error::from(HRESULT(-1)))?;
    let mut result = HRESULT(0);
    let mut client = None;
    unsafe { operation.GetActivateResult(&mut result, &mut client) }?;
    result.ok()?;
    client
        .ok_or_else(|| windows::core::Error::from(HRESULT(-1)))?
        .cast()
}

fn capture_audio(sink: &Sink, stop: &AtomicBool, app: Option<u32>) -> windows::core::Result<()> {
    let client = loopback_client(app)?;
    let format = WAVEFORMATEX {
        wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
        nChannels: 2,
        nSamplesPerSec: 48_000,
        nAvgBytesPerSec: 48_000 * 8,
        nBlockAlign: 8,
        wBitsPerSample: 32,
        cbSize: 0,
    };
    unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK
                | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
            200_000,
            0,
            &format,
            None,
        )?;
    }
    let event = unsafe { CreateEventW(None, false, false, None) }?;
    let result = (|| unsafe {
        client.SetEventHandle(event)?;
        let capture: IAudioCaptureClient = client.GetService()?;
        client.Start()?;
        let mut silence = Vec::new();
        while !stop.load(Ordering::Relaxed) {
            if WaitForSingleObject(event, 100) != WAIT_OBJECT_0 {
                continue;
            }
            while capture.GetNextPacketSize()? > 0 {
                let mut data = null_mut();
                let mut frames = 0;
                let mut flags = 0;
                capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                let samples = frames as usize * 2;
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    silence.resize(samples, 0.0);
                    sink.audio(&silence);
                } else {
                    sink.audio(std::slice::from_raw_parts(data.cast::<f32>(), samples));
                }
                capture.ReleaseBuffer(frames)?;
            }
        }
        client.Stop()
    })();
    let _ = unsafe { CloseHandle(event) };
    result
}

struct Capture {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    audio: Arc<AtomicBool>,
}

impl Session for Capture {
    fn stop(self: Box<Self>) {
        self.audio.store(true, Ordering::Relaxed);
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

fn item(kind: &str, number: usize) -> Result<GraphicsCaptureItem, String> {
    let interop =
        factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(|e| e.message())?;
    match kind {
        "screen" => {
            let (monitor, _) = monitors()
                .into_iter()
                .find(|(m, _)| m.0 as usize == number)
                .ok_or("screen not found")?;
            unsafe { interop.CreateForMonitor(monitor) }.map_err(|e| e.message())
        }
        "window" => {
            let window = HWND(number as *mut c_void);
            if !unsafe { IsWindow(Some(window)) }.as_bool() {
                return Err("window not found".into());
            }
            unsafe { interop.CreateForWindow(window) }.map_err(|e| e.message())
        }
        _ => Err("unknown source".into()),
    }
}

pub fn start(id: &str, with_audio: bool, sink: Sink) -> Result<Box<dyn Session>, String> {
    let (kind, number) = id.split_once(':').ok_or("unknown source")?;
    let number: usize = number.parse().map_err(|_| "unknown source")?;
    let item = item(kind, number)?;
    let (session, pool) = video(&item, sink.clone()).map_err(|e| e.message())?;
    let audio = Arc::new(AtomicBool::new(false));
    if with_audio {
        let app = match kind {
            "window" => {
                Some(window_process(HWND(number as *mut c_void)).ok_or("window not found")?)
            }
            _ => None,
        };
        let stop = audio.clone();
        std::thread::spawn(move || {
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            // Older Windows can't capture per process; share without audio then
            if let Err(error) = capture_audio(&sink, &stop, app) {
                eprintln!("[screen share] no system audio: {}", error.message());
            }
        });
    }
    Ok(Box::new(Capture {
        session,
        pool,
        audio,
    }))
}

fn video(
    item: &GraphicsCaptureItem,
    sink: Sink,
) -> windows::core::Result<(GraphicsCaptureSession, Direct3D11CaptureFramePool)> {
    let mut d3d = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut d3d),
            None,
            Some(&mut context),
        )
    }?;
    let missing = || windows::core::Error::from(HRESULT(-1));
    let (d3d, context) = (d3d.ok_or_else(missing)?, context.ok_or_else(missing)?);
    let device: IDirect3DDevice =
        unsafe { CreateDirect3D11DeviceFromDXGIDevice(&d3d.cast::<IDXGIDevice>()?) }?.cast()?;
    let size = item.Size()?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        size,
    )?;
    let frames = Mutex::new(Frames {
        sink,
        device,
        d3d,
        context,
        staging: None,
        size,
        last: None,
        scaled: Vec::new(),
    });
    pool.FrameArrived(&windows::Foundation::TypedEventHandler::new(
        move |pool: Ref<Direct3D11CaptureFramePool>, _| frames.lock().unwrap().arrived(pool.ok()?),
    ))?;
    let session = pool.CreateCaptureSession(item)?;
    let _ = session.SetIsCursorCaptureEnabled(true);
    // Windows 11 24H2 and later; older versions deliver frames as often as the screen refreshes
    let _ = session.SetMinUpdateInterval(TimeSpan {
        Duration: FRAME_INTERVAL.as_nanos() as i64 / 100,
    });
    session.StartCapture()?;
    Ok((session, pool))
}
