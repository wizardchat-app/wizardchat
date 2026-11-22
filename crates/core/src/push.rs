use matrix_sdk::cross_process_lock::CrossProcessLockConfig;
use matrix_sdk::ruma::{
    api::client::{
        filter::{FilterDefinition, RoomEventFilter},
        push::{set_pushrule, PusherIds, PusherInit, PusherKind},
        sync::sync_events,
    },
    events::{
        room::member::{MembershipState, StrippedRoomMemberEvent},
        AnySyncTimelineEvent,
    },
    presence::PresenceState,
    push::{
        Action, EventMatchConditionData, HttpPusherData, NewConditionalPushRule, NewPushRule,
        PushCondition, PushFormat, Tweak,
    },
    serde::Raw,
    EventId, MilliSecondsSinceUnixEpoch, UserId,
};
use matrix_sdk_ui::notification_client::{
    NotificationClient, NotificationItem, NotificationProcessSetup, NotificationStatus,
    RawNotificationEvent,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    calls::{incoming_call, is_call_notification, IncomingCall},
    features::{notification_for, NotificationKind},
    rooms::parse_room_id,
    timeline::parse_event_id,
    Error, Notification, Result, WizardClient,
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

const RING_PUSH_RULE: &str = "org.wizardchat.rtc_notification";

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum PushedEvent {
    Message { notification: Notification },
    Call { call: IncomingCall },
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
        if let Err(error) = self.add_ring_push_rule().await {
            tracing::warn!("couldn't add the push rule for calls: {error}");
        }
        Ok(())
    }

    async fn add_ring_push_rule(&self) -> Result<()> {
        let rule = NewConditionalPushRule::new(
            RING_PUSH_RULE.to_owned(),
            vec![PushCondition::EventMatch(EventMatchConditionData::new(
                "type".to_owned(),
                "*rtc.notification".to_owned(),
            ))],
            vec![
                Action::Notify,
                Action::SetTweak(Tweak::Sound("ring".into())),
            ],
        );
        self.sdk()
            .send(set_pushrule::v3::Request::new(NewPushRule::Underride(rule)))
            .await?;
        Ok(())
    }

    pub async fn remove_pusher(&self, app_id: String, pushkey: String) -> Result<()> {
        self.sdk()
            .pusher()
            .delete(PusherIds::new(pushkey, app_id))
            .await?;
        Ok(())
    }

    async fn filtered_event(
        &self,
        room: Option<matrix_sdk::Room>,
        event_id: &EventId,
        own_user: &UserId,
    ) -> Option<PushedEvent> {
        let room = room?;
        let event = room.load_or_fetch_event(event_id, None).await.ok()?;
        let raw = event.raw();
        let kind = raw.get_field::<String>("type").ok().flatten()?;
        if is_call_notification(&kind) {
            return self.pushed_call(&room, raw, event_id).await;
        }
        if kind != "m.sticker" {
            return None;
        }
        notification_for(&room, raw, None, own_user, 0)
            .await
            .map(|notification| PushedEvent::Message { notification })
    }

    async fn pushed_call(
        &self,
        room: &matrix_sdk::Room,
        raw: &Raw<AnySyncTimelineEvent>,
        event_id: &EventId,
    ) -> Option<PushedEvent> {
        let mut event: Value = raw.deserialize_as_unchecked().ok()?;
        if event.get("event_id").is_none() {
            event["event_id"] = json!(event_id.as_str());
        }
        let call = incoming_call(&event, room, &self.own_device()).await?;
        Some(PushedEvent::Call { call })
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
        Ok(match self.pushed_event(room_id, event_id).await? {
            Some(PushedEvent::Message { notification }) => Some(notification),
            _ => None,
        })
    }

    pub async fn pushed_event(&self, room_id: &str, event_id: &str) -> Result<Option<PushedEvent>> {
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
            NotificationStatus::EventFilteredOut => {
                let room = client
                    .get_room(room_id)
                    .or_else(|| self.sdk().get_room(room_id));
                return Ok(self.filtered_event(room, &event_id, &own_user).await);
            }
            _ => return Ok(None),
        };
        let raw = match &item.raw_event {
            RawNotificationEvent::Timeline(raw) => raw,
            RawNotificationEvent::Invite(invite) => {
                return Ok(invite_notification(
                    &item,
                    invite,
                    &own_user,
                    room_id.as_str(),
                    event_id.as_str(),
                )
                .map(|notification| PushedEvent::Message { notification }));
            }
        };
        let Some(room) = self
            .sdk()
            .get_room(room_id)
            .or_else(|| client.get_room(room_id))
        else {
            return Ok(None);
        };
        let kind = raw.get_field::<String>("type").ok().flatten();
        if kind.as_deref().is_some_and(is_call_notification) {
            let room = client.get_room(room_id).unwrap_or(room);
            return Ok(self.pushed_call(&room, raw, &event_id).await);
        }
        let undecrypted = kind.as_deref() == Some("m.room.encrypted");
        let notification = if undecrypted {
            undecrypted_notification(room_id.as_str(), raw, &own_user)
        } else {
            notification_for(&room, raw, item.actions.clone(), &own_user, 0).await
        };
        Ok(notification.map(|n| PushedEvent::Message {
            notification: Notification {
                room_name: Some(item.room_computed_display_name.clone()),
                room_avatar_url: item.room_avatar_url.clone(),
                is_direct: item.is_direct_message_room,
                sender_name: item.sender_display_name.clone().or(n.sender_name),
                ..n
            },
        }))
    }
}

fn invite_notification(
    item: &NotificationItem,
    invite: &Raw<StrippedRoomMemberEvent>,
    own_user: &UserId,
    room_id: &str,
    event_id: &str,
) -> Option<Notification> {
    let event = invite.deserialize().ok()?;
    if event.state_key != own_user || event.content.membership != MembershipState::Invite {
        return None;
    }
    Some(Notification {
        room_id: room_id.to_owned(),
        room_name: Some(item.room_computed_display_name.clone()),
        room_avatar_url: item.room_avatar_url.clone(),
        event_id: event_id.to_owned(),
        sender: event.sender.to_string(),
        sender_name: item.sender_display_name.clone(),
        body: String::new(),
        spoiler: false,
        encrypted: false,
        highlight: true,
        sound: true,
        is_direct: item.is_direct_message_room || event.content.is_direct == Some(true),
        ts: u64::from(MilliSecondsSinceUnixEpoch::now().get()),
        kind: NotificationKind::Invite,
        thread_id: None,
    })
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
    // m.relates_to stays readable in encrypted events: reactions, edits, poll answers and call
    // reactions are never messages worth a notification
    let content: Option<Value> = raw.get_field("content").ok().flatten();
    let rel_type = content
        .as_ref()
        .and_then(|c| c.pointer("/m.relates_to/rel_type"))
        .and_then(Value::as_str);
    if matches!(rel_type, Some("m.annotation" | "m.replace" | "m.reference")) {
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
        kind: NotificationKind::Message,
        thread_id: None,
        ts: raw
            .get_field("origin_server_ts")
            .ok()
            .flatten()
            .unwrap_or_default(),
    })
}
