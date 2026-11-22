//! WebKitGTK often hides pasted images and copied files from the page, so Linux reads them natively

use serde::Serialize;

#[derive(Serialize)]
pub struct ClipboardFile {
    name: String,
    mime: String,
    data: String,
}

#[tauri::command]
pub async fn clipboard_files(app: tauri::AppHandle) -> Result<Vec<ClipboardFile>, String> {
    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(linux::read());
        })
        .map_err(|e| e.to_string())?;
        let clip = rx.await.map_err(|e| e.to_string())?;
        tokio::task::spawn_blocking(move || linux::files(clip))
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use base64::Engine;
    use gtk::gio::prelude::FileExt;

    use super::ClipboardFile;

    const MAX_FILES: usize = 20;
    const MAX_BYTES: u64 = 200 * 1024 * 1024;

    pub enum Clip {
        Paths(Vec<std::path::PathBuf>),
        Png(Vec<u8>),
        Empty,
    }

    pub fn read() -> Clip {
        let clipboard = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
        if clipboard.wait_is_uris_available() {
            let paths: Vec<_> = clipboard
                .wait_for_uris()
                .iter()
                .filter_map(|uri| gtk::gio::File::for_uri(uri).path())
                .filter(|path| path.is_file())
                .take(MAX_FILES)
                .collect();
            if !paths.is_empty() {
                return Clip::Paths(paths);
            }
        }
        if clipboard.wait_is_image_available() {
            if let Some(png) = clipboard
                .wait_for_image()
                .and_then(|image| image.save_to_bufferv("png", &[]).ok())
            {
                return Clip::Png(png);
            }
        }
        Clip::Empty
    }

    pub fn files(clip: Clip) -> Vec<ClipboardFile> {
        let encode = |data: &[u8]| base64::engine::general_purpose::STANDARD.encode(data);
        match clip {
            Clip::Empty => Vec::new(),
            Clip::Png(png) => vec![ClipboardFile {
                name: "image.png".into(),
                mime: "image/png".into(),
                data: encode(&png),
            }],
            Clip::Paths(paths) => paths
                .into_iter()
                .filter(|path| path.metadata().is_ok_and(|m| m.len() <= MAX_BYTES))
                .filter_map(|path| {
                    let data = std::fs::read(&path).ok()?;
                    let (content_type, _) = gtk::gio::content_type_guess(Some(&path), &data);
                    let mime = gtk::gio::content_type_get_mime_type(&content_type)
                        .map(|m| m.to_string())
                        .unwrap_or_else(|| "application/octet-stream".into());
                    Some(ClipboardFile {
                        name: path.file_name()?.to_string_lossy().into_owned(),
                        mime,
                        data: encode(&data),
                    })
                })
                .collect(),
        }
    }
}
