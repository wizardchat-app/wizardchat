use std::{
    collections::{HashMap, HashSet},
    future::IntoFuture,
    sync::Arc,
};

use eyeball_im::{Vector, VectorDiff};

use futures_util::{pin_mut, StreamExt};
use matrix_sdk::ruma::{
    events::{room::message::Relation, AnyMessageLikeEventContent, AnySyncTimelineEvent},
    serde::Raw,
};
use matrix_sdk::{
    attachment::{AttachmentInfo, BaseImageInfo},
    room::edit::EditedContent,
    ruma::{
        api::client::receipt::create_receipt::v3::ReceiptType,
        events::room::message::{RoomMessageEventContent, RoomMessageEventContentWithoutRelation},
        EventId, OwnedEventId, OwnedTransactionId, OwnedUserId, UInt,
    },
};
use matrix_sdk_ui::timeline::{
    default_event_filter, AttachmentConfig, AttachmentSource, EventSendState, EventTimelineItem,
    MsgLikeKind, RoomExt, Timeline, TimelineDetails, TimelineEventItemId, TimelineFocus,
    TimelineItem, TimelineItemContent, TimelineItemKind, VirtualTimelineItem,
};
use serde::Serialize;

use crate::{
    content::{content_of, reply_preview, EntryContent, ReplyPreview},
    Error, ListDiff, Result, WizardClient,
};

/// One row of a room's timeline.
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "camelCase")]
#[allow(clippy::large_enum_variant)] // short-lived view models, serialised right away
pub enum TimelineEntry {
    #[serde(rename_all = "camelCase")]
    Event {
        /// Stable across local echo -> remote event, use it as the UI key
        id: String,
        /// Identifies the event for actions (reply, edit, react, delete)
        item_key: String,
        event_id: Option<String>,
        sender: String,
        sender_name: Option<String>,
        sender_avatar: Option<String>,
        /// Milliseconds since the Unix epoch
        timestamp: u64,
        is_own: bool,
        is_editable: bool,
        content: EntryContent,
        in_reply_to: Option<ReplyPreview>,
        thread_root: Option<String>,
        /// Set on messages that started a thread
        thread: Option<ThreadSummaryView>,
        edited: bool,
        reactions: Vec<Reaction>,
        send_state: Option<SendState>,
        /// Who has read up to here (their latest receipt is on this message)
        read_by: Vec<ReadReceiptView>,
        /// Intentional mentions (`m.mentions`)
        mentions: Option<MentionsView>,
        /// Why sending failed, when `sendState` is `failed`
        send_error: Option<String>,
    },
    DateDivider {
        id: String,
        timestamp: u64,
    },
    ReadMarker {
        id: String,
    },
    TimelineStart {
        id: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Reaction {
    pub key: String,
    pub count: usize,
    pub mine: bool,
    /// Who reacted, in order
    pub senders: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReadReceiptView {
    pub user_id: String,
    pub timestamp: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MentionsView {
    pub user_ids: Vec<String>,
    pub room: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummaryView {
    pub replies: u32,
    pub latest_sender: Option<String>,
    pub latest_sender_name: Option<String>,
    pub latest_summary: Option<String>,
    pub latest_event_id: Option<String>,
    pub latest_timestamp: Option<u64>,
    pub latest_redacted: bool,
    pub latest_undecryptable: bool,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum SendState {
    Sending,
    Failed,
    Sent,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct TypingUser {
    pub user_id: String,
    pub display_name: Option<String>,
}

const TXN_PREFIX: &str = "txn:";

fn item_key(id: &TimelineEventItemId) -> String {
    match id {
        TimelineEventItemId::EventId(event_id) => event_id.to_string(),
        TimelineEventItemId::TransactionId(txn) => format!("{TXN_PREFIX}{txn}"),
    }
}

fn parse_item_key(key: &str) -> Result<TimelineEventItemId> {
    match key.strip_prefix(TXN_PREFIX) {
        Some(txn) => Ok(TimelineEventItemId::TransactionId(
            OwnedTransactionId::from(txn),
        )),
        None => EventId::parse(key)
            .map(TimelineEventItemId::EventId)
            .map_err(|e| Error::InvalidId(e.to_string())),
    }
}

pub(crate) fn parse_event_id(id: &str) -> Result<OwnedEventId> {
    EventId::parse(id).map_err(|e| Error::InvalidId(e.to_string()))
}

fn event_entry(
    id: String,
    event: &EventTimelineItem,
    own_user: Option<&OwnedUserId>,
) -> TimelineEntry {
    let (sender_name, sender_avatar) = match event.sender_profile() {
        TimelineDetails::Ready(profile) => (
            profile.display_name.clone(),
            profile.avatar_url.as_ref().map(ToString::to_string),
        ),
        _ => (None, None),
    };
    let msg_like = match event.content() {
        TimelineItemContent::MsgLike(msg_like) => Some(msg_like),
        _ => None,
    };
    let edited =
        msg_like.is_some_and(|m| matches!(&m.kind, MsgLikeKind::Message(msg) if msg.is_edited()));
    let reactions = msg_like
        .map(|m| {
            m.reactions
                .iter()
                .map(|(key, senders)| Reaction {
                    key: key.clone(),
                    count: senders.len(),
                    mine: own_user.is_some_and(|own| senders.contains_key(own)),
                    senders: senders.keys().map(ToString::to_string).collect(),
                })
                .collect()
        })
        .unwrap_or_default();
    let raw: Option<serde_json::Value> = event
        .latest_json()
        .or_else(|| event.original_json())
        .and_then(|raw| raw.deserialize_as_unchecked().ok());
    let mentions = raw
        .as_ref()
        .and_then(|r| r.pointer("/content/m.mentions"))
        .map(|m| MentionsView {
            user_ids: m
                .get("user_ids")
                .and_then(serde_json::Value::as_array)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|v| v.as_str().map(ToOwned::to_owned))
                        .collect()
                })
                .unwrap_or_default(),
            room: m
                .get("room")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
        });
    let read_by = event
        .read_receipts()
        .iter()
        .map(|(user, receipt)| ReadReceiptView {
            user_id: user.to_string(),
            timestamp: receipt.ts.map(|ts| u64::from(ts.0)),
        })
        .collect();
    let send_state = event.send_state().map(|state| match state {
        EventSendState::NotSentYet { .. } => SendState::Sending,
        EventSendState::SendingFailed { .. } => SendState::Failed,
        EventSendState::Sent { .. } => SendState::Sent,
    });
    let send_error = match event.send_state() {
        Some(EventSendState::SendingFailed { error, .. }) => Some(send_error_text(error)),
        _ => None,
    };
    TimelineEntry::Event {
        id,
        item_key: item_key(&event.identifier()),
        event_id: event.event_id().map(ToString::to_string),
        sender: event.sender().to_string(),
        sender_name,
        sender_avatar,
        timestamp: u64::from(event.timestamp().0),
        is_own: event.is_own(),
        is_editable: event.is_editable(),
        content: content_of(event.content(), own_user.map(|u| u.as_ref()), raw.as_ref()),
        in_reply_to: msg_like
            .and_then(|m| m.in_reply_to.as_ref())
            .map(reply_preview),
        thread_root: msg_like
            .and_then(|m| m.thread_root.as_ref())
            .map(ToString::to_string),
        thread: msg_like
            .and_then(|m| m.thread_summary.as_ref())
            .map(|summary| {
                let latest = match &summary.latest_event {
                    TimelineDetails::Ready(event) => Some(event),
                    _ => None,
                };
                ThreadSummaryView {
                    replies: summary.num_replies,
                    latest_sender: latest.map(|e| e.sender.to_string()),
                    latest_sender_name: latest.and_then(|e| match &e.sender_profile {
                        TimelineDetails::Ready(profile) => profile.display_name.clone(),
                        _ => None,
                    }),
                    latest_summary: latest.map(|e| crate::content::summary_of(&e.content)),
                    latest_event_id: latest.and_then(|e| match &e.identifier {
                        TimelineEventItemId::EventId(id) => Some(id.to_string()),
                        TimelineEventItemId::TransactionId(_) => None,
                    }),
                    latest_timestamp: latest.map(|e| u64::from(e.timestamp.0)),
                    latest_redacted: latest.is_some_and(|e| {
                        matches!(&e.content, TimelineItemContent::MsgLike(m) if matches!(m.kind, MsgLikeKind::Redacted))
                    }),
                    latest_undecryptable: latest.is_some_and(|e| {
                        matches!(&e.content, TimelineItemContent::MsgLike(m) if matches!(m.kind, MsgLikeKind::UnableToDecrypt(_)))
                    }),
                }
            }),
        edited,
        reactions,
        send_state,
        read_by,
        mentions,
        send_error,
    }
}

/// The homeserver's explanation when it has one
fn send_error_text(error: &matrix_sdk::Error) -> String {
    use matrix_sdk::ruma::api::error::{ErrorBody, StandardErrorBody};
    match error.as_client_api_error().map(|e| &e.body) {
        Some(ErrorBody::Standard(StandardErrorBody { message, .. })) if !message.is_empty() => {
            message.clone()
        }
        _ => error.to_string(),
    }
}

impl TimelineEntry {
    fn from_item(item: &TimelineItem, own_user: Option<&OwnedUserId>) -> Self {
        let id = item.unique_id().0.clone();
        match item.kind() {
            TimelineItemKind::Event(event) => event_entry(id, event, own_user),
            TimelineItemKind::Virtual(VirtualTimelineItem::DateDivider(ts)) => {
                TimelineEntry::DateDivider {
                    id,
                    timestamp: u64::from(ts.0),
                }
            }
            TimelineItemKind::Virtual(VirtualTimelineItem::ReadMarker) => {
                TimelineEntry::ReadMarker { id }
            }
            TimelineItemKind::Virtual(_) => TimelineEntry::TimelineStart { id },
        }
    }
}

fn item_id(item: &TimelineItem) -> &str {
    &item.unique_id().0
}

fn diff_values<T>(diff: &VectorDiff<T>, mut each: impl FnMut(&T)) {
    match diff {
        VectorDiff::Append { values } | VectorDiff::Reset { values } => {
            values.iter().for_each(each)
        }
        VectorDiff::PushFront { value }
        | VectorDiff::PushBack { value }
        | VectorDiff::Insert { value, .. }
        | VectorDiff::Set { value, .. } => each(value),
        _ => {}
    }
}

impl TimelineEntry {
    fn with_call(mut self, tile: Option<&crate::call_history::CallHistoryView>) -> Self {
        if let (TimelineEntry::Event { content, .. }, Some(tile)) = (&mut self, tile) {
            *content = EntryContent::Call { call: tile.clone() };
        }
        self
    }
}

/// A live timeline of one room. Keep it alive as long as the room is shown.
pub struct RoomTimeline {
    timeline: Arc<Timeline>,
    own_user: Option<OwnedUserId>,
    thread_root: Option<OwnedEventId>,
}

/// Which part of a room a timeline shows
#[derive(Clone, Debug)]
pub enum TimelineKind {
    /// The main timeline, without thread replies
    Main,
    Thread {
        root_event_id: String,
    },
    Pinned,
    /// Around one event (jump to a message), loading both ways from there
    Event {
        event_id: String,
    },
}

impl WizardClient {
    pub async fn timeline(&self, room_id: &str) -> Result<RoomTimeline> {
        self.timeline_of(room_id, TimelineKind::Main).await
    }

    pub async fn timeline_of(&self, room_id: &str, kind: TimelineKind) -> Result<RoomTimeline> {
        let room = self.room(room_id)?;
        // An open room gets its full state (pinned events, ...) instead of the room list's subset
        if matches!(kind, TimelineKind::Main) {
            if let Ok(sync) = self.sync_service() {
                sync.room_list_service()
                    .set_room_subscriptions(&[room.room_id()])
                    .await;
            }
        }
        let thread_root = match &kind {
            TimelineKind::Thread { root_event_id } => Some(parse_event_id(root_event_id)?),
            _ => None,
        };
        let focus = match kind {
            TimelineKind::Main => TimelineFocus::Live {
                hide_threaded_events: true,
            },
            TimelineKind::Thread { root_event_id } => TimelineFocus::Thread {
                root_event_id: parse_event_id(&root_event_id)?,
            },
            TimelineKind::Pinned => TimelineFocus::PinnedEvents,
            TimelineKind::Event { event_id } => TimelineFocus::Event {
                target: parse_event_id(&event_id)?,
                num_context_events: 40,
                thread_mode: matrix_sdk_ui::timeline::TimelineEventFocusThreadMode::Automatic {
                    hide_threaded_events: true,
                },
            },
        };
        let timeline = room
            .timeline_builder()
            .with_focus(focus)
            .track_read_marker_and_receipts(
                matrix_sdk_ui::timeline::TimelineReadReceiptTracking::AllEvents,
            )
            .event_filter(|event, rules| default_event_filter(event, rules) || shown_too(event))
            .build()
            .await?;
        Ok(RoomTimeline {
            timeline: Arc::new(timeline),
            own_user: self.sdk().user_id().map(ToOwned::to_owned),
            thread_root,
        })
    }

    /// Moves the read receipt (unthreaded) and the fully-read marker to the room's latest
    /// message, as "Mark as read" does; a private receipt isn't shown to others.
    pub async fn mark_room_as_read(&self, room_id: &str, private: bool) -> Result<()> {
        mark_room_read(&self.room(room_id)?, private).await
    }

    /// Joins the room that replaced an upgraded one, through the server of whoever upgraded it.
    pub async fn join_upgraded_room(&self, room_id: &str) -> Result<String> {
        use matrix_sdk::ruma::{events::StateEventType, OwnedRoomOrAliasId, OwnedServerName};
        let room = self.room(room_id)?;
        let raw = room
            .get_state_event(StateEventType::RoomTombstone, "")
            .await?
            .ok_or_else(|| Error::InvalidId("the room wasn't upgraded".into()))?;
        let json: serde_json::Value = match raw {
            matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState::Sync(raw) => {
                raw.deserialize_as_unchecked()
            }
            matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState::Stripped(raw) => {
                raw.deserialize_as_unchecked()
            }
        }
        .map_err(|e| Error::Sdk(e.to_string()))?;
        let replacement = json
            .pointer("/content/replacement_room")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| Error::InvalidId("the room wasn't upgraded".into()))?;
        let target = OwnedRoomOrAliasId::try_from(replacement)
            .map_err(|e| Error::InvalidId(e.to_string()))?;
        let via: Vec<OwnedServerName> = json
            .get("sender")
            .and_then(serde_json::Value::as_str)
            .and_then(|sender| OwnedUserId::try_from(sender).ok())
            .map(|sender| sender.server_name().to_owned())
            .into_iter()
            .collect();
        let joined = self.sdk().join_room_by_id_or_alias(&target, &via).await?;
        Ok(joined.room_id().to_string())
    }
}

/// What the SDK hides by default but should be shown: custom msgtypes and stable polls
fn shown_too(event: &AnySyncTimelineEvent) -> bool {
    let AnySyncTimelineEvent::MessageLike(message) = event else {
        return false;
    };
    match message.original_content() {
        Some(AnyMessageLikeEventContent::RoomMessage(content)) => {
            !matches!(content.relates_to, Some(Relation::Replacement(_)))
        }
        Some(AnyMessageLikeEventContent::PollStart(_)) => true,
        _ => false,
    }
}

/// Call rings notify and count as unread too, so reading the room must be able to pass them
const RECEIPTABLE_TYPES: [&str; 7] = [
    "m.room.message",
    "m.sticker",
    "m.room.encrypted",
    "m.poll.start",
    "org.matrix.msc3381.poll.start",
    "m.rtc.notification",
    "org.matrix.msc4075.rtc.notification",
];

/// The event, when read receipts may point at it: messages and call rings, not joins or call state
fn receiptable(raw: &Raw<AnySyncTimelineEvent>, in_threads: bool) -> Option<OwnedEventId> {
    let json: serde_json::Value = raw.deserialize_as_unchecked().ok()?;
    let event_type = json.get("type")?.as_str()?;
    if !RECEIPTABLE_TYPES.contains(&event_type)
        || json.pointer("/unsigned/redacted_because").is_some()
    {
        return None;
    }
    let threaded = json
        .pointer("/content/m.relates_to/rel_type")
        .and_then(serde_json::Value::as_str)
        == Some("m.thread");
    if threaded && !in_threads {
        return None;
    }
    OwnedEventId::try_from(json.get("event_id")?.as_str()?).ok()
}

async fn mark_room_read(room: &matrix_sdk::Room, private: bool) -> Result<()> {
    use matrix_sdk::{
        room::Receipts,
        ruma::events::{
            fully_read::FullyReadEventContent,
            receipt::{ReceiptThread, ReceiptType as StoredReceiptType},
        },
    };
    let latest = match room.event_cache().await {
        Ok((cache, _drop)) => {
            let message = cache
                .rfind_map_event_in_memory_by(|event| receiptable(event.raw(), false))
                .await
                .ok()
                .flatten();
            match message {
                Some(id) => Some(id),
                // Only state changes loaded so far: the room should still end up read
                None => cache
                    .rfind_map_event_in_memory_by(|event| event.event_id().map(ToOwned::to_owned))
                    .await
                    .ok()
                    .flatten(),
            }
        }
        Err(_) => None,
    };
    let Some(event_id) = latest else {
        room.set_unread_flag(false).await?;
        return Ok(());
    };
    let stored_type = if private {
        StoredReceiptType::ReadPrivate
    } else {
        StoredReceiptType::Read
    };
    let receipt = room
        .load_user_receipt(stored_type, &ReceiptThread::Unthreaded, room.own_user_id())
        .await?
        .map(|(id, _)| id);
    let fully_read = room
        .account_data_static::<FullyReadEventContent>()
        .await?
        .and_then(|raw| raw.deserialize().ok())
        .map(|event| event.content.event_id);
    if receipt.as_ref() == Some(&event_id) && fully_read.as_ref() == Some(&event_id) {
        room.set_unread_flag(false).await?;
        return Ok(());
    }
    let receipts = Receipts::new().fully_read_marker(event_id.clone());
    let receipts = if private {
        receipts.private_read_receipt(event_id)
    } else {
        receipts.public_read_receipt(event_id)
    };
    room.send_multiple_receipts(receipts).await?;
    Ok(())
}

/// An attachment to upload, as the app has it in memory
#[derive(Default)]
pub struct Attachment {
    pub bytes: Vec<u8>,
    pub filename: String,
    pub mimetype: String,
    pub caption: Option<String>,
    /// Pixel size for images, so other clients can lay them out before loading
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Blurred until clicked (MSC4193)
    pub spoiler: bool,
    pub spoiler_reason: Option<String>,
    /// A recorded voice message, with its loudness samples (0-1024)
    pub voice: bool,
    pub duration_ms: Option<u64>,
    pub waveform: Option<Vec<u16>>,
    /// A preview image for images and videos (encoded bytes, its type and size)
    pub thumbnail: Option<(Vec<u8>, String, u32, u32)>,
    pub duration_ms_video: Option<u64>,
    pub is_animated: bool,
    /// The caption as HTML (Markdown otherwise)
    pub caption_html: Option<String>,
    pub mentions: Option<MentionsInput>,
}

/// A file uploaded ahead of sending (while the message is composed)
#[derive(Default)]
pub struct UploadedAttachment {
    /// `{ url }` or, in encrypted rooms, `{ file }`, as `uploadFile` returned it
    pub source: serde_json::Value,
    pub size: u64,
    pub filename: String,
    pub mimetype: String,
    pub caption: Option<String>,
    pub caption_html: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u64>,
    pub spoiler: bool,
    pub spoiler_reason: Option<String>,
    pub voice: bool,
    pub waveform: Option<Vec<u16>>,
    pub is_animated: bool,
    /// The uploaded preview: its source, type, size in pixels and bytes
    pub thumbnail: Option<(serde_json::Value, String, u32, u32, u64)>,
    pub mentions: Option<MentionsInput>,
}

impl UploadedAttachment {
    fn content(self) -> serde_json::Value {
        use serde_json::{json, Map, Value};
        let mime: mime::Mime = self
            .mimetype
            .parse()
            .unwrap_or(mime::APPLICATION_OCTET_STREAM);
        let msgtype = match mime.type_() {
            mime::IMAGE if mime.subtype() != mime::SVG => "m.image",
            mime::VIDEO => "m.video",
            mime::AUDIO => "m.audio",
            _ => "m.file",
        };
        let mut info = Map::new();
        info.insert("mimetype".into(), json!(self.mimetype));
        info.insert("size".into(), json!(self.size));
        if matches!(msgtype, "m.image" | "m.video") {
            if let Some(w) = self.width {
                info.insert("w".into(), json!(w));
            }
            if let Some(h) = self.height {
                info.insert("h".into(), json!(h));
            }
        }
        if let Some(duration) = self.duration_ms.filter(|_| msgtype != "m.image") {
            info.insert("duration".into(), json!(duration));
        }
        if msgtype == "m.image" {
            info.insert("is_animated".into(), json!(self.is_animated));
        }
        if let Some((source, mimetype, w, h, size)) = self.thumbnail {
            info.insert(
                "thumbnail_info".into(),
                json!({ "mimetype": mimetype, "w": w, "h": h, "size": size }),
            );
            if let Some(url) = source.get("url") {
                info.insert("thumbnail_url".into(), url.clone());
            } else if let Some(file) = source.get("file") {
                info.insert("thumbnail_file".into(), file.clone());
            }
        }
        let caption = self.caption.filter(|c| !c.trim().is_empty());
        let mut content = Map::new();
        content.insert("msgtype".into(), json!(msgtype));
        content.insert(
            "body".into(),
            json!(caption.clone().unwrap_or_else(|| self.filename.clone())),
        );
        content.insert("filename".into(), json!(self.filename));
        if let Some(caption) = &caption {
            let html = self
                .caption_html
                .filter(|h| !h.trim().is_empty())
                .or_else(|| {
                    matrix_sdk::ruma::events::room::message::FormattedBody::markdown(caption)
                        .map(|f| f.body)
                });
            if let Some(html) = html {
                content.insert("format".into(), json!("org.matrix.custom.html"));
                content.insert("formatted_body".into(), json!(html));
            }
        }
        content.insert("info".into(), Value::Object(info));
        if let Some(file) = self.source.get("file") {
            content.insert("file".into(), file.clone());
        } else if let Some(url) = self.source.get("url") {
            content.insert("url".into(), url.clone());
        }
        if self.spoiler && matches!(msgtype, "m.image" | "m.video") {
            content.insert("m.spoiler".into(), json!(true));
            content.insert(
                "page.codeberg.everypizza.msc4193.spoiler".into(),
                json!(true),
            );
            if let Some(reason) = self.spoiler_reason.filter(|r| !r.trim().is_empty()) {
                content.insert("m.spoiler.reason".into(), json!(reason));
                content.insert(
                    "page.codeberg.everypizza.msc4193.spoiler.reason".into(),
                    json!(reason),
                );
            }
        }
        if self.voice {
            let duration = self.duration_ms.unwrap_or_default();
            let mut file = Map::new();
            match (self.source.get("file"), self.source.get("url")) {
                (Some(encrypted), _) => file.insert("file".into(), encrypted.clone()),
                (_, Some(url)) => file.insert("url".into(), url.clone()),
                _ => None,
            };
            file.insert("name".into(), content["filename"].clone());
            file.insert("mimetype".into(), json!(self.mimetype));
            file.insert("size".into(), json!(self.size));
            content.insert("org.matrix.msc1767.text".into(), content["body"].clone());
            content.insert("org.matrix.msc1767.file".into(), Value::Object(file));
            content.insert(
                "org.matrix.msc1767.audio".into(),
                json!({ "duration": duration, "waveform": self.waveform.unwrap_or_default() }),
            );
            content.insert("org.matrix.msc3245.voice".into(), json!({}));
        }
        if let Some(mentions) = self.mentions {
            let mut m = Map::new();
            if !mentions.user_ids.is_empty() {
                m.insert("user_ids".into(), json!(mentions.user_ids));
            }
            if mentions.room {
                m.insert("room".into(), json!(true));
            }
            content.insert("m.mentions".into(), Value::Object(m));
        }
        Value::Object(content)
    }
}

/// How far an upload got, in bytes
#[derive(Clone, Copy, Debug, Default, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub current: u64,
    pub total: u64,
}

async fn with_progress<F: std::future::Future>(
    upload: F,
    progress: impl futures_util::Stream<Item = matrix_sdk::TransmissionProgress>,
    on_progress: &mut impl FnMut(UploadProgress),
) -> F::Output {
    use futures_util::future::{select, Either};
    let mut upload = std::pin::pin!(upload);
    let mut progress = Box::pin(progress);
    loop {
        match select(upload.as_mut(), progress.next()).await {
            Either::Left((done, _)) => return done,
            Either::Right((Some(p), _)) if p.total > 0 => on_progress(UploadProgress {
                current: p.current as u64,
                total: p.total as u64,
            }),
            Either::Right((Some(_), _)) => {}
            Either::Right((None, _)) => return upload.await,
        }
    }
}

/// What kind of text message to send
#[derive(Clone, Copy, Debug, Default, serde::Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MessageKind {
    #[default]
    Text,
    Emote,
    Notice,
}

/// Who a message mentions on purpose (`m.mentions`)
#[derive(Clone, Debug, Default, serde::Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(feature = "typegen", serde(rename = "Mentions"))]
pub struct MentionsInput {
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub user_ids: Vec<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub room: bool,
}

impl RoomTimeline {
    /// Streams the timeline as diffs, starting with a `Reset` of the current items.
    pub async fn watch(&self, mut on_update: impl FnMut(Vec<ListDiff<TimelineEntry>>)) {
        let own = self.own_user.as_ref();
        let (items, stream) = self.timeline.subscribe().await;
        let mut shown = items.clone();
        let mut calls = self.call_tiles(&shown).await;
        on_update(vec![ListDiff::Reset {
            values: items
                .iter()
                .map(|item| TimelineEntry::from_item(item, own).with_call(calls.get(item_id(item))))
                .collect(),
        }]);
        pin_mut!(stream);
        while let Some(diffs) = stream.next().await {
            let mut touched: HashSet<String> = HashSet::new();
            for diff in &diffs {
                diff_values(diff, |item| {
                    touched.insert(item_id(item).to_owned());
                });
                diff.clone().apply(&mut shown);
            }
            let mut mapped: Vec<ListDiff<TimelineEntry>> = diffs
                .into_iter()
                .map(|diff| {
                    ListDiff::map(diff, |item: &Arc<TimelineItem>| {
                        TimelineEntry::from_item(item, own)
                    })
                })
                .collect();
            let fresh = self.call_tiles(&shown).await;
            if !fresh.is_empty() || !calls.is_empty() {
                for (index, item) in shown.iter().enumerate() {
                    let id = item_id(item);
                    let tile = fresh.get(id);
                    if tile != calls.get(id) || (tile.is_some() && touched.contains(id)) {
                        mapped.push(ListDiff::Set {
                            index,
                            value: TimelineEntry::from_item(item, own).with_call(tile),
                        });
                    }
                }
            }
            calls = fresh;
            on_update(mapped);
        }
    }

    /// The tile of every call in the loaded items, keyed by the item showing it
    async fn call_tiles(
        &self,
        items: &Vector<Arc<TimelineItem>>,
    ) -> HashMap<String, crate::call_history::CallHistoryView> {
        let calls = crate::call_history::call_items(items.iter());
        if calls.is_empty() {
            return HashMap::new();
        }
        let room = self.timeline.room();
        let client = room.client();
        let own = (
            client
                .user_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
            client
                .device_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
        );
        let live = crate::calls::call_members_of(room, own.clone(), false)
            .await
            .is_ok_and(|members| !members.is_empty());
        crate::call_history::call_tiles(&calls, live, &own.0)
    }

    /// Loads older events. Returns `true` once the start of the room has been reached.
    pub async fn paginate_back(&self, events: u16) -> Result<bool> {
        Ok(self.timeline.paginate_backwards(events).await?)
    }

    /// Loads newer messages in a timeline opened at an event; true once it reached the latest.
    pub async fn paginate_forward(&self, events: u16) -> Result<bool> {
        Ok(self.timeline.paginate_forwards(events).await?)
    }

    /// Sends a text message (Markdown is rendered to HTML), optionally as a reply.
    /// Sends a text, emote or notice. Without `html` the body is read as Markdown.
    pub async fn send_message(
        &self,
        kind: MessageKind,
        body: &str,
        html: Option<&str>,
        reply_to: Option<&str>,
        mentions: Option<MentionsInput>,
    ) -> Result<()> {
        use matrix_sdk::ruma::events::room::message::MessageType;
        let msgtype = match (kind, html) {
            (MessageKind::Text, Some(html)) => MessageType::text_html(body, html),
            (MessageKind::Text, None) => MessageType::text_markdown(body),
            (MessageKind::Emote, Some(html)) => MessageType::emote_html(body, html),
            (MessageKind::Emote, None) => MessageType::emote_markdown(body),
            (MessageKind::Notice, Some(html)) => MessageType::notice_html(body, html),
            (MessageKind::Notice, None) => MessageType::notice_markdown(body),
        };
        let mut content = RoomMessageEventContentWithoutRelation::new(msgtype);
        if let Some(input) = mentions {
            content = content.add_mentions(mentions_of(input));
        }
        match reply_to {
            Some(event_id) => {
                self.timeline
                    .send_reply(content, parse_event_id(event_id)?)
                    .await?;
            }
            None => {
                self.timeline
                    .send(content.with_relation(None).into())
                    .await?;
            }
        }
        Ok(())
    }

    /// Sends any message-like event content (stickers, edits, custom types) with a local echo.
    /// Relations (`m.relates_to`) in the content are kept as given.
    pub async fn send_event(&self, event_type: &str, content: serde_json::Value) -> Result<()> {
        use matrix_sdk::ruma::events::EventContentFromType;
        let raw =
            serde_json::value::to_raw_value(&content).map_err(|e| Error::Sdk(e.to_string()))?;
        let is_edit = content
            .pointer("/m.relates_to/rel_type")
            .and_then(serde_json::Value::as_str)
            == Some("m.replace");
        if is_edit {
            // Sent as given: typed contents drop the fallback text and stable blocks of edits
            self.timeline
                .room()
                .send_queue()
                .send_raw(Raw::from_json(raw), event_type.to_owned())
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?;
            return Ok(());
        }
        let typed = AnyMessageLikeEventContent::from_parts(event_type, &raw)
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let extra = match content {
            serde_json::Value::Object(map) => Some(map),
            _ => None,
        };
        self.timeline.send_with_extra_content(typed, extra).await?;
        Ok(())
    }

    /// Tries a failed message again.
    pub async fn retry_send(&self, item_key: &str) -> Result<()> {
        let id = parse_item_key(item_key)?;
        let item = self
            .timeline
            .items()
            .await
            .iter()
            .find_map(|item| item.as_event().filter(|e| e.identifier() == id).cloned())
            .ok_or_else(|| Error::InvalidId("no such message".into()))?;
        let handle = item
            .local_echo_send_handle()
            .ok_or_else(|| Error::InvalidId("already sent".into()))?;
        handle
            .unwedge()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(())
    }

    /// Shares a location (`geo:lat,long`).
    pub async fn send_location(
        &self,
        body: &str,
        geo_uri: &str,
        description: Option<&str>,
    ) -> Result<()> {
        use matrix_sdk::ruma::events::{
            location::LocationContent,
            room::message::{LocationMessageEventContent, MessageType},
        };
        use matrix_sdk::ruma::{events::location::AssetType, MilliSecondsSinceUnixEpoch};
        let mut location = LocationMessageEventContent::new(body.to_owned(), geo_uri.to_owned())
            .with_asset_type(AssetType::Self_)
            .with_ts(MilliSecondsSinceUnixEpoch::now());
        let mut details = LocationContent::new(geo_uri.to_owned());
        details.description = description.map(ToOwned::to_owned);
        location.location = Some(details);
        let content = RoomMessageEventContent::new(MessageType::Location(location));
        self.timeline.send(content.into()).await?;
        Ok(())
    }

    pub async fn send_text(&self, body: &str, reply_to: Option<&str>) -> Result<()> {
        match reply_to {
            Some(event_id) => {
                let content = RoomMessageEventContentWithoutRelation::text_markdown(body);
                self.timeline
                    .send_reply(content, parse_event_id(event_id)?)
                    .await?;
            }
            None => {
                self.timeline
                    .send(RoomMessageEventContent::text_markdown(body).into())
                    .await?;
            }
        }
        Ok(())
    }

    /// Sends a message with ready-made HTML (custom emoji). The HTML is sanitised by receivers.
    pub async fn send_html(&self, body: &str, html: &str, reply_to: Option<&str>) -> Result<()> {
        match reply_to {
            Some(event_id) => {
                let content = RoomMessageEventContentWithoutRelation::text_html(body, html);
                self.timeline
                    .send_reply(content, parse_event_id(event_id)?)
                    .await?;
            }
            None => {
                self.timeline
                    .send(RoomMessageEventContent::text_html(body, html).into())
                    .await?;
            }
        }
        Ok(())
    }

    /// Sends a sticker from a pack.
    pub async fn send_sticker(&self, body: &str, url: &str) -> Result<()> {
        use matrix_sdk::ruma::events::{room::ImageInfo, sticker::StickerEventContent};
        let content = StickerEventContent::new(body.to_owned(), ImageInfo::new(), url.into());
        self.timeline.send(content.into()).await?;
        Ok(())
    }

    /// Replaces the text of one of the user's own messages.
    pub async fn edit_text(
        &self,
        item_key: &str,
        body: &str,
        html: Option<&str>,
        mentions: Option<MentionsInput>,
    ) -> Result<()> {
        let mut content = match html.filter(|h| !h.trim().is_empty()) {
            Some(html) => RoomMessageEventContentWithoutRelation::text_html(body, html),
            None => RoomMessageEventContentWithoutRelation::text_markdown(body),
        };
        if let Some(mentions) = mentions {
            content = content.add_mentions(mentions_of(mentions));
        }
        self.timeline
            .edit(
                &parse_item_key(item_key)?,
                EditedContent::RoomMessage(content),
            )
            .await?;
        Ok(())
    }

    pub async fn edit_caption(
        &self,
        item_key: &str,
        caption: &str,
        html: Option<&str>,
        mentions: Option<MentionsInput>,
    ) -> Result<()> {
        use matrix_sdk::ruma::events::room::message::FormattedBody;
        let caption = Some(caption.trim()).filter(|c| !c.is_empty());
        let formatted_caption = caption.and_then(|c| match html.filter(|h| !h.trim().is_empty()) {
            Some(html) => Some(FormattedBody::html(html)),
            None => FormattedBody::markdown(c),
        });
        self.timeline
            .edit(
                &parse_item_key(item_key)?,
                EditedContent::MediaCaption {
                    caption: caption.map(str::to_owned),
                    formatted_caption,
                    mentions: mentions.map(mentions_of),
                },
            )
            .await?;
        Ok(())
    }

    /// Deletes (redacts) a message.
    pub async fn redact(&self, item_key: &str, reason: Option<&str>) -> Result<()> {
        self.timeline
            .redact(&parse_item_key(item_key)?, reason)
            .await?;
        Ok(())
    }

    /// Adds the reaction, or removes it if the user already reacted with it.
    pub async fn toggle_reaction(&self, item_key: &str, key: &str) -> Result<()> {
        self.timeline
            .toggle_reaction(&parse_item_key(item_key)?, key)
            .await?;
        Ok(())
    }

    /// Fetches the message a reply points at when its preview is `unavailable`.
    pub async fn load_reply_details(&self, event_id: &str) -> Result<()> {
        self.timeline
            .fetch_details_for_event(&parse_event_id(event_id)?)
            .await?;
        Ok(())
    }

    /// Uploads and sends a file; images, video and audio are shown inline by clients.
    pub async fn send_attachment(
        &self,
        mut attachment: Attachment,
        reply_to: Option<&str>,
    ) -> Result<()> {
        let mimetype: mime::Mime = attachment
            .mimetype
            .parse()
            .unwrap_or(mime::APPLICATION_OCTET_STREAM);
        let mut config = AttachmentConfig::default();
        if attachment.voice || mimetype.type_() == mime::AUDIO {
            let audio = matrix_sdk::attachment::BaseAudioInfo {
                duration: attachment.duration_ms.map(std::time::Duration::from_millis),
                size: UInt::new(attachment.bytes.len() as u64),
                waveform: attachment
                    .waveform
                    .as_ref()
                    .map(|w| w.iter().map(|v| f32::from(*v) / 1024.0).collect()),
            };
            config.info = Some(if attachment.voice {
                AttachmentInfo::Voice(audio)
            } else {
                AttachmentInfo::Audio(audio)
            });
        }
        if attachment.spoiler {
            let mut extra = serde_json::Map::new();
            extra.insert("m.spoiler".into(), serde_json::json!(true));
            extra.insert(
                "page.codeberg.everypizza.msc4193.spoiler".into(),
                serde_json::json!(true),
            );
            if let Some(reason) = attachment
                .spoiler_reason
                .clone()
                .filter(|r| !r.trim().is_empty())
            {
                extra.insert("m.spoiler.reason".into(), serde_json::json!(reason));
                extra.insert(
                    "page.codeberg.everypizza.msc4193.spoiler.reason".into(),
                    serde_json::json!(reason),
                );
            }
            config.extra_content = Some(extra);
        }
        if let Some((data, thumb_type, width, height)) = attachment.thumbnail.take() {
            let size = UInt::new(data.len() as u64).unwrap_or_default();
            config.thumbnail = Some(matrix_sdk::attachment::Thumbnail {
                data,
                content_type: thumb_type.parse().unwrap_or(mime::IMAGE_JPEG),
                width: UInt::from(width),
                height: UInt::from(height),
                size,
            });
        }
        if mimetype.type_() == mime::VIDEO {
            config.info = Some(AttachmentInfo::Video(
                matrix_sdk::attachment::BaseVideoInfo {
                    duration: attachment
                        .duration_ms_video
                        .map(std::time::Duration::from_millis),
                    width: attachment.width.map(UInt::from),
                    height: attachment.height.map(UInt::from),
                    size: UInt::new(attachment.bytes.len() as u64),
                    ..Default::default()
                },
            ));
        }
        if let Some(input) = attachment.mentions.take() {
            config.mentions = Some(mentions_of(input));
        }
        if mimetype.type_() == mime::IMAGE {
            config.info = Some(AttachmentInfo::Image(BaseImageInfo {
                width: attachment.width.map(UInt::from),
                height: attachment.height.map(UInt::from),
                size: UInt::new(attachment.bytes.len() as u64),
                is_animated: Some(attachment.is_animated),
                ..Default::default()
            }));
        }
        if let Some(caption) = attachment.caption.filter(|c| !c.trim().is_empty()) {
            use matrix_sdk::ruma::events::room::message::TextMessageEventContent;
            config.caption = Some(
                match attachment.caption_html.filter(|h| !h.trim().is_empty()) {
                    Some(html) => TextMessageEventContent::html(caption, html),
                    None => TextMessageEventContent::markdown(caption),
                },
            );
        }
        config.in_reply_to = reply_to.map(parse_event_id).transpose()?;
        let source = AttachmentSource::Data {
            bytes: attachment.bytes,
            filename: attachment.filename,
        };
        self.timeline
            .send_attachment(source, mimetype, config)
            .await?;
        Ok(())
    }

    /// Uploads a file for this room (encrypted when the room is), reporting progress where
    /// the platform can; returns its source (`{ url }` or `{ file }`) for `send_uploaded`.
    pub async fn upload_file(
        &self,
        data: Vec<u8>,
        mimetype: &str,
        mut on_progress: impl FnMut(UploadProgress),
    ) -> Result<serde_json::Value> {
        let room = self.timeline.room();
        let client = room.client();
        let total = data.len() as u64;
        let encrypted = room.latest_encryption_state().await?.is_encrypted();
        on_progress(UploadProgress { current: 0, total });
        let source = if encrypted {
            let mut reader = std::io::Cursor::new(data);
            let upload = client.upload_encrypted_file(&mut reader);
            let progress = upload.subscribe_to_send_progress();
            let file = with_progress(upload.into_future(), progress, &mut on_progress)
                .await
                .map_err(|e| Error::Sdk(e.to_string()))?;
            serde_json::json!({ "file": file })
        } else {
            let mime: mime::Mime = mimetype.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);
            let upload = client.media().upload(&mime, data, None);
            let progress = upload.subscribe_to_send_progress();
            let response = with_progress(upload.into_future(), progress, &mut on_progress).await?;
            serde_json::json!({ "url": response.content_uri })
        };
        on_progress(UploadProgress {
            current: total,
            total,
        });
        Ok(source)
    }

    /// Sends a file uploaded with `upload_file`, optionally as a reply (threads are kept).
    pub async fn send_uploaded(
        &self,
        attachment: UploadedAttachment,
        reply_to: Option<&str>,
    ) -> Result<()> {
        use matrix_sdk::{
            room::reply::{EnforceThread, Reply},
            ruma::events::room::message::{AddMentions, ReplyWithinThread},
        };
        let json = attachment.content();
        let typed: RoomMessageEventContentWithoutRelation =
            serde_json::from_value(json.clone()).map_err(|e| Error::Sdk(e.to_string()))?;
        let extra = match json {
            serde_json::Value::Object(map) => Some(map),
            _ => None,
        };
        let content = match reply_to {
            Some(event_id) => {
                let reply = Reply {
                    event_id: parse_event_id(event_id)?,
                    enforce_thread: if self.thread_root.is_some() {
                        EnforceThread::Threaded(ReplyWithinThread::Yes)
                    } else {
                        EnforceThread::MaybeThreaded
                    },
                    add_mentions: AddMentions::Yes,
                };
                self.timeline
                    .room()
                    .make_reply_event(typed, reply)
                    .await
                    .map_err(|e| Error::Sdk(e.to_string()))?
            }
            None => typed.with_relation(None),
        };
        self.timeline
            .send_with_extra_content(content.into(), extra)
            .await?;
        Ok(())
    }

    /// Starts a poll. `max_selections` 1 is a single-choice poll; undisclosed polls show
    /// results only once ended.
    pub async fn send_poll(
        &self,
        question: &str,
        answers: &[String],
        max_selections: u64,
        undisclosed: bool,
    ) -> Result<()> {
        use matrix_sdk::ruma::events::poll::{
            start::PollKind,
            unstable_start::{
                NewUnstablePollStartEventContent, UnstablePollAnswer, UnstablePollAnswers,
                UnstablePollStartContentBlock, UnstablePollStartEventContent,
            },
        };
        let answers: Vec<UnstablePollAnswer> = answers
            .iter()
            .filter(|a| !a.trim().is_empty())
            .enumerate()
            .map(|(i, text)| UnstablePollAnswer::new(format!("a{i}"), text.trim()))
            .collect();
        let answers =
            UnstablePollAnswers::try_from(answers).map_err(|e| Error::InvalidId(e.to_string()))?;
        let mut block = UnstablePollStartContentBlock::new(question.trim(), answers);
        block.kind = if undisclosed {
            PollKind::Undisclosed
        } else {
            PollKind::Disclosed
        };
        block.max_selections = UInt::new(max_selections.max(1)).unwrap_or(UInt::MIN);
        let content =
            UnstablePollStartEventContent::New(NewUnstablePollStartEventContent::new(block));
        self.timeline.send(content.into()).await?;
        Ok(())
    }

    /// Votes in a poll (replacing earlier votes); an empty list withdraws the vote.
    pub async fn vote(&self, poll_event_id: &str, answer_ids: &[String]) -> Result<()> {
        use matrix_sdk::ruma::events::poll::unstable_response::UnstablePollResponseEventContent;
        let content = UnstablePollResponseEventContent::new(
            answer_ids.to_vec(),
            parse_event_id(poll_event_id)?,
        );
        self.timeline.send(content.into()).await?;
        Ok(())
    }

    pub async fn end_poll(&self, poll_event_id: &str) -> Result<()> {
        use matrix_sdk::ruma::events::poll::unstable_end::UnstablePollEndEventContent;
        let content =
            UnstablePollEndEventContent::new("The poll has ended", parse_event_id(poll_event_id)?);
        self.timeline.send(content.into()).await?;
        Ok(())
    }

    pub async fn pin(&self, event_id: &str) -> Result<()> {
        self.timeline
            .room()
            .pin_event(&parse_event_id(event_id)?)
            .await?;
        Ok(())
    }

    pub async fn unpin(&self, event_id: &str) -> Result<()> {
        self.timeline
            .room()
            .unpin_event(&parse_event_id(event_id)?)
            .await?;
        Ok(())
    }

    /// Marks the room read up to its latest message (receipt and fully-read marker); in a
    /// thread, sends a threaded and an unthreaded receipt on its latest message.
    pub async fn mark_as_read(&self, private: bool) -> Result<()> {
        let room = self.timeline.room();
        let Some(root) = &self.thread_root else {
            return mark_room_read(room, private).await;
        };
        use matrix_sdk::ruma::events::receipt::{ReceiptThread, ReceiptType as StoredReceiptType};
        let latest = self.timeline.items().await.iter().rev().find_map(|item| {
            item.as_event()
                .and_then(|event| event.original_json())
                .and_then(|raw| receiptable(raw, true))
        });
        let Some(event_id) = latest else {
            return Ok(());
        };
        let (receipt, stored) = if private {
            (ReceiptType::ReadPrivate, StoredReceiptType::ReadPrivate)
        } else {
            (ReceiptType::Read, StoredReceiptType::Read)
        };
        for thread in [
            ReceiptThread::Thread(root.clone()),
            ReceiptThread::Unthreaded,
        ] {
            let current = room
                .load_user_receipt(stored.clone(), &thread, room.own_user_id())
                .await?
                .map(|(id, _)| id);
            if current.as_ref() != Some(&event_id) {
                room.send_single_receipt(receipt.clone(), thread, event_id.clone())
                    .await?;
            }
        }
        Ok(())
    }

    /// Tells the room the user is (or stopped) typing.
    pub async fn set_typing(&self, typing: bool) -> Result<()> {
        self.timeline.room().typing_notice(typing).await?;
        Ok(())
    }

    /// Reports who else is typing, on every change.
    pub async fn watch_typing(&self, mut on_change: impl FnMut(Vec<TypingUser>)) {
        let room = self.timeline.room();
        let (_guard, mut receiver) = room.subscribe_to_typing_notifications();
        loop {
            match receiver.recv().await {
                Ok(user_ids) => {
                    let mut users = Vec::with_capacity(user_ids.len());
                    for user_id in user_ids {
                        if Some(&user_id) == self.own_user.as_ref() {
                            continue;
                        }
                        let display_name = room
                            .get_member_no_sync(&user_id)
                            .await
                            .ok()
                            .flatten()
                            .and_then(|m| m.display_name().map(ToOwned::to_owned));
                        users.push(TypingUser {
                            user_id: user_id.to_string(),
                            display_name,
                        });
                    }
                    on_change(users);
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    }
}

pub(crate) fn mentions_of(input: MentionsInput) -> matrix_sdk::ruma::events::Mentions {
    let mut mentions = matrix_sdk::ruma::events::Mentions::with_user_ids(
        input
            .user_ids
            .iter()
            .filter_map(|id| OwnedUserId::try_from(id.as_str()).ok()),
    );
    mentions.room = input.room;
    mentions
}
