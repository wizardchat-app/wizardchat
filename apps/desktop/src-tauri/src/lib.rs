#![recursion_limit = "256"]

mod global_keys;
mod keep_awake;
mod links;
mod loopback;
mod rpc;
mod screen_share;
mod update;

use tauri::{
    webview::{PermissionKind, PermissionResponse},
    window::Color,
    AppHandle, Manager, Runtime, WebviewWindow,
};

/// Deletes the database directory of a signed-out account (`StoreConfig.location`)
#[tauri::command]
fn core_delete_store(location: String) -> Result<(), String> {
    let path = std::path::Path::new(&location);
    if location.is_empty() || path.components().count() != 1 || path.is_absolute() {
        return Err("invalid store location".into());
    }
    match std::fs::remove_dir_all(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// The theme's background behind the web app, so resizing and reloading don't flash another colour
#[tauri::command]
fn set_background_color(window: WebviewWindow, color: Color) {
    let _ = window.set_background_color(Some(color));
}

#[tauri::command]
fn set_unread(window: WebviewWindow, unread: bool, icon: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        let _ = icon;
        let _ = window.set_badge_label(unread.then(|| "•".to_owned()));
    }
    #[cfg(not(target_os = "macos"))]
    {
        use base64::Engine;
        let _ = unread;
        let png = icon.and_then(|icon| base64::engine::general_purpose::STANDARD.decode(icon).ok());
        if let Some(image) = png.and_then(|png| tauri::image::Image::from_bytes(&png).ok()) {
            let _ = window.set_icon(image);
        }
    }
}

pub(crate) fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// macOS keeps the app running when the window closes, like other Mac apps: the window only hides
#[cfg(target_os = "macos")]
fn hide_on_close<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != "main" {
        return;
    }
    api.prevent_close();
    if window.is_fullscreen().unwrap_or(false) {
        // A fullscreen window that hides leaves a black space behind: leave fullscreen first
        let _ = window.set_fullscreen(false);
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(800));
            let _ = window.hide();
        });
    } else {
        let _ = window.hide();
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app)
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(rpc::Core::new())
        .manage(links::Pending::default())
        .manage(global_keys::GlobalKeys::default())
        .manage(keep_awake::KeepAwake::default())
        .manage(update::PendingUpdate::default())
        .manage(screen_share::Capture::default())
        // Calls, screen sharing and location sharing
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Microphone
            | PermissionKind::Camera
            | PermissionKind::DisplayCapture
            | PermissionKind::Geolocation => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "macos")]
            hide_on_close(_window, _event);
        })
        .setup(|app| {
            // Account stores (`StoreConfig.location`) are relative paths: keep them in app data
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            std::env::set_current_dir(&data)?;
            // On Windows the app draws its own title bar, window buttons included. Linux keeps the
            // window manager's frame: many ignore a frameless window and draw theirs anyway
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            links::setup(app.handle());
            update::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            rpc::rpc_connect,
            rpc::rpc_call,
            rpc::rpc_release,
            rpc::rpc_cancel,
            core_delete_store,
            set_background_color,
            set_unread,
            loopback::loopback_listen,
            loopback::loopback_wait,
            loopback::loopback_cancel,
            links::show_notification,
            links::take_pending_room,
            links::take_deep_link,
            global_keys::global_key_set,
            global_keys::global_keys_permission,
            keep_awake::keep_awake,
            update::update_ready,
            update::install_update,
            screen_share::screen_capture_supported,
            screen_share::desktop_sources,
            screen_share::start_screen_capture,
            screen_share::stop_screen_capture,
            screen_share::open_share_picker,
        ])
        .build(tauri::generate_context!())
        .expect("error while running WizardChat");
    app.run(|_app, _event| {
        // The Dock icon brings the hidden window back
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = _event
        {
            focus_main(_app);
        }
    });
}
