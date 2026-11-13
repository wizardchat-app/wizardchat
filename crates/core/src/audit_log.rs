//! A room's or space's audit log: moderation, membership and settings changes, newest first,
//! read from the room history with a server-side type filter.

use futures_util::{stream, StreamExt};
use matrix_sdk::ruma::{
    api::{
        client::{filter::RoomEventFilter, message::get_message_events, room::get_room_event},
        Direction,
    },
    OwnedEventId, UInt,
};
use serde::Serialize;
use serde_json::Value;

use crate::{Error, Result, WizardClient};

const AUDIT_TYPES: [&str; 17] = [
    "m.room.create",
    "m.room.member",
    "m.room.power_levels",
    "m.room.name",
    "m.room.topic",
    "m.room.avatar",
    "m.room.canonical_alias",
    "m.room.join_rules",
    "m.room.history_visibility",
    "m.room.guest_access",
    "m.room.encryption",
    "m.room.server_acl",
    "m.room.tombstone",
    "m.room.pinned_events",
    "m.space.child",
    "m.space.parent",
    "m.room.redaction",
];
const PAGE_SIZE: u32 = 200;
const PARALLEL_LOOKUPS: usize = 8;

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub event: Value,
    pub redacted_sender: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AuditLogPage {
    pub entries: Vec<AuditLogEntry>,
    pub next: Option<String>,
}

fn str_at<'a>(event: &'a Value, pointer: &str) -> Option<&'a str> {
    event.pointer(pointer).and_then(Value::as_str)
}

fn is_profile_change(event: &Value) -> bool {
    str_at(event, "/type") == Some("m.room.member")
        && str_at(event, "/content/membership") == Some("join")
        && str_at(event, "/unsigned/prev_content/membership") == Some("join")
}

impl WizardClient {
    pub async fn audit_log(&self, room_id: &str, from: Option<String>) -> Result<AuditLogPage> {
        let room = self.room(room_id)?;
        let mut filter = RoomEventFilter::default();
        filter.types = Some(AUDIT_TYPES.iter().map(|t| (*t).to_owned()).collect());
        let mut request =
            get_message_events::v3::Request::new(room.room_id().to_owned(), Direction::Backward);
        request.from = from;
        request.limit = UInt::from(PAGE_SIZE);
        request.filter = filter;
        let response = self.sdk().send(request).await?;
        let next = if response.chunk.is_empty() {
            None
        } else {
            response.end
        };
        let events: Vec<Value> = response
            .chunk
            .iter()
            .filter_map(|raw| serde_json::from_str::<Value>(raw.json().get()).ok())
            .filter(|event| !is_profile_change(event))
            .collect();

        let room_id = room.room_id();
        let entries: Vec<AuditLogEntry> = stream::iter(events)
            .map(|event| async move {
                if str_at(&event, "/type") != Some("m.room.redaction") {
                    return Some(AuditLogEntry {
                        event,
                        redacted_sender: None,
                    });
                }
                let target = str_at(&event, "/redacts")
                    .or_else(|| str_at(&event, "/content/redacts"))
                    .and_then(|id| OwnedEventId::try_from(id).ok());
                let redacted_sender = match target {
                    Some(id) => self.event_sender(room_id, id).await,
                    None => None,
                };
                (redacted_sender.as_deref() != str_at(&event, "/sender")).then_some(AuditLogEntry {
                    event,
                    redacted_sender,
                })
            })
            .buffered(PARALLEL_LOOKUPS)
            .filter_map(|entry| async move { entry })
            .collect()
            .await;
        Ok(AuditLogPage { entries, next })
    }

    async fn event_sender(
        &self,
        room_id: &matrix_sdk::ruma::RoomId,
        event_id: OwnedEventId,
    ) -> Option<String> {
        let request = get_room_event::v3::Request::new(room_id.to_owned(), event_id);
        let event: Value = self
            .sdk()
            .send(request)
            .await
            .ok()?
            .event
            .deserialize_as_unchecked()
            .map_err(|e| Error::Sdk(e.to_string()))
            .ok()?;
        str_at(&event, "/sender").map(ToOwned::to_owned)
    }
}
