use matrix_sdk::cross_process_lock::CrossProcessLockConfig;
use matrix_sdk::ruma::{
    api::client::{
        filter::{FilterDefinition, RoomEventFilter},
        push::{PusherIds, PusherInit, PusherKind},
        sync::sync_events,
    },
    events::AnySyncTimelineEvent,
    presence::PresenceState,
    push::{HttpPusherData, PushFormat},
    serde::Raw,
    UserId,
};
use matrix_sdk_ui::notification_client::{
    NotificationClient, NotificationProcessSetup, NotificationStatus, RawNotificationEvent,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    features::notification_for, rooms::parse_room_id, timeline::parse_event_id, Error,
    Notification, Result, WizardClient,
};

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PusherConfig {
    pub app_id: String,
    pub pushkey: String,
    pub gateway_url: String,
    pub app_name: String,
    pub device_name: String,
    pub lang: String,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub alert_key: Option<String>,
}

impl WizardClient {
    pub async fn set_pusher(&self, config: PusherConfig) -> Result<()> {
        let user_id = self.user_id().ok_or(Error::NotSignedIn)?;
        let mut data = HttpPusherData::new(config.gateway_url);
        data.format = Some(PushFormat::EventIdOnly);
        let mut payload = json!({ "user_id": user_id });
        if let Some(key) = config.alert_key {
            payload["aps"] = json!({
                "mutable-content": 1,
                "alert": { "loc-key": key },
                "sound": "default",
            });
        }
        data.data.insert("default_payload".into(), payload);
        let pusher = PusherInit {
            ids: PusherIds::new(config.pushkey, config.app_id),
            kind: PusherKind::Http(data),
            app_display_name: config.app_name,
            device_display_name: config.device_name,
            profile_tag: None,
            lang: config.lang,
        };
        self.sdk().pusher().set(pusher.into(), false).await?;
        Ok(())
    }

    pub async fn remove_pusher(&self, app_id: String, pushkey: String) -> Result<()> {
        self.sdk()
            .pusher()
            .delete(PusherIds::new(pushkey, app_id))
            .await?;
        Ok(())
    }

    pub async fn read_rooms(&self, room_ids: Vec<String>) -> Result<Vec<String>> {
        let rooms = room_ids
            .iter()
            .filter_map(|id| parse_room_id(id).ok().map(ToOwned::to_owned))
            .collect::<Vec<_>>();
        if rooms.is_empty() {
            return Ok(Vec::new());
        }
        let mut filter = FilterDefinition::ignore_all();
        filter.room.rooms = Some(rooms);
        filter.room.timeline = RoomEventFilter::empty();
        filter.room.timeline.limit = Some(1u32.into());
        let mut request = sync_events::v3::Request::new();
        request.filter = Some(sync_events::v3::Filter::FilterDefinition(filter));
        request.set_presence = PresenceState::Offline;
        request.timeout = Some(std::time::Duration::ZERO);
        let response = self.sdk().send(request).await?;
        Ok(response
            .rooms
            .join
            .into_iter()
            .filter(|(_, room)| {
                let counts = &room.unread_notifications;
                counts.notification_count.is_none_or(|n| n == 0u32.into())
                    && counts.highlight_count.is_none_or(|n| n == 0u32.into())
            })
            .map(|(id, _)| id.to_string())
            .collect())
    }

    pub async fn pushed_notification(
        &self,
        room_id: &str,
        event_id: &str,
    ) -> Result<Option<Notification>> {
        let room_id = parse_room_id(room_id)?;
        let event_id = parse_event_id(event_id)?;
        let own_user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let separate_process = !self.is_syncing()
            && matches!(
                self.sdk().cross_process_lock_config(),
                CrossProcessLockConfig::MultiProcess { .. }
            );
        let setup = if separate_process {
            NotificationProcessSetup::MultipleProcesses
        } else {
            NotificationProcessSetup::SingleProcess {
                sync_service: self.built_sync_service().await?,
            }
        };
        let client = NotificationClient::new(self.sdk().clone(), setup)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let item = match client
            .get_notification(room_id, &event_id)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
        {
            NotificationStatus::Event(item) => item,
            _ => return Ok(None),
        };
        let RawNotificationEvent::Timeline(raw) = &item.raw_event else {
            return Ok(None);
        };
        let Some(room) = self
            .sdk()
            .get_room(room_id)
            .or_else(|| client.get_room(room_id))
        else {
            return Ok(None);
        };
        let undecrypted =
            raw.get_field::<String>("type").ok().flatten().as_deref() == Some("m.room.encrypted");
        let notification = if undecrypted {
            undecrypted_notification(room_id.as_str(), raw, &own_user)
        } else {
            notification_for(&room, raw, item.actions.clone(), &own_user, 0).await
        };
        Ok(notification.map(|n| Notification {
            room_name: Some(item.room_computed_display_name.clone()),
            room_avatar_url: item.room_avatar_url.clone(),
            is_direct: item.is_direct_message_room,
            sender_name: item.sender_display_name.clone().or(n.sender_name),
            ..n
        }))
    }
}

fn undecrypted_notification(
    room_id: &str,
    raw: &Raw<AnySyncTimelineEvent>,
    own_user: &UserId,
) -> Option<Notification> {
    let sender: String = raw.get_field("sender").ok().flatten()?;
    if sender == own_user.as_str() {
        return None;
    }
    Some(Notification {
        room_id: room_id.to_owned(),
        room_name: None,
        room_avatar_url: None,
        event_id: raw.get_field("event_id").ok().flatten()?,
        sender,
        sender_name: None,
        body: String::new(),
        spoiler: false,
        encrypted: true,
        highlight: false,
        sound: true,
        is_direct: false,
        ts: raw
            .get_field("origin_server_ts")
            .ok()
            .flatten()
            .unwrap_or_default(),
    })
}
