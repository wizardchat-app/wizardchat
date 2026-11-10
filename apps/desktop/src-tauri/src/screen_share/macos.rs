//! macOS: ScreenCaptureKit for the source list, thumbnails, video and system audio

use std::{
    ffi::c_void,
    ptr::{null_mut, NonNull},
    sync::mpsc,
    time::Duration,
};

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::{
    define_class, msg_send, rc::Retained, runtime::ProtocolObject, AllocAnyThread, DefinedClass,
};
use objc2_core_audio_types::{AudioBuffer, AudioBufferList};
use objc2_core_foundation::{CFRetained, CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo, CGImageByteOrderInfo,
};
use objc2_core_media::{CMBlockBuffer, CMSampleBuffer, CMTime};
use objc2_core_video::{
    kCVPixelFormatType_32BGRA, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferGetHeight, CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol};
use objc2_screen_capture_kit::{
    SCContentFilter, SCDisplay, SCRunningApplication, SCScreenshotManager, SCShareableContent,
    SCStream, SCStreamConfiguration, SCStreamOutput, SCStreamOutputType, SCWindow,
};

use super::{thumbnail, Session, Sink, Source};

/// System audio without the app's own (the call would echo otherwise)
pub const AUDIO: bool = true;

pub fn supported() -> bool {
    true
}

/// Shared streams are scaled to fit this, like the web's 1080p screen share preset
const MAX_WIDTH: f64 = 1920.0;
const MAX_HEIGHT: f64 = 1080.0;
const MIN_WINDOW_SIZE: f64 = 64.0;
const TIMEOUT: Duration = Duration::from_secs(10);

fn error_text(error: *mut NSError) -> String {
    unsafe { error.as_ref() }
        .map(|e| e.localizedDescription().to_string())
        .unwrap_or_else(|| "screen capture failed".into())
}

fn content() -> Result<Retained<SCShareableContent>, String> {
    let (tx, rx) = mpsc::channel();
    let done = RcBlock::new(
        move |content: *mut SCShareableContent, error: *mut NSError| {
            let _ = tx.send(unsafe { Retained::retain(content) }.ok_or_else(|| error_text(error)));
        },
    );
    unsafe { SCShareableContent::getShareableContentWithCompletionHandler(&done) };
    rx.recv_timeout(TIMEOUT).map_err(|e| e.to_string())?
}

/// Normal windows of other apps that are on screen and have a title
fn windows(content: &SCShareableContent) -> Vec<Retained<SCWindow>> {
    let own = std::process::id() as i32;
    unsafe { content.windows() }
        .iter()
        .filter(|w| unsafe {
            let frame = w.frame();
            w.isOnScreen()
                && w.windowLayer() == 0
                && w.title().is_some_and(|t| !t.to_string().trim().is_empty())
                && frame.size.width >= MIN_WINDOW_SIZE
                && frame.size.height >= MIN_WINDOW_SIZE
                && w.owningApplication().map(|a| a.processID()) != Some(own)
        })
        .collect()
}

fn fit(width: f64, height: f64, max_width: f64, max_height: f64) -> (usize, usize) {
    let scale = (max_width / width).min(max_height / height).min(1.0);
    (
        ((width * scale) as usize).max(2) & !1,
        ((height * scale) as usize).max(2) & !1,
    )
}

fn display_filter(display: &SCDisplay) -> Retained<SCContentFilter> {
    unsafe {
        SCContentFilter::initWithDisplay_excludingWindows(
            SCContentFilter::alloc(),
            display,
            &NSArray::new(),
        )
    }
}

fn window_filter(window: &SCWindow) -> Retained<SCContentFilter> {
    unsafe { SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), window) }
}

/// The image's pixels as tightly packed BGRA
fn bgra(image: &CGImage) -> Option<(Vec<u8>, usize, usize)> {
    let (width, height) = (CGImage::width(Some(image)), CGImage::height(Some(image)));
    let mut pixels = vec![0u8; width * height * 4];
    let space = CGColorSpace::new_device_rgb()?;
    let info = CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
    let context: CFRetained<CGContext> = unsafe {
        CGBitmapContextCreate(
            pixels.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            width * 4,
            Some(&space),
            info,
        )
    }?;
    let rect = CGRect::new(
        CGPoint::new(0.0, 0.0),
        CGSize::new(width as f64, height as f64),
    );
    CGContext::draw_image(Some(&context), rect, Some(image));
    drop(context);
    Some((pixels, width, height))
}

/// A screenshot for the picker (macOS 14 and later)
fn snapshot(filter: &SCContentFilter, width: usize, height: usize) -> Option<String> {
    if !objc2::available!(macos = 14.0) {
        return None;
    }
    let config = unsafe { SCStreamConfiguration::new() };
    unsafe {
        config.setWidth(width);
        config.setHeight(height);
        config.setShowsCursor(false);
    }
    let (tx, rx) = mpsc::channel();
    let done = RcBlock::new(move |image: *mut CGImage, _: *mut NSError| {
        let image = NonNull::new(image).map(|image| unsafe { CFRetained::retain(image) });
        let _ = tx.send(image);
    });
    unsafe {
        SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(
            filter,
            &config,
            Some(&done),
        )
    };
    let image = rx.recv_timeout(TIMEOUT).ok()??;
    let (pixels, w, h) = bgra(&image)?;
    thumbnail(&pixels, w, h)
}

pub fn sources(width: usize, height: usize) -> Result<Vec<Source>, String> {
    let content = content()?;
    let mut sources = Vec::new();
    for display in unsafe { content.displays() }.iter() {
        let frame = unsafe { display.frame() };
        let (w, h) = fit(
            frame.size.width,
            frame.size.height,
            width as f64,
            height as f64,
        );
        sources.push(Source {
            id: format!("screen:{}", unsafe { display.displayID() }),
            name: None,
            thumbnail: snapshot(&display_filter(&display), w, h).unwrap_or_default(),
            app_name: None,
        });
    }
    for window in windows(&content) {
        let frame = unsafe { window.frame() };
        let (w, h) = fit(
            frame.size.width,
            frame.size.height,
            width as f64,
            height as f64,
        );
        sources.push(Source {
            id: format!("window:{}", unsafe { window.windowID() }),
            name: unsafe { window.title() }.map(|t| t.to_string()),
            thumbnail: snapshot(&window_filter(&window), w, h).unwrap_or_default(),
            app_name: unsafe { window.owningApplication() }
                .map(|a| unsafe { a.applicationName() }.to_string()),
        });
    }
    Ok(sources)
}

fn video(sink: &Sink, sample: &CMSampleBuffer) {
    let Some(pixels) = (unsafe { sample.image_buffer() }) else {
        return;
    };
    if unsafe { CVPixelBufferLockBaseAddress(&pixels, CVPixelBufferLockFlags::ReadOnly) } != 0 {
        return;
    }
    let base = CVPixelBufferGetBaseAddress(&pixels);
    let (width, height) = (
        CVPixelBufferGetWidth(&pixels),
        CVPixelBufferGetHeight(&pixels),
    );
    let stride = CVPixelBufferGetBytesPerRow(&pixels);
    if !base.is_null() {
        let data = unsafe { std::slice::from_raw_parts(base.cast::<u8>(), stride * height) };
        sink.video(width, height, stride, data);
    }
    unsafe { CVPixelBufferUnlockBaseAddress(&pixels, CVPixelBufferLockFlags::ReadOnly) };
}

/// An `AudioBufferList` with room for two channels
#[repr(C)]
struct StereoBufferList {
    count: u32,
    buffers: [AudioBuffer; 2],
}

/// ScreenCaptureKit delivers 32-bit float samples, one buffer per channel
fn audio(sink: &Sink, sample: &CMSampleBuffer) {
    let mut list = StereoBufferList {
        count: 0,
        buffers: [AudioBuffer {
            mNumberChannels: 0,
            mDataByteSize: 0,
            mData: null_mut(),
        }; 2],
    };
    let mut block: *mut CMBlockBuffer = null_mut();
    let status = unsafe {
        sample.audio_buffer_list_with_retained_block_buffer(
            null_mut(),
            (&raw mut list).cast::<AudioBufferList>(),
            size_of::<StereoBufferList>(),
            None,
            None,
            0,
            &mut block,
        )
    };
    // Releases the data when this function returns
    let _block = NonNull::new(block).map(|b| unsafe { CFRetained::from_raw(b) });
    if status != 0 {
        return;
    }
    let channels: Vec<&[f32]> = list.buffers[..(list.count as usize).min(2)]
        .iter()
        .filter(|b| !b.mData.is_null())
        .map(|b| unsafe {
            std::slice::from_raw_parts(b.mData.cast::<f32>(), b.mDataByteSize as usize / 4)
        })
        .collect();
    let interleaved: Vec<f32> = match channels.as_slice() {
        [left, right] => left
            .iter()
            .zip(*right)
            .flat_map(|(l, r)| [*l, *r])
            .collect(),
        [mono] => mono.iter().flat_map(|s| [*s, *s]).collect(),
        _ => return,
    };
    sink.audio(&interleaved);
}

struct OutputIvars {
    sink: Sink,
    video: bool,
}

define_class!(
    /// Receives the stream's frames and audio
    #[unsafe(super(NSObject))]
    #[name = "WizardChatScreenShareOutput"]
    #[ivars = OutputIvars]
    struct Output;

    unsafe impl NSObjectProtocol for Output {}

    unsafe impl SCStreamOutput for Output {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        fn did_output(
            &self,
            _stream: &SCStream,
            sample: &CMSampleBuffer,
            kind: SCStreamOutputType,
        ) {
            if kind == SCStreamOutputType::Screen && self.ivars().video {
                video(&self.ivars().sink, sample);
            } else if kind == SCStreamOutputType::Audio {
                audio(&self.ivars().sink, sample);
            }
        }
    }
);

impl Output {
    fn new(sink: Sink, video: bool) -> Retained<Self> {
        let this = Self::alloc().set_ivars(OutputIvars { sink, video });
        unsafe { msg_send![super(this), init] }
    }
}

struct Stream {
    stream: Retained<SCStream>,
    _output: Retained<Output>,
}

struct Capture {
    streams: Vec<Stream>,
    _queue: DispatchRetained<DispatchQueue>,
}

// ScreenCaptureKit objects may be used from any thread
unsafe impl Send for Capture {}

impl Session for Capture {
    fn stop(self: Box<Self>) {
        for stream in &self.streams {
            unsafe { stream.stream.stopCaptureWithCompletionHandler(None) };
        }
    }
}

fn audio_config(config: &SCStreamConfiguration) {
    unsafe {
        config.setCapturesAudio(true);
        config.setSampleRate(48_000);
        config.setChannelCount(2);
        config.setExcludesCurrentProcessAudio(true);
    }
}

fn open(
    filter: &SCContentFilter,
    config: &SCStreamConfiguration,
    sink: Sink,
    video: bool,
    audio: bool,
    queue: &DispatchQueue,
) -> Result<Stream, String> {
    let stream = unsafe {
        SCStream::initWithFilter_configuration_delegate(SCStream::alloc(), filter, config, None)
    };
    let output = Output::new(sink, video);
    let handler = ProtocolObject::from_ref(&*output);
    unsafe {
        stream
            .addStreamOutput_type_sampleHandlerQueue_error(
                handler,
                SCStreamOutputType::Screen,
                Some(queue),
            )
            .map_err(|e| e.localizedDescription().to_string())?;
        if audio {
            stream
                .addStreamOutput_type_sampleHandlerQueue_error(
                    handler,
                    SCStreamOutputType::Audio,
                    Some(queue),
                )
                .map_err(|e| e.localizedDescription().to_string())?;
        }
    }
    let (tx, rx) = mpsc::channel();
    let started = RcBlock::new(move |error: *mut NSError| {
        let _ = tx.send(if error.is_null() {
            Ok(())
        } else {
            Err(error_text(error))
        });
    });
    unsafe { stream.startCaptureWithCompletionHandler(Some(&started)) };
    rx.recv_timeout(TIMEOUT).map_err(|e| e.to_string())??;
    Ok(Stream {
        stream,
        _output: output,
    })
}

fn app_audio_filter(
    content: &SCShareableContent,
    window: &SCWindow,
) -> Option<Retained<SCContentFilter>> {
    let app = unsafe { window.owningApplication() }?;
    let bundle = unsafe { app.bundleIdentifier() }.to_string();
    let apps: Vec<Retained<SCRunningApplication>> = unsafe { content.applications() }
        .iter()
        .filter(|a| unsafe {
            a.processID() == app.processID()
                || (!bundle.is_empty()
                    && a.bundleIdentifier()
                        .to_string()
                        .starts_with(&format!("{bundle}.")))
        })
        .collect();
    let display = unsafe { content.displays() }.firstObject()?;
    let apps = NSArray::from_retained_slice(&apps);
    Some(unsafe {
        SCContentFilter::initWithDisplay_includingApplications_exceptingWindows(
            SCContentFilter::alloc(),
            &display,
            &apps,
            &NSArray::new(),
        )
    })
}

pub fn start(id: &str, with_audio: bool, sink: Sink) -> Result<Box<dyn Session>, String> {
    let content = content()?;
    let (kind, number) = id.split_once(':').ok_or("unknown source")?;
    let number: u32 = number.parse().map_err(|_| "unknown source")?;
    let (filter, frame, audio_filter) = match kind {
        "screen" => {
            let display = unsafe { content.displays() }
                .iter()
                .find(|d| unsafe { d.displayID() } == number)
                .ok_or("screen not found")?;
            (display_filter(&display), unsafe { display.frame() }, None)
        }
        "window" => {
            let window = unsafe { content.windows() }
                .iter()
                .find(|w| unsafe { w.windowID() } == number)
                .ok_or("window not found")?;
            let audio = with_audio
                .then(|| app_audio_filter(&content, &window))
                .flatten();
            (window_filter(&window), unsafe { window.frame() }, audio)
        }
        _ => return Err("unknown source".into()),
    };
    // Frames come in at the screen's pixel density; scale them down to the shared size
    let (width, height) = fit(
        frame.size.width * 2.0,
        frame.size.height * 2.0,
        MAX_WIDTH,
        MAX_HEIGHT,
    );
    let config = unsafe { SCStreamConfiguration::new() };
    unsafe {
        config.setWidth(width);
        config.setHeight(height);
        config.setPixelFormat(kCVPixelFormatType_32BGRA);
        config.setMinimumFrameInterval(CMTime::new(1, 30));
        config.setShowsCursor(true);
        config.setQueueDepth(5);
    }
    let screen_audio = with_audio && kind == "screen";
    if screen_audio {
        audio_config(&config);
    }
    let queue = DispatchQueue::new("org.wizardchat.screen-share", None);
    let mut streams = vec![open(
        &filter,
        &config,
        sink.clone(),
        true,
        screen_audio,
        &queue,
    )?];
    if let Some(audio_filter) = audio_filter {
        let config = unsafe { SCStreamConfiguration::new() };
        unsafe {
            config.setWidth(2);
            config.setHeight(2);
            config.setMinimumFrameInterval(CMTime::new(1, 1));
            config.setShowsCursor(false);
        }
        audio_config(&config);
        streams.push(open(&audio_filter, &config, sink, false, true, &queue)?);
    }
    Ok(Box::new(Capture {
        streams,
        _queue: queue,
    }))
}
