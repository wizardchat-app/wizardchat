use std::path::Path;

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name)?.to_str().ok()
}

fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(body) => Ok(body.clone()),
        _ => Err("expected a binary body".into()),
    }
}

fn file_name(encoded: Option<&str>) -> String {
    let decoded = encoded.and_then(percent_decode).unwrap_or_default();
    Path::new(&decoded)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("file")
        .to_string()
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[tauri::command]
pub async fn save_media(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let bytes = raw_body(&request)?;
    let name = file_name(header(&request, "x-file-name"));

    let mut dialog = app.dialog().file().set_file_name(name);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });
    let Some(path) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let saved = path.clone();
    tokio::task::spawn_blocking(move || std::fs::write(&path, bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(Some(saved.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn copy_image(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let rgba = raw_body(&request)?;
    let dimension = |name| {
        header(&request, name)
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|value| *value > 0)
            .ok_or_else(|| format!("missing {name}"))
    };
    let width = dimension("x-width")?;
    let height = dimension("x-height")?;
    if rgba.len() != width as usize * height as usize * 4 {
        return Err("image size mismatch".into());
    }
    app.clipboard()
        .write_image(&tauri::image::Image::new_owned(rgba, width, height))
        .map_err(|e| e.to_string())
}
