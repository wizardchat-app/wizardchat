use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use futures_util::StreamExt;
use matrix_sdk::ruma::{events::StateEventType, OwnedMxcUri};
use matrix_sdk::RoomState;
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::{
    features::{canonical_parents, MAX_SPACE_DEPTH},
    rooms::parse_room_id,
    soundboard::{SoundboardSound, MAX_SOUND_BYTES},
    Error, Result, WizardClient,
};

const PACK_EVENT: &str = "moe.crafty.room_soundboard";
const SPACE_PARENT: &str = "m.space.parent";
const STORE_PREFIX: &str = "org.wizardchat.sound_pack_state:";
const FRESH_MS: u64 = 5 * 60 * 1000;
const ROOMS_EVENT: &str = "moe.crafty.soundboard_rooms";
const USER_EVENT: &str = "moe.crafty.soundboard";
const EMOJI_KEY: &str = "org.wizardchat.emoji";
const USER_ID: &str = "user";
const BUILT_IN_ID: &str = "builtin";
const FREQUENT_ID: &str = "frequent";
const FREQUENT_EVENT: &str = "org.wizardchat.frequent_sounds";
const FREQUENT_SHOWN: usize = 4;
const FREQUENT_KEPT: usize = 50;
const MAX_DURATION_MS: u32 = 15_000;
const MAX_SHORTCODE_BYTES: usize = 100;
const MAX_EMOJI_BYTES: usize = 32;
const MIMETYPES: [&str; 7] = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
];

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum SoundPackSource {
    Frequent,
    BuiltIn,
    Mine,
    Everywhere,
    Room,
    Space,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SoundPack {
    pub id: String,
    pub source: SoundPackSource,
    pub room_id: Option<String>,
    pub state_key: Option<String>,
    pub name: Option<String>,
    pub room_name: Option<String>,
    pub avatar_url: Option<String>,
    pub attribution: Option<String>,
    pub everywhere: bool,
    pub can_edit: bool,
    pub sounds: Vec<SoundboardSound>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomSoundPacks {
    pub can_edit: bool,
    pub packs: Vec<SoundPack>,
}

fn invalid(reason: &str) -> Error {
    Error::InvalidSound(reason.to_owned())
}

fn is_mxc(url: &str) -> bool {
    url.starts_with("mxc://") && OwnedMxcUri::from(url).is_valid()
}

fn str_at(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(ToOwned::to_owned)
}

fn parse_sounds(content: &Value) -> Vec<SoundboardSound> {
    let Some(sounds) = content.get("sounds").and_then(Value::as_object) else {
        return Vec::new();
    };
    sounds
        .iter()
        .filter_map(|(shortcode, sound)| {
            let url = sound.get("url")?.as_str().filter(|url| is_mxc(url))?;
            let number = |pointer: &str| {
                sound
                    .pointer(pointer)
                    .and_then(Value::as_u64)
                    .and_then(|n| u32::try_from(n).ok())
            };
            Some(SoundboardSound {
                shortcode: shortcode.clone(),
                url: url.to_owned(),
                body: str_at(sound, "/body"),
                emoji: sound
                    .get(EMOJI_KEY)
                    .and_then(Value::as_str)
                    .filter(|e| !e.is_empty() && e.len() <= MAX_EMOJI_BYTES)
                    .map(ToOwned::to_owned),
                mimetype: str_at(sound, "/info/mimetype"),
                size: number("/info/size"),
                duration_ms: number("/info/duration"),
            })
        })
        .collect()
}

fn listed_keys(listed: &Value, room_id: &str) -> Option<Map<String, Value>> {
    listed
        .pointer(&format!(
            "/rooms/{}",
            room_id.replace('~', "~0").replace('/', "~1")
        ))
        .and_then(Value::as_object)
        .cloned()
}

fn valid_shortcode(shortcode: &str) -> bool {
    !shortcode.is_empty()
        && shortcode.len() <= MAX_SHORTCODE_BYTES
        && shortcode
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn set_or_remove(object: &mut Map<String, Value>, key: &str, value: Option<String>) {
    match value {
        Some(value) => object.insert(key.to_owned(), json!(value)),
        None => object.remove(key),
    };
}

fn shortcode_from(text: &str) -> String {
    let mut out = String::new();
    for c in text.trim().chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c.to_ascii_lowercase());
        } else if c.is_whitespace() && !out.is_empty() && !out.ends_with('_') {
            out.push('_');
        }
    }
    let out = out.trim_end_matches('_');
    out[..out.len().min(MAX_SHORTCODE_BYTES - 4)].to_owned()
}

fn unique(wanted: &str, fallback: &str, taken: impl Fn(&str) -> bool) -> String {
    let wanted = if wanted.is_empty() { fallback } else { wanted };
    if !taken(wanted) {
        return wanted.to_owned();
    }
    (2..)
        .map(|n| format!("{wanted}_{n}"))
        .find(|candidate| !taken(candidate))
        .expect("unbounded")
}

struct PackPlace<'a> {
    room_id: &'a str,
    room_name: Option<String>,
    source: SoundPackSource,
    can_edit: bool,
    listed: &'a Value,
}

fn packs_in(
    place: &PackPlace,
    state: &[Value],
    only: Option<&Map<String, Value>>,
) -> Vec<SoundPack> {
    let everywhere = listed_keys(place.listed, place.room_id).unwrap_or_default();
    state
        .iter()
        .filter(|event| event.get("type").and_then(Value::as_str) == Some(PACK_EVENT))
        .filter_map(|event| {
            let key = event.get("state_key")?.as_str()?.to_owned();
            if only.is_some_and(|keys| !keys.contains_key(&key)) {
                return None;
            }
            let content = event.get("content")?;
            content.as_object().filter(|c| !c.is_empty())?;
            let mine = place.source == SoundPackSource::Mine;
            Some(SoundPack {
                id: format!("{}/{key}", place.room_id),
                source: place.source,
                room_id: Some(place.room_id.to_owned()),
                name: (!mine).then(|| {
                    str_at(content, "/pack/display_name")
                        .or_else(|| place.room_name.clone())
                        .unwrap_or_else(|| key.clone())
                }),
                room_name: place.room_name.clone(),
                avatar_url: str_at(content, "/pack/avatar_url").filter(|url| is_mxc(url)),
                attribution: str_at(content, "/pack/attribution"),
                everywhere: everywhere.contains_key(&key),
                can_edit: place.can_edit,
                sounds: parse_sounds(content),
                state_key: Some(key),
            })
        })
        .collect()
}

pub(crate) type PackStates = Arc<Mutex<HashMap<String, (u64, Arc<Vec<Value>>)>>>;

type ListedState = (String, Map<String, Value>, Arc<Vec<Value>>);

fn now_ms() -> u64 {
    u64::from(matrix_sdk::ruma::MilliSecondsSinceUnixEpoch::now().0)
}

fn pack_events(state: impl IntoIterator<Item = Value>) -> Vec<Value> {
    state
        .into_iter()
        .filter(|e| {
            matches!(
                e.get("type").and_then(Value::as_str),
                Some(PACK_EVENT | SPACE_PARENT)
            )
        })
        .map(|e| {
            json!({
                "type": e.get("type"),
                "state_key": e.get("state_key"),
                "content": e.get("content"),
            })
        })
        .collect()
}

async fn fetch_pack_state(client: &matrix_sdk::Client, room_id: &str) -> Option<Vec<Value>> {
    let room_id = parse_room_id(room_id).ok()?;
    let request = matrix_sdk::ruma::api::client::state::get_state_events::v3::Request::new(
        room_id.to_owned(),
    );
    let response = client.send(request).await.ok()?;
    Some(pack_events(response.room_state.iter().filter_map(|raw| {
        raw.deserialize_as_unchecked::<Value>().ok()
    })))
}

async fn remember_pack_state(
    client: &matrix_sdk::Client,
    states: &PackStates,
    room_id: &str,
    events: Vec<Value>,
) -> Arc<Vec<Value>> {
    let at = now_ms();
    let events = Arc::new(events);
    states
        .lock()
        .expect("pack states")
        .insert(room_id.to_owned(), (at, events.clone()));
    let stored = json!({ "at": at, "events": *events });
    let _ = client
        .state_store()
        .set_custom_value(
            format!("{STORE_PREFIX}{room_id}").as_bytes(),
            stored.to_string().into_bytes(),
        )
        .await;
    events
}

impl WizardClient {
    async fn pack_state(&self, room_id: &str) -> Arc<Vec<Value>> {
        let cached = self
            .sound_states
            .lock()
            .expect("pack states")
            .get(room_id)
            .cloned();
        let cached = match cached {
            Some(entry) => Some(entry),
            None => self
                .sdk()
                .state_store()
                .get_custom_value(format!("{STORE_PREFIX}{room_id}").as_bytes())
                .await
                .ok()
                .flatten()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .and_then(|stored| {
                    let at = stored.get("at")?.as_u64()?;
                    let events = stored.get("events")?.as_array()?.clone();
                    let entry = (at, Arc::new(events));
                    self.sound_states
                        .lock()
                        .expect("pack states")
                        .insert(room_id.to_owned(), entry.clone());
                    Some(entry)
                }),
        };
        match cached {
            Some((at, events)) if now_ms().saturating_sub(at) < FRESH_MS => events,
            Some((_, events)) => {
                self.sound_states
                    .lock()
                    .expect("pack states")
                    .insert(room_id.to_owned(), (now_ms(), events.clone()));
                let client = self.sdk().clone();
                let states = self.sound_states.clone();
                let room_id = room_id.to_owned();
                matrix_sdk::executor::spawn(async move {
                    if let Some(fresh) = fetch_pack_state(&client, &room_id).await {
                        remember_pack_state(&client, &states, &room_id, fresh).await;
                    }
                });
                events
            }
            None => match fetch_pack_state(self.sdk(), room_id).await {
                Some(fresh) => {
                    remember_pack_state(self.sdk(), &self.sound_states, room_id, fresh).await
                }
                None => Arc::new(Vec::new()),
            },
        }
    }

    async fn refresh_pack_state(&self, room_id: &str) {
        if let Some(fresh) = fetch_pack_state(self.sdk(), room_id).await {
            remember_pack_state(self.sdk(), &self.sound_states, room_id, fresh).await;
        }
    }

    async fn synced_account_data(&self, event_type: &str) -> Result<Option<Value>> {
        match self.cached_account_data(event_type).await? {
            Some(content) => Ok(Some(content)),
            None => self.account_data(event_type).await,
        }
    }

    async fn listed_packs(&self) -> Result<Value> {
        Ok(self
            .synced_account_data(ROOMS_EVENT)
            .await?
            .filter(|c| c.get("rooms").is_some_and(Value::is_object))
            .unwrap_or_else(|| json!({ "rooms": {} })))
    }

    async fn set_listed(&self, room_id: &str, state_key: &str, listed: bool) -> Result<()> {
        let mut content = self
            .account_data(ROOMS_EVENT)
            .await?
            .filter(|c| c.get("rooms").is_some_and(Value::is_object))
            .unwrap_or_else(|| json!({ "rooms": {} }));
        let rooms = content
            .get_mut("rooms")
            .and_then(Value::as_object_mut)
            .expect("checked in listed_packs");
        let keys = rooms.entry(room_id.to_owned()).or_insert_with(|| json!({}));
        if !keys.is_object() {
            *keys = json!({});
        }
        let keys = keys.as_object_mut().expect("checked above");
        if listed == keys.contains_key(state_key) {
            return Ok(());
        }
        if listed {
            keys.insert(state_key.to_owned(), json!({}));
        } else {
            keys.remove(state_key);
            if keys.is_empty() {
                rooms.remove(room_id);
            }
        }
        self.set_account_data(ROOMS_EVENT, content).await
    }

    fn joined(&self, room_id: &str) -> bool {
        parse_room_id(room_id)
            .ok()
            .and_then(|id| self.sdk().get_room(id))
            .is_some_and(|room| room.state() == RoomState::Joined)
    }

    fn room_name(&self, room_id: &str) -> Option<String> {
        self.sdk()
            .get_room(parse_room_id(room_id).ok()?)?
            .cached_display_name()
            .map(|name| name.to_string())
    }

    async fn can_edit_packs(&self, room_id: &str) -> bool {
        let Ok(room) = self.room(room_id) else {
            return false;
        };
        let Ok(power_levels) = room.power_levels().await else {
            return false;
        };
        power_levels.user_can_send_state(room.own_user_id(), StateEventType::from(PACK_EVENT))
    }

    async fn user_pack_content(&self) -> Result<Value> {
        Ok(self
            .synced_account_data(USER_EVENT)
            .await?
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({})))
    }

    fn user_pack(content: &Value) -> SoundPack {
        SoundPack {
            id: USER_ID.to_owned(),
            source: SoundPackSource::Mine,
            name: str_at(content, "/pack/display_name"),
            attribution: str_at(content, "/pack/attribution"),
            everywhere: true,
            can_edit: true,
            sounds: parse_sounds(content),
            ..Self::built_in_pack(Vec::new())
        }
    }

    fn built_in_pack(sounds: Vec<SoundboardSound>) -> SoundPack {
        SoundPack {
            id: BUILT_IN_ID.to_owned(),
            source: SoundPackSource::BuiltIn,
            room_id: None,
            state_key: None,
            name: None,
            room_name: None,
            avatar_url: None,
            attribution: None,
            everywhere: true,
            can_edit: false,
            sounds,
        }
    }

    pub async fn soundboard_packs(&self, room_id: Option<&str>) -> Result<Vec<SoundPack>> {
        let mut packs = vec![Self::built_in_pack(self.soundboard_sounds().await?)];
        let listed = self.listed_packs().await?;
        if let Some(room_id) = room_id {
            let state = self.pack_state(room_id).await;
            let place = PackPlace {
                room_id,
                room_name: self.room_name(room_id),
                source: SoundPackSource::Room,
                can_edit: self.can_edit_packs(room_id).await,
                listed: &listed,
            };
            packs.extend(packs_in(&place, &state, None));
            let mut visited = HashSet::from([room_id.to_owned()]);
            let mut level = canonical_parents(&state);
            for _ in 0..MAX_SPACE_DEPTH {
                let mut next = Vec::new();
                for parent in level {
                    if !visited.insert(parent.clone()) || !self.joined(&parent) {
                        continue;
                    }
                    let state = self.pack_state(&parent).await;
                    let place = PackPlace {
                        room_id: &parent,
                        room_name: self.room_name(&parent),
                        source: SoundPackSource::Space,
                        can_edit: self.can_edit_packs(&parent).await,
                        listed: &listed,
                    };
                    packs.extend(packs_in(&place, &state, None));
                    next.extend(canonical_parents(&state));
                }
                level = next;
            }
        }
        packs.push(Self::user_pack(&self.user_pack_content().await?));
        packs.extend(self.listed_room_packs(&listed).await);
        let mut seen = HashSet::new();
        packs.retain(|pack| !pack.sounds.is_empty() && seen.insert(pack.id.clone()));
        let frequent = self.frequent_sounds(&packs).await?;
        if !frequent.is_empty() {
            packs.insert(
                0,
                SoundPack {
                    id: FREQUENT_ID.to_owned(),
                    source: SoundPackSource::Frequent,
                    everywhere: false,
                    ..Self::built_in_pack(frequent)
                },
            );
        }
        Ok(packs)
    }

    async fn frequent_sounds(&self, packs: &[SoundPack]) -> Result<Vec<SoundboardSound>> {
        let Some(content) = self.cached_account_data(FREQUENT_EVENT).await? else {
            return Ok(Vec::new());
        };
        let Some(counts) = content.get("sounds").and_then(Value::as_object) else {
            return Ok(Vec::new());
        };
        let mut ranked: Vec<(&String, u64)> = counts
            .iter()
            .filter_map(|(url, count)| Some((url, count.as_u64()?)))
            .collect();
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
        Ok(ranked
            .into_iter()
            .filter_map(|(url, _)| {
                packs
                    .iter()
                    .flat_map(|pack| &pack.sounds)
                    .find(|sound| &sound.url == url)
                    .cloned()
            })
            .take(FREQUENT_SHOWN)
            .collect())
    }

    pub async fn record_sound_played(&self, url: &str) -> Result<()> {
        let mut content = self
            .cached_account_data(FREQUENT_EVENT)
            .await?
            .filter(|c| c.get("sounds").is_some_and(Value::is_object))
            .unwrap_or_else(|| json!({ "sounds": {} }));
        let counts = content
            .get_mut("sounds")
            .and_then(Value::as_object_mut)
            .expect("checked above");
        let count = counts.get(url).and_then(Value::as_u64).unwrap_or(0) + 1;
        counts.insert(url.to_owned(), json!(count));
        if counts.len() > FREQUENT_KEPT {
            let mut ranked: Vec<(String, u64)> = counts
                .iter()
                .map(|(u, c)| (u.clone(), c.as_u64().unwrap_or(0)))
                .collect();
            ranked.sort_by_key(|r| std::cmp::Reverse(r.1));
            for (stale, _) in ranked.into_iter().skip(FREQUENT_KEPT) {
                if stale != url {
                    counts.remove(&stale);
                }
            }
        }
        self.set_account_data(FREQUENT_EVENT, content).await
    }

    async fn listed_room_packs(&self, listed: &Value) -> Vec<SoundPack> {
        let rooms: Vec<(String, Map<String, Value>)> = listed
            .get("rooms")
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
            .filter(|(id, _)| self.joined(id))
            .filter_map(|(id, keys)| Some((id.clone(), keys.as_object()?.clone())))
            .collect();
        let states: Vec<ListedState> = futures_util::stream::iter(rooms)
            .map(|(id, keys)| async move {
                let state = self.pack_state(&id).await;
                (id, keys, state)
            })
            .buffered(16)
            .collect()
            .await;
        let mut packs = Vec::new();
        for (id, keys, state) in &states {
            let place = PackPlace {
                room_id: id,
                room_name: self.room_name(id),
                source: SoundPackSource::Everywhere,
                can_edit: self.can_edit_packs(id).await,
                listed,
            };
            packs.extend(packs_in(&place, state, Some(keys)));
        }
        packs
    }

    pub async fn favorite_sound_packs(&self) -> Result<Vec<SoundPack>> {
        let listed = self.listed_packs().await?;
        Ok(self.listed_room_packs(&listed).await)
    }

    pub async fn all_sound_packs(&self) -> Result<Vec<SoundPack>> {
        let listed = self.listed_packs().await?;
        let rooms: Vec<String> = self
            .sdk()
            .joined_rooms()
            .into_iter()
            .map(|room| room.room_id().to_string())
            .collect();
        let states: Vec<(String, Arc<Vec<Value>>)> = futures_util::stream::iter(rooms)
            .map(|id| async move {
                let state = self.pack_state(&id).await;
                (id, state)
            })
            .buffered(16)
            .collect()
            .await;
        let mut packs = Vec::new();
        for (id, state) in &states {
            if !state
                .iter()
                .any(|e| e.get("type").and_then(Value::as_str) == Some(PACK_EVENT))
            {
                continue;
            }
            let place = PackPlace {
                room_id: id,
                room_name: self.room_name(id),
                source: SoundPackSource::Room,
                can_edit: self.can_edit_packs(id).await,
                listed: &listed,
            };
            packs.extend(
                packs_in(&place, state, None)
                    .into_iter()
                    .filter(|pack| !pack.sounds.is_empty()),
            );
        }
        Ok(packs)
    }

    pub async fn room_sound_packs(&self, room_id: &str) -> Result<RoomSoundPacks> {
        let listed = self.listed_packs().await?;
        let can_edit = self.can_edit_packs(room_id).await;
        let place = PackPlace {
            room_id,
            room_name: self.room_name(room_id),
            source: SoundPackSource::Room,
            can_edit,
            listed: &listed,
        };
        let state = self.pack_state(room_id).await;
        Ok(RoomSoundPacks {
            can_edit,
            packs: packs_in(&place, &state, None),
        })
    }

    pub async fn my_sounds(&self) -> Result<SoundPack> {
        let content = self
            .account_data(USER_EVENT)
            .await?
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        Ok(Self::user_pack(&content))
    }

    pub async fn upload_sound(
        &self,
        data: Vec<u8>,
        mimetype: &str,
        duration_ms: u32,
    ) -> Result<SoundboardSound> {
        let mimetype = mimetype
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if !MIMETYPES.contains(&mimetype.as_str()) || duration_ms == 0 {
            return Err(invalid("unsupported"));
        }
        if data.len() > MAX_SOUND_BYTES {
            return Err(invalid("tooLarge"));
        }
        if duration_ms > MAX_DURATION_MS {
            return Err(invalid("tooLong"));
        }
        let size = u32::try_from(data.len()).ok();
        let url = self.upload_media(data, &mimetype).await?;
        Ok(SoundboardSound {
            shortcode: String::new(),
            url,
            body: None,
            emoji: None,
            mimetype: Some(mimetype),
            size,
            duration_ms: Some(duration_ms),
        })
    }

    pub async fn save_sound_pack(
        &self,
        room_id: Option<&str>,
        state_key: &str,
        name: &str,
        attribution: Option<&str>,
        sounds: Vec<SoundboardSound>,
    ) -> Result<()> {
        let mut seen = HashSet::new();
        for sound in &sounds {
            if !valid_shortcode(&sound.shortcode) {
                return Err(invalid("badShortcode"));
            }
            if !seen.insert(sound.shortcode.as_str()) {
                return Err(invalid("shortcodeTaken"));
            }
        }
        let mut content = match room_id {
            Some(room_id) => self.state_event(room_id, PACK_EVENT, state_key).await?,
            None => self.account_data(USER_EVENT).await?,
        }
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
        let old = content
            .get("sounds")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut entries = Map::new();
        for sound in sounds {
            let mut entry = old
                .values()
                .find(|e| e.get("url").and_then(Value::as_str) == Some(sound.url.as_str()))
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            entry.insert("url".into(), json!(sound.url));
            set_or_remove(
                &mut entry,
                "body",
                sound.body.filter(|b| !b.trim().is_empty()),
            );
            set_or_remove(
                &mut entry,
                EMOJI_KEY,
                sound
                    .emoji
                    .filter(|e| !e.trim().is_empty() && e.len() <= MAX_EMOJI_BYTES),
            );
            let mut info = entry
                .get("info")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            if let Some(mimetype) = sound.mimetype {
                info.insert("mimetype".into(), json!(mimetype));
            }
            if let Some(size) = sound.size {
                info.insert("size".into(), json!(size));
            }
            if let Some(duration) = sound.duration_ms {
                info.insert("duration".into(), json!(duration));
            }
            if !info.is_empty() {
                entry.insert("info".into(), Value::Object(info));
            }
            entries.insert(sound.shortcode, Value::Object(entry));
        }
        let object = content.as_object_mut().expect("checked above");
        object.insert("sounds".into(), Value::Object(entries));
        let pack = object.entry("pack").or_insert_with(|| json!({}));
        if !pack.is_object() {
            *pack = json!({});
        }
        let pack = pack.as_object_mut().expect("checked above");
        set_or_remove(
            pack,
            "display_name",
            Some(name.trim().to_owned()).filter(|n| !n.is_empty()),
        );
        set_or_remove(
            pack,
            "attribution",
            attribution
                .map(str::trim)
                .filter(|a| !a.is_empty())
                .map(ToOwned::to_owned),
        );
        match room_id {
            Some(room_id) => {
                self.set_state_event(room_id, PACK_EVENT, state_key, content)
                    .await?;
                self.refresh_pack_state(room_id).await;
                Ok(())
            }
            None => self.set_account_data(USER_EVENT, content).await,
        }
    }

    pub async fn create_sound_pack(&self, room_id: &str, name: &str) -> Result<String> {
        let name = name.trim();
        let taken: HashSet<String> = self
            .state_events_of_type(room_id, PACK_EVENT)
            .await?
            .into_iter()
            .map(|(key, _)| key)
            .collect();
        let state_key = unique(&shortcode_from(name), "sounds", |k| taken.contains(k));
        let mut content = json!({ "sounds": {} });
        if !name.is_empty() {
            content["pack"] = json!({ "display_name": name });
        }
        self.set_state_event(room_id, PACK_EVENT, &state_key, content)
            .await?;
        self.refresh_pack_state(room_id).await;
        Ok(state_key)
    }

    pub async fn delete_sound_pack(&self, room_id: &str, state_key: &str) -> Result<()> {
        self.set_state_event(room_id, PACK_EVENT, state_key, json!({}))
            .await?;
        self.refresh_pack_state(room_id).await;
        self.set_listed(room_id, state_key, false).await
    }

    pub async fn set_sound_pack_everywhere(
        &self,
        room_id: &str,
        state_key: &str,
        everywhere: bool,
    ) -> Result<()> {
        self.set_listed(room_id, state_key, everywhere).await
    }
}
