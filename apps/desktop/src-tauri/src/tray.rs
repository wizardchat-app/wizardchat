use std::{path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, Wry,
};
use tauri_plugin_autostart::ManagerExt;

pub const MINIMIZED_ARG: &str = "--minimized";
const PREFS_FILE: &str = "window.json";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowPrefs {
    pub close_to_tray: bool,
    pub start_minimized: bool,
}

impl Default for WindowPrefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_minimized: false,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSettings {
    close_to_tray: bool,
    start_minimized: bool,
    launch_at_login: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSettingsPatch {
    close_to_tray: Option<bool>,
    start_minimized: Option<bool>,
    launch_at_login: Option<bool>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TrayLabels {
    open: String,
    quit: String,
    mute: String,
    deafen: String,
    leave_call: String,
    restart_to_update: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            open: "Open WizardChat".into(),
            quit: "Quit WizardChat".into(),
            mute: "Mute".into(),
            deafen: "Deafen".into(),
            leave_call: "Leave call".into(),
            restart_to_update: "Restart to update".into(),
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCall {
    title: String,
    muted: bool,
    deafened: bool,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TrayState {
    labels: TrayLabels,
    call: Option<TrayCall>,
    update_ready: bool,
}

pub struct Tray {
    prefs: Mutex<WindowPrefs>,
    path: PathBuf,
    update_badge: Mutex<bool>,
}

impl Tray {
    #[cfg(not(target_os = "macos"))]
    pub fn close_to_tray(&self) -> bool {
        self.prefs.lock().unwrap().close_to_tray
    }
}

fn load(path: &PathBuf) -> WindowPrefs {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn build_menu(app: &AppHandle, state: &TrayState) -> tauri::Result<Menu<Wry>> {
    let labels = &state.labels;
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();
    if let Some(call) = &state.call {
        items.push(Box::new(MenuItem::with_id(
            app,
            "call-title",
            &call.title,
            false,
            None::<&str>,
        )?));
        items.push(Box::new(CheckMenuItem::with_id(
            app,
            "mute",
            &labels.mute,
            true,
            call.muted,
            None::<&str>,
        )?));
        items.push(Box::new(CheckMenuItem::with_id(
            app,
            "deafen",
            &labels.deafen,
            true,
            call.deafened,
            None::<&str>,
        )?));
        items.push(Box::new(MenuItem::with_id(
            app,
            "leave-call",
            &labels.leave_call,
            true,
            None::<&str>,
        )?));
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }
    items.push(Box::new(MenuItem::with_id(
        app,
        "open",
        &labels.open,
        true,
        None::<&str>,
    )?));
    if state.update_ready {
        items.push(Box::new(MenuItem::with_id(
            app,
            "update",
            &labels.restart_to_update,
            true,
            None::<&str>,
        )?));
    }
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "quit",
        &labels.quit,
        true,
        None::<&str>,
    )?));
    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => crate::focus_main(app),
        "quit" => app.exit(0),
        "update" => {
            let _ = crate::update::install_update(app.clone(), app.state());
        }
        "mute" | "deafen" | "leave-call" => {
            let _ = app.emit("tray-action", id);
        }
        _ => {}
    }
}

#[cfg(target_os = "macos")]
fn tray_icon(_app: &AppHandle, update: bool) -> Option<Image<'static>> {
    let bytes: &[u8] = if update {
        include_bytes!("../icons/tray-template-update.png")
    } else {
        include_bytes!("../icons/tray-template.png")
    };
    Image::from_bytes(bytes).ok()
}

#[cfg(not(target_os = "macos"))]
fn tray_icon(app: &AppHandle, update: bool) -> Option<Image<'static>> {
    let icon = app.default_window_icon()?;
    if !update {
        return Some(icon.clone().to_owned());
    }
    let (width, height) = (icon.width(), icon.height());
    let mut rgba = icon.rgba().to_vec();
    let size = width.min(height) as f32;
    let (cx, cy) = (width as f32 * 0.75, height as f32 * 0.7875);
    let radius = size * 0.1375;
    let ring = size * 0.025;
    for y in 0..height {
        for x in 0..width {
            let distance = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let color = if distance <= radius {
                [0xe7, 0x4c, 0x3c, 0xff]
            } else if distance <= radius + ring {
                [0, 0, 0, 0]
            } else {
                continue;
            };
            let at = ((y * width + x) * 4) as usize;
            rgba[at..at + 4].copy_from_slice(&color);
        }
    }
    Some(Image::new_owned(rgba, width, height))
}

fn show_update_badge(app: &AppHandle, update: bool) {
    let state = app.state::<Tray>();
    let mut shown = state.update_badge.lock().unwrap();
    if *shown == update {
        return;
    }
    let (Some(tray), Some(icon)) = (app.tray_by_id("main"), tray_icon(app, update)) else {
        return;
    };
    if tray.set_icon(Some(icon)).is_ok() {
        #[cfg(target_os = "macos")]
        let _ = tray.set_icon_as_template(true);
        *shown = update;
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<bool> {
    let path = app.path().app_data_dir()?.join(PREFS_FILE);
    let prefs = load(&path);
    let menu = build_menu(app, &TrayState::default())?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("WizardChat")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| menu_event(app, event.id().as_ref()));
    if let Some(icon) = tray_icon(app, false) {
        tray = tray.icon(icon);
    }
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon_as_template(true);
    }
    tray.build(app)?;
    let launched_at_login = std::env::args().any(|arg| arg == MINIMIZED_ARG);
    let start_hidden = launched_at_login && prefs.start_minimized;
    app.manage(Tray {
        prefs: Mutex::new(prefs),
        path,
        update_badge: Mutex::new(false),
    });
    Ok(start_hidden)
}

#[tauri::command]
pub fn window_settings(app: AppHandle, tray: State<'_, Tray>) -> WindowSettings {
    let prefs = tray.prefs.lock().unwrap().clone();
    WindowSettings {
        close_to_tray: prefs.close_to_tray,
        start_minimized: prefs.start_minimized,
        launch_at_login: app.autolaunch().is_enabled().unwrap_or(false),
    }
}

#[tauri::command]
pub fn set_window_settings(
    app: AppHandle,
    tray: State<'_, Tray>,
    patch: WindowSettingsPatch,
) -> Result<WindowSettings, String> {
    if let Some(on) = patch.launch_at_login {
        let autolaunch = app.autolaunch();
        let result = if on {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| e.to_string())?;
    }
    {
        let mut prefs = tray.prefs.lock().unwrap();
        if let Some(on) = patch.close_to_tray {
            prefs.close_to_tray = on;
        }
        if let Some(on) = patch.start_minimized {
            prefs.start_minimized = on;
        }
        let json = serde_json::to_vec_pretty(&*prefs).map_err(|e| e.to_string())?;
        std::fs::write(&tray.path, json).map_err(|e| e.to_string())?;
    }
    Ok(window_settings(app, tray))
}

#[tauri::command]
pub fn set_tray_state(app: AppHandle, state: TrayState) -> Result<(), String> {
    let Some(tray) = app.tray_by_id("main") else {
        return Ok(());
    };
    let menu = build_menu(&app, &state).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    show_update_badge(&app, state.update_ready);
    Ok(())
}
