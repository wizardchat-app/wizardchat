//! The system's 12/24-hour choice, which the webviews' Intl doesn't see

#[tauri::command]
pub fn system_uses_12_hour() -> Option<bool> {
    imp::uses_12_hour()
}

fn pattern_uses_12_hour(pattern: &str) -> Option<bool> {
    let mut in_quote = false;
    for c in pattern.chars() {
        match c {
            '\'' => in_quote = !in_quote,
            'h' | 'K' if !in_quote => return Some(true),
            'H' | 'k' if !in_quote => return Some(false),
            _ => {}
        }
    }
    None
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2_foundation::{NSDateFormatter, NSLocale, NSString};

    pub fn uses_12_hour() -> Option<bool> {
        let locale = NSLocale::autoupdatingCurrentLocale();
        let pattern = NSDateFormatter::dateFormatFromTemplate_options_locale(
            &NSString::from_str("j"),
            0,
            Some(&locale),
        )?;
        super::pattern_uses_12_hour(&pattern.to_string())
    }
}

#[cfg(windows)]
mod imp {
    use windows::core::PCWSTR;
    use windows::Win32::Globalization::{GetLocaleInfoEx, LOCALE_STIMEFORMAT};

    pub fn uses_12_hour() -> Option<bool> {
        let mut buffer = [0u16; 128];
        let len = unsafe { GetLocaleInfoEx(PCWSTR::null(), LOCALE_STIMEFORMAT, Some(&mut buffer)) };
        if len <= 1 {
            return None;
        }
        super::pattern_uses_12_hour(&String::from_utf16_lossy(&buffer[..len as usize - 1]))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    pub fn uses_12_hour() -> Option<bool> {
        None
    }
}
