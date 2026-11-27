use std::{ops::RangeInclusive, sync::Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{Error, Result, WizardClient};

const SETTINGS_EVENT: &str = "org.wizardchat.settings";

/// The app settings synced across the account's devices. Every field is optional: unset or
/// invalid values are left out, and `updateSyncedSettings` only writes the fields that are set.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
pub struct SyncedSettings {
    /// A language code, or `system`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// `classic`, `modern` or `compact`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_layout: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing_indicators: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_read_receipts: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_sound: Option<bool>,
    /// `always`, `private` or `never`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_visibility: Option<String>,
    /// `always`, `screenshare` or `off`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streamer_mode: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prettify_links: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub markdown: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_room_avatars: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_home_and_dms: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_presence_dots: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_usernames: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_images: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strip_photo_metadata: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compress_images: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_emoji: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoticons_to_emoji: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_join_leave: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_profile_changes: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_themes: Option<Vec<Value>>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub light_theme: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dark_theme: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub themed_app_icon: Option<bool>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_font_size: Option<u32>,
    /// `compact`, `default` or `spacious`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_density: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align_own_right: Option<bool>,
    /// `auto`, `12h` or `24h`
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_format: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_zoom: Option<u32>,
    /// The theme of versions before light and dark themes, read only
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_custom_theme: Option<String>,
}

impl SyncedSettings {
    fn from_content(content: &Map<String, Value>) -> Self {
        let bool_of = |key: &str| content.get(key).and_then(Value::as_bool);
        let string_of = |key: &str| content.get(key).and_then(Value::as_str);
        let one_of = |key: &str, allowed: &[&str]| {
            string_of(key)
                .filter(|value| allowed.contains(value))
                .map(str::to_owned)
        };
        let int_in = |key: &str, range: RangeInclusive<u64>| {
            content
                .get(key)
                .and_then(Value::as_u64)
                .filter(|value| range.contains(value))
                .and_then(|value| u32::try_from(value).ok())
        };
        let theme_slot = |key: &str| {
            string_of(key)
                .filter(|value| (1..=64).contains(&value.chars().count()))
                .map(str::to_owned)
        };
        Self {
            language: string_of("language")
                .filter(|value| !value.trim().is_empty())
                .map(str::to_owned),
            message_layout: one_of("messageLayout", &["classic", "modern", "compact"]),
            // Older versions of the iOS and Android apps called it `sendTyping`
            typing_indicators: bool_of("typingIndicators").or_else(|| bool_of("sendTyping")),
            send_read_receipts: bool_of("sendReadReceipts"),
            notification_sound: bool_of("notificationSound"),
            media_visibility: one_of("mediaVisibility", &["always", "private", "never"]),
            streamer_mode: one_of("streamerMode", &["always", "screenshare", "off"]),
            prettify_links: bool_of("prettifyLinks"),
            markdown: bool_of("markdown"),
            show_room_avatars: bool_of("showRoomAvatars"),
            merge_home_and_dms: bool_of("mergeHomeAndDms"),
            show_presence_dots: bool_of("showPresenceDots"),
            color_usernames: bool_of("colorUsernames"),
            group_images: bool_of("groupImages"),
            strip_photo_metadata: bool_of("stripPhotoMetadata"),
            compress_images: bool_of("compressImages"),
            large_emoji: bool_of("largeEmoji"),
            emoticons_to_emoji: bool_of("emoticonsToEmoji"),
            show_join_leave: bool_of("showJoinLeave"),
            show_profile_changes: bool_of("showProfileChanges"),
            custom_themes: content
                .get("customThemes")
                .and_then(Value::as_array)
                .cloned(),
            light_theme: theme_slot("lightTheme"),
            dark_theme: theme_slot("darkTheme"),
            themed_app_icon: bool_of("themedAppIcon"),
            chat_font_size: int_in("chatFontSize", 8..=48),
            chat_density: one_of("chatDensity", &["compact", "default", "spacious"]),
            align_own_right: bool_of("alignOwnRight"),
            time_format: one_of("timeFormat", &["auto", "12h", "24h"]),
            ui_zoom: int_in("uiZoom", 50..=200),
            theme: string_of("theme").map(str::to_owned),
            active_custom_theme: string_of("activeCustomTheme").map(str::to_owned),
        }
    }
}

/// Writes go one at a time, and this device's changes count until the server sends them back,
/// so a read right after a write doesn't undo it.
#[derive(Default)]
pub(crate) struct SyncedSettingsState {
    write: futures_util::lock::Mutex<()>,
    pending: Mutex<Map<String, Value>>,
}

fn as_map(content: Option<Value>) -> Map<String, Value> {
    match content {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    }
}

impl WizardClient {
    fn with_pending(&self, mut content: Map<String, Value>) -> SyncedSettings {
        let mut pending = self.synced_settings.pending.lock().unwrap();
        if pending
            .iter()
            .all(|(key, value)| content.get(key) == Some(value))
        {
            pending.clear();
        }
        content.extend(pending.clone());
        SyncedSettings::from_content(&content)
    }

    pub async fn synced_settings(&self) -> Result<SyncedSettings> {
        let _write = self.synced_settings.write.lock().await;
        let content = match self.cached_account_data(SETTINGS_EVENT).await? {
            Some(content) => Some(content),
            None => self.account_data(SETTINGS_EVENT).await?,
        };
        Ok(self.with_pending(as_map(content)))
    }

    /// Calls `on_change` with the settings now and whenever they change.
    pub async fn watch_synced_settings(
        &self,
        mut on_change: impl FnMut(SyncedSettings),
    ) -> Result<()> {
        self.watch_account_data(SETTINGS_EVENT, |content| {
            on_change(self.with_pending(as_map(content)))
        })
        .await
    }

    /// Writes the fields that are set and keeps the rest, including keys this version doesn't
    /// know.
    pub async fn update_synced_settings(&self, changes: SyncedSettings) -> Result<()> {
        let Value::Object(changes) =
            serde_json::to_value(changes).map_err(|e| Error::Sdk(e.to_string()))?
        else {
            return Ok(());
        };
        if changes.is_empty() {
            return Ok(());
        }
        self.synced_settings
            .pending
            .lock()
            .unwrap()
            .extend(changes.clone());
        let _write = self.synced_settings.write.lock().await;
        let result = async {
            let mut content = as_map(self.account_data(SETTINGS_EVENT).await?);
            content.extend(changes.clone());
            self.set_account_data(SETTINGS_EVENT, Value::Object(content))
                .await
        }
        .await;
        if result.is_err() {
            let mut pending = self.synced_settings.pending.lock().unwrap();
            pending.retain(|key, value| changes.get(key) != Some(value));
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::SyncedSettings;

    fn parse(content: Value) -> SyncedSettings {
        SyncedSettings::from_content(content.as_object().unwrap())
    }

    #[test]
    fn reads_valid_values_and_drops_invalid_ones() {
        let settings = parse(json!({
            "language": "de",
            "messageLayout": "compact",
            "colorUsernames": false,
            "chatFontSize": 16,
            "uiZoom": 500,
            "timeFormat": "12h",
            "chatDensity": "huge",
            "largeEmoji": "yes",
            "lightTheme": "",
            "unknown": true,
        }));
        assert_eq!(settings.language.as_deref(), Some("de"));
        assert_eq!(settings.message_layout.as_deref(), Some("compact"));
        assert_eq!(settings.color_usernames, Some(false));
        assert_eq!(settings.chat_font_size, Some(16));
        assert_eq!(settings.ui_zoom, None);
        assert_eq!(settings.time_format.as_deref(), Some("12h"));
        assert_eq!(settings.chat_density, None);
        assert_eq!(settings.large_emoji, None);
        assert_eq!(settings.light_theme, None);
    }

    #[test]
    fn typing_indicators_fall_back_to_the_old_key() {
        assert_eq!(
            parse(json!({ "sendTyping": false })).typing_indicators,
            Some(false)
        );
        assert_eq!(
            parse(json!({ "sendTyping": false, "typingIndicators": true })).typing_indicators,
            Some(true)
        );
    }

    #[test]
    fn only_set_fields_are_written() {
        let changes = SyncedSettings {
            typing_indicators: Some(false),
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(changes).unwrap(),
            json!({ "typingIndicators": false })
        );
    }
}
