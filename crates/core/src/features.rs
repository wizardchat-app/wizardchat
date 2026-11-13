use std::collections::{BTreeMap, VecDeque};

use futures_util::StreamExt;
use matrix_sdk::{
    event_handler::RawEvent,
    ruma::{
        api::client::{
            filter::RoomEventFilter,
            search::search_events::v3::{Categories, Criteria, Request as SearchRequest},
            state::get_state_events,
        },
        events::{
            poll::{
                start::OriginalSyncPollStartEvent,
                unstable_start::OriginalSyncUnstablePollStartEvent,
            },
            room::{
                encrypted::OriginalSyncRoomEncryptedEvent, message::OriginalSyncRoomMessageEvent,
                redaction::OriginalSyncRoomRedactionEvent,
            },
            sticker::OriginalSyncStickerEvent,
            AnySyncTimelineEvent,
        },
        push::{Action, HighlightTweakValue, RuleKind, Tweak},
        serde::Raw,
        MilliSecondsSinceUnixEpoch, OwnedEventId, OwnedUserId, UserId,
    },
    Room,
};
use matrix_sdk_crypto::store::types::RoomKeyInfo;
use serde::Serialize;
use serde_json::Value;

use crate::{rooms::parse_room_id, Error, Result, WizardClient};

/// A message found by search
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub room_id: String,
    pub event_id: String,
    pub sender: String,
    pub body: String,
    pub timestamp: u64,
}

/// An emoji/sticker pack (MSC2545: the user's own, or one shared in a room)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EmojiPack {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    /// `user` for the account's own pack, else the room it lives in
    pub room_id: Option<String>,
    pub images: Vec<PackImage>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PackImage {
    pub shortcode: String,
    pub url: String,
    pub body: Option<String>,
    pub emoticon: bool,
    pub sticker: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    Message,
    Image,
    Video,
    Audio,
    Voice,
    File,
    Location,
    Sticker,
    Poll,
    Invite,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RedactedEvent {
    pub room_id: String,
    pub event_id: String,
}

/// Something that should notify the user, decided by their push rules
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub room_id: String,
    pub room_name: Option<String>,
    pub room_avatar_url: Option<String>,
    pub event_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    /// Empty for messages with a spoiler
    pub body: String,
    /// The message hides a spoiler: show a placeholder instead of its text
    pub spoiler: bool,
    /// Its keys haven't arrived yet: show a placeholder
    pub encrypted: bool,
    /// Mentions and keywords: show more prominently
    pub highlight: bool,
    pub sound: bool,
    pub is_direct: bool,
    pub ts: u64,
    pub kind: NotificationKind,
}

const ROOM_PACK_TYPES: [&str; 2] = ["im.ponies.room_emotes", "m.room.image_pack"];
pub(crate) const MAX_SPACE_DEPTH: usize = 5;
const USER_PACK: &str = "im.ponies.user_emotes";
const ENABLED_ROOM_PACKS: &str = "im.ponies.emote_rooms";

fn parse_pack(id: String, room_id: Option<String>, content: &Value) -> Option<EmojiPack> {
    let pack = content.get("pack");
    let pack_usage = pack.and_then(|p| p.get("usage")).and_then(Value::as_array);
    let images: Vec<PackImage> = content
        .get("images")?
        .as_object()?
        .iter()
        .filter_map(|(shortcode, image)| {
            let url = image.get("url")?.as_str()?.to_owned();
            let usage = image.get("usage").and_then(Value::as_array).or(pack_usage);
            let has = |kind: &str| usage.is_none_or(|u| u.iter().any(|v| v.as_str() == Some(kind)));
            Some(PackImage {
                shortcode: shortcode.clone(),
                url,
                body: image
                    .get("body")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                emoticon: has("emoticon"),
                sticker: has("sticker"),
            })
        })
        .collect();
    (!images.is_empty()).then(|| EmojiPack {
        name: pack
            .and_then(|p| p.get("display_name"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| id.clone()),
        avatar_url: pack
            .and_then(|p| p.get("avatar_url"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        id,
        room_id,
        images,
    })
}

/// A room's current state from the server, as JSON. Sliding sync only keeps the state the
/// room list asks for, so packs and space parents aren't in the local store.
pub(crate) async fn room_state(client: &WizardClient, room_id: &str) -> Vec<Value> {
    let Ok(room_id) = parse_room_id(room_id) else {
        return Vec::new();
    };
    let request = get_state_events::v3::Request::new(room_id.to_owned());
    match client.sdk().send(request).await {
        Ok(response) => response
            .room_state
            .iter()
            .filter_map(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .collect(),
        // Rooms and spaces you aren't in can't be read
        Err(_) => Vec::new(),
    }
}

fn of_type<'a>(state: &'a [Value], event_type: &'a str) -> impl Iterator<Item = &'a Value> {
    state
        .iter()
        .filter(move |e| e.get("type").and_then(Value::as_str) == Some(event_type))
}

fn room_packs(
    room_id: &str,
    state: &[Value],
    only: Option<&BTreeMap<String, Value>>,
) -> Vec<EmojiPack> {
    let mut packs = Vec::new();
    for event_type in ROOM_PACK_TYPES {
        for event in of_type(state, event_type) {
            let key = event
                .get("state_key")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            if only.is_some_and(|keys| !keys.contains_key(&key)) {
                continue;
            }
            let id = format!("{room_id}/{key}");
            if packs.iter().any(|p: &EmojiPack| p.id == id) {
                continue;
            }
            if let Some(content) = event.get("content") {
                packs.extend(parse_pack(id, Some(room_id.to_owned()), content));
            }
        }
    }
    packs
}

pub(crate) fn canonical_parents(state: &[Value]) -> Vec<String> {
    of_type(state, "m.space.parent")
        .filter(|event| {
            event
                .get("content")
                .and_then(|c| c.get("canonical"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|event| event.get("state_key")?.as_str().map(ToOwned::to_owned))
        .collect()
}

impl WizardClient {
    /// Searches messages on the server. Encrypted rooms can't be searched this way.
    pub async fn search_messages(
        &self,
        term: &str,
        room_id: Option<&str>,
    ) -> Result<Vec<SearchHit>> {
        let mut filter = RoomEventFilter::default();
        if let Some(room_id) = room_id {
            filter.rooms = Some(vec![parse_room_id(room_id)?.to_owned()]);
        }
        let mut criteria = Criteria::new(term.to_owned());
        criteria.filter = filter;
        let mut categories = Categories::new();
        categories.room_events = Some(criteria);
        let response = self.sdk().send(SearchRequest::new(categories)).await?;
        let hits = response
            .search_categories
            .room_events
            .results
            .into_iter()
            .filter_map(|result| {
                let event: Value = result.result?.deserialize_as().ok()?;
                Some(SearchHit {
                    room_id: event.get("room_id")?.as_str()?.to_owned(),
                    event_id: event.get("event_id")?.as_str()?.to_owned(),
                    sender: event.get("sender")?.as_str()?.to_owned(),
                    body: event.get("content")?.get("body")?.as_str()?.to_owned(),
                    timestamp: event.get("origin_server_ts")?.as_u64()?,
                })
            })
            .collect();
        Ok(hits)
    }

    pub async fn emoji_packs(&self, room_id: Option<&str>) -> Result<Vec<EmojiPack>> {
        let mut packs = Vec::new();
        if let Some(content) = self.account_data(USER_PACK).await? {
            packs.extend(parse_pack("user".into(), None, &content));
        }
        if let Some(room_id) = room_id {
            let state = room_state(self, room_id).await;
            packs.extend(room_packs(room_id, &state, None));
            let mut visited = vec![room_id.to_owned()];
            let mut level = canonical_parents(&state);
            for _ in 0..MAX_SPACE_DEPTH {
                let mut next = Vec::new();
                for parent in level {
                    if visited.contains(&parent) {
                        continue;
                    }
                    visited.push(parent.clone());
                    let state = room_state(self, &parent).await;
                    packs.extend(room_packs(&parent, &state, None));
                    next.extend(canonical_parents(&state));
                }
                level = next;
            }
        }
        if let Some(enabled) = self.account_data(ENABLED_ROOM_PACKS).await? {
            let rooms = enabled
                .get("rooms")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            for (id, keys) in rooms {
                if Some(id.as_str()) == room_id {
                    continue;
                }
                let keys: BTreeMap<String, Value> = keys
                    .as_object()
                    .map(|o| o.clone().into_iter().collect())
                    .unwrap_or_default();
                let state = room_state(self, &id).await;
                packs.extend(room_packs(&id, &state, Some(&keys)));
            }
        }
        // A favourited pack can also be one of this room's or its spaces'
        let mut seen = std::collections::HashSet::new();
        packs.retain(|pack| seen.insert(pack.id.clone()));
        Ok(packs)
    }

    pub async fn watch_redactions(&self, mut on_redaction: impl FnMut(RedactedEvent)) {
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<RedactedEvent>();
        let handle = self.sdk().add_event_handler(
            move |_: OriginalSyncRoomRedactionEvent, room: Room, raw: RawEvent| {
                let sender = sender.clone();
                async move {
                    let event: Value = serde_json::from_str(raw.0.get()).unwrap_or_default();
                    let redacts = event
                        .pointer("/content/redacts")
                        .or_else(|| event.get("redacts"))
                        .and_then(Value::as_str);
                    if let Some(event_id) = redacts {
                        let _ = sender.unbounded_send(RedactedEvent {
                            room_id: room.room_id().to_string(),
                            event_id: event_id.to_owned(),
                        });
                    }
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        while let Some(redaction) = receiver.next().await {
            on_redaction(redaction);
        }
    }

    /// Hands every new message that should notify to `on_notification`: those the push rules
    /// say notify, and replies to the user's own messages in rooms that aren't muted. Encrypted
    /// messages whose keys arrive later notify once they can be decrypted.
    pub async fn watch_notifications(&self, mut on_notification: impl FnMut(Notification)) {
        let (sender, receiver) = futures_channel::mpsc::unbounded::<Incoming>();
        let messages = sender.clone();
        let message_handle = self.sdk().add_event_handler(
            move |_: OriginalSyncRoomMessageEvent, room: Room, raw: RawEvent| {
                let messages = messages.clone();
                async move {
                    let _ = messages.unbounded_send(Incoming::Message(
                        room,
                        Raw::from_json(raw.0),
                        None,
                    ));
                }
            },
        );
        let stickers = sender.clone();
        let sticker_handle = self.sdk().add_event_handler(
            move |_: OriginalSyncStickerEvent, room: Room, raw: RawEvent| {
                let stickers = stickers.clone();
                async move {
                    let _ = stickers.unbounded_send(Incoming::Message(
                        room,
                        Raw::from_json(raw.0),
                        None,
                    ));
                }
            },
        );
        let polls = sender.clone();
        let poll_handle = self.sdk().add_event_handler(
            move |_: OriginalSyncPollStartEvent, room: Room, raw: RawEvent| {
                let polls = polls.clone();
                async move {
                    let _ =
                        polls.unbounded_send(Incoming::Message(room, Raw::from_json(raw.0), None));
                }
            },
        );
        let unstable_polls = sender.clone();
        let unstable_poll_handle = self.sdk().add_event_handler(
            move |_: OriginalSyncUnstablePollStartEvent, room: Room, raw: RawEvent| {
                let unstable_polls = unstable_polls.clone();
                async move {
                    let _ = unstable_polls.unbounded_send(Incoming::Message(
                        room,
                        Raw::from_json(raw.0),
                        None,
                    ));
                }
            },
        );
        let encrypted_handle = self.sdk().add_event_handler(
            move |_: OriginalSyncRoomEncryptedEvent, room: Room, raw: RawEvent| {
                let sender = sender.clone();
                async move {
                    let _ =
                        sender.unbounded_send(Incoming::Undecrypted(room, Raw::from_json(raw.0)));
                }
            },
        );
        let _guards = (
            self.sdk().event_handler_drop_guard(message_handle),
            self.sdk().event_handler_drop_guard(encrypted_handle),
            self.sdk().event_handler_drop_guard(sticker_handle),
            self.sdk().event_handler_drop_guard(poll_handle),
            self.sdk().event_handler_drop_guard(unstable_poll_handle),
        );
        let keys = match self.sdk().encryption().room_keys_received_stream().await {
            Some(stream) => Box::pin(stream)
                .filter_map(|keys| futures_util::future::ready(keys.ok()))
                .map(Incoming::Keys)
                .left_stream(),
            None => futures_util::stream::pending().right_stream(),
        };
        let mut incoming = futures_util::stream::select(receiver, keys);
        let Some(own_user) = self.sdk().user_id().map(ToOwned::to_owned) else {
            return;
        };
        // Rooms entering the sync window bring older messages along; only newer ones notify
        let since =
            u64::from(MilliSecondsSinceUnixEpoch::now().get()).saturating_sub(CLOCK_SKEW_MS);
        let mut waiting: Vec<(String, Room, Raw<AnySyncTimelineEvent>)> = Vec::new();
        let mut notified: VecDeque<String> = VecDeque::new();
        while let Some(next) = incoming.next().await {
            let events = match next {
                Incoming::Message(room, raw, actions) => vec![(room, raw, actions)],
                Incoming::Undecrypted(room, raw) => {
                    let event: Value = raw.deserialize_as_unchecked().unwrap_or_default();
                    let session = event.pointer("/content/session_id").and_then(Value::as_str);
                    if let Some(session) = session.filter(|_| sent_at(&event) >= since) {
                        if waiting.len() >= MAX_WAITING {
                            waiting.remove(0);
                        }
                        waiting.push((session.to_owned(), room, raw));
                    }
                    continue;
                }
                Incoming::Keys(keys) => {
                    let mut decrypted = Vec::new();
                    for key in keys {
                        let mut index = 0;
                        while index < waiting.len() {
                            let (session, room, _) = &waiting[index];
                            if *session != key.session_id || room.room_id() != key.room_id {
                                index += 1;
                                continue;
                            }
                            let (_, room, raw) = waiting.remove(index);
                            let context = room.push_context().await.ok().flatten();
                            let encrypted =
                                raw.cast_ref_unchecked::<OriginalSyncRoomEncryptedEvent>();
                            if let Ok(event) = room.decrypt_event(encrypted, context.as_ref()).await
                            {
                                let actions = event.push_actions().map(<[Action]>::to_vec);
                                decrypted.push((room, event.into_raw(), actions));
                            }
                        }
                    }
                    decrypted
                }
            };
            for (room, raw, actions) in events {
                let Some(notification) =
                    notification_for(&room, &raw, actions, &own_user, since).await
                else {
                    continue;
                };
                if notified.contains(&notification.event_id) {
                    continue;
                }
                if notified.len() >= MAX_NOTIFIED {
                    notified.pop_front();
                }
                notified.push_back(notification.event_id.clone());
                on_notification(notification);
            }
        }
    }
}

const CLOCK_SKEW_MS: u64 = 60_000;
const MAX_WAITING: usize = 200;
const MAX_NOTIFIED: usize = 500;

enum Incoming {
    Message(Room, Raw<AnySyncTimelineEvent>, Option<Vec<Action>>),
    Undecrypted(Room, Raw<AnySyncTimelineEvent>),
    Keys(Vec<RoomKeyInfo>),
}

fn sent_at(event: &Value) -> u64 {
    event
        .get("origin_server_ts")
        .and_then(Value::as_u64)
        .unwrap_or_default()
}

/// The event a message replies to, unless the reply is only a thread fallback
fn reply_target(content: &Value) -> Option<OwnedEventId> {
    let relation = content.get("m.relates_to")?;
    if relation.get("is_falling_back").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let id = relation.pointer("/m.in_reply_to/event_id")?.as_str()?;
    OwnedEventId::try_from(id).ok()
}

async fn is_reply_to(room: &Room, content: &Value, user: &UserId) -> bool {
    let Some(target) = reply_target(content) else {
        return false;
    };
    let Ok(event) = room.load_or_fetch_event(&target, None).await else {
        return false;
    };
    event
        .raw()
        .get_field::<OwnedUserId>("sender")
        .ok()
        .flatten()
        .is_some_and(|sender| sender == user)
}

/// Muted by the room's own override rule (what "Mute" sets)
async fn is_muted(room: &Room) -> bool {
    let Ok(rules) = room.client().account().push_rules().await else {
        return false;
    };
    rules
        .get(RuleKind::Override, room.room_id())
        .is_some_and(|rule| rule.enabled() && !rule.actions().iter().any(Action::should_notify))
}

pub(crate) async fn notification_for(
    room: &Room,
    raw: &Raw<AnySyncTimelineEvent>,
    actions: Option<Vec<Action>>,
    own_user: &UserId,
    since: u64,
) -> Option<Notification> {
    let event: Value = raw.deserialize_as_unchecked().ok()?;
    let kind = match event.get("type").and_then(Value::as_str)? {
        "m.room.message" => message_kind(event.get("content")?),
        "m.sticker" => NotificationKind::Sticker,
        "m.poll.start" | "org.matrix.msc3381.poll.start" => NotificationKind::Poll,
        _ => return None,
    };
    let sender = event.get("sender")?.as_str()?;
    if sender == own_user.as_str() || sent_at(&event) < since {
        return None;
    }
    let content = event.get("content")?;
    let actions = match actions {
        Some(actions) => actions,
        None => room.event_push_actions(raw).await.ok().flatten()?,
    };
    let tweak = |f: &dyn Fn(&Tweak) -> bool| {
        actions
            .iter()
            .any(|a| matches!(a, Action::SetTweak(t) if f(t)))
    };
    let (highlight, sound) = if actions.iter().any(Action::should_notify) {
        (
            tweak(&|t| matches!(t, Tweak::Highlight(HighlightTweakValue::Yes))),
            tweak(&|t| matches!(t, Tweak::Sound(_))),
        )
    } else if kind == NotificationKind::Sticker
        && as_message_actions(room, &event)
            .await
            .is_some_and(|actions| actions.iter().any(Action::should_notify))
    {
        (false, true)
    } else if is_reply_to(room, content, own_user).await && !is_muted(room).await {
        (true, true)
    } else {
        return None;
    };
    let spoiler = kind == NotificationKind::Message
        && content
            .get("formatted_body")
            .and_then(Value::as_str)
            .is_some_and(|html| html.contains("data-mx-spoiler"));
    let sender_id = OwnedUserId::try_from(sender).ok()?;
    let sender_name = room
        .get_member_no_sync(&sender_id)
        .await
        .ok()
        .flatten()
        .and_then(|m| m.display_name().map(ToOwned::to_owned));
    Some(Notification {
        room_id: room.room_id().to_string(),
        room_name: room.cached_display_name().map(|n| n.to_string()),
        room_avatar_url: room.avatar_url().map(|url| url.to_string()),
        event_id: event.get("event_id")?.as_str()?.to_owned(),
        sender: sender.to_owned(),
        sender_name,
        body: match kind {
            _ if spoiler => String::new(),
            NotificationKind::Message => content
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            NotificationKind::Poll => poll_question(content).unwrap_or_default(),
            _ => String::new(),
        },
        spoiler,
        encrypted: false,
        highlight,
        sound,
        is_direct: room.direct_targets_length() > 0,
        ts: sent_at(&event),
        kind,
    })
}

fn message_kind(content: &Value) -> NotificationKind {
    match content.get("msgtype").and_then(Value::as_str) {
        Some("m.image") => NotificationKind::Image,
        Some("m.video") => NotificationKind::Video,
        Some("m.audio")
            if content.get("org.matrix.msc3245.voice").is_some()
                || content.get("m.voice").is_some() =>
        {
            NotificationKind::Voice
        }
        Some("m.audio") => NotificationKind::Audio,
        Some("m.file") => NotificationKind::File,
        Some("m.location") => NotificationKind::Location,
        _ => NotificationKind::Message,
    }
}

async fn as_message_actions(room: &Room, event: &Value) -> Option<Vec<Action>> {
    let mut message = event.clone();
    message["type"] = "m.room.message".into();
    message["content"]["msgtype"] = "m.text".into();
    let raw: Raw<AnySyncTimelineEvent> =
        Raw::from_json(serde_json::value::to_raw_value(&message).ok()?);
    room.event_push_actions(&raw).await.ok().flatten()
}

fn poll_question(content: &Value) -> Option<String> {
    let question = content
        .pointer("/m.poll/question/m.text/0/body")
        .or_else(|| {
            content.pointer("/org.matrix.msc3381.poll.start/question/org.matrix.msc1767.text")
        })
        .or_else(|| content.pointer("/org.matrix.msc3381.poll.start/question/body"))
        .or_else(|| content.get("org.matrix.msc1767.text"))?;
    question.as_str().map(ToOwned::to_owned)
}

impl From<serde_json::Error> for Error {
    fn from(error: serde_json::Error) -> Self {
        Error::Sdk(error.to_string())
    }
}
