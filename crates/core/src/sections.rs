//! Room list sections, stored the way Element stores them: the sections and their order in
//! `im.vector.web.settings`, and a room's section as an `element.io.section.*` room tag.

use matrix_sdk::ruma::events::tag::{TagInfo, TagName};
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::{calls::random_uuid, Error, Result, WizardClient};

const WEB_SETTINGS_EVENT: &str = "im.vector.web.settings";
const SECTION_DATA_KEY: &str = "RoomList.CustomSectionData";
const SECTION_ORDER_KEY: &str = "RoomList.OrderedCustomSections";
const SECTION_TAG_PREFIX: &str = "element.io.section.";
/// Where the rooms that are in no section go in the order
const CHATS_TAG: &str = "chats";
const PEOPLE_TAG: &str = "im.vector.fake.direct";
const HOME_SPACE: &str = "home-space";
/// Tags that a room in a section can't have at the same time
const EXCLUSIVE_TAGS: [&str; 2] = ["m.favourite", "m.lowpriority"];

/// A user-made section of the room list
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomSection {
    /// The room tag of the rooms in it (`element.io.section.<uuid>`)
    pub tag: String,
    pub name: String,
    /// The space it was made in, `home-space` for Home
    pub space_id: String,
    /// Shown above the rooms that are in no section
    pub above_rooms: bool,
}

struct StoredSection {
    tag: String,
    name: String,
    space_id: Option<String>,
}

fn is_section_tag(tag: &str) -> bool {
    tag.starts_with(SECTION_TAG_PREFIX)
}

fn read_data(settings: &Map<String, Value>) -> Vec<StoredSection> {
    let Some(Value::Object(raw)) = settings.get(SECTION_DATA_KEY) else {
        return Vec::new();
    };
    raw.iter()
        .filter_map(|(key, value)| {
            let name = value.get("name")?.as_str()?;
            (value.get("tag").and_then(Value::as_str) == Some(key) && is_section_tag(key)).then(
                || StoredSection {
                    tag: key.clone(),
                    name: name.to_owned(),
                    space_id: value.get("spaceId").and_then(Value::as_str).map(Into::into),
                },
            )
        })
        .collect()
}

fn read_order(settings: &Map<String, Value>, data: &[StoredSection]) -> Vec<String> {
    let known =
        |tag: &str| tag == CHATS_TAG || tag == PEOPLE_TAG || data.iter().any(|s| s.tag == tag);
    let mut order: Vec<String> = settings
        .get(SECTION_ORDER_KEY)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|tag| known(tag))
        .map(Into::into)
        .collect();
    for section in data {
        if !order.contains(&section.tag) {
            let at = order
                .iter()
                .position(|t| t == CHATS_TAG)
                .unwrap_or(order.len());
            order.insert(at, section.tag.clone());
        }
    }
    if !order.iter().any(|t| t == CHATS_TAG) {
        order.push(CHATS_TAG.into());
    }
    if !order.iter().any(|t| t == PEOPLE_TAG) {
        order.insert(0, PEOPLE_TAG.into());
    }
    order
}

fn read_sections(settings: &Map<String, Value>) -> Vec<RoomSection> {
    let data = read_data(settings);
    let order = read_order(settings, &data);
    let chats = order.iter().position(|t| t == CHATS_TAG).unwrap_or(0);
    order
        .iter()
        .enumerate()
        .filter_map(|(index, tag)| {
            let section = data.iter().find(|s| &s.tag == tag)?;
            Some(RoomSection {
                tag: tag.clone(),
                name: section.name.clone(),
                space_id: section
                    .space_id
                    .clone()
                    .unwrap_or_else(|| HOME_SPACE.into()),
                above_rooms: index < chats,
            })
        })
        .collect()
}

fn as_settings(content: Option<Value>) -> Map<String, Value> {
    match content {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    }
}

impl WizardClient {
    async fn web_settings(&self) -> Result<Map<String, Value>> {
        let cached = self.cached_account_data(WEB_SETTINGS_EVENT).await?;
        let content = match cached {
            Some(content) => Some(content),
            None => self.account_data(WEB_SETTINGS_EVENT).await?,
        };
        Ok(as_settings(content))
    }

    async fn write_sections(
        &self,
        mutate: impl FnOnce(&mut Vec<StoredSection>, &mut Vec<String>),
    ) -> Result<()> {
        let mut settings = self.web_settings().await?;
        let mut data = read_data(&settings);
        let mut order = read_order(&settings, &data);
        mutate(&mut data, &mut order);
        let data: Map<String, Value> = data
            .into_iter()
            .map(|s| {
                let mut value = json!({ "tag": s.tag, "name": s.name });
                if let Some(space_id) = s.space_id {
                    value["spaceId"] = space_id.into();
                }
                (s.tag, value)
            })
            .collect();
        settings.insert(SECTION_DATA_KEY.into(), Value::Object(data));
        settings.insert(SECTION_ORDER_KEY.into(), json!(order));
        self.set_account_data(WEB_SETTINGS_EVENT, Value::Object(settings))
            .await
    }

    /// Calls `on_change` with the sections in list order, now and whenever they change.
    pub async fn watch_room_sections(
        &self,
        mut on_change: impl FnMut(Vec<RoomSection>),
    ) -> Result<()> {
        self.watch_account_data(WEB_SETTINGS_EVENT, |content| {
            on_change(read_sections(&as_settings(content)))
        })
        .await
    }

    /// Calls `on_change` with the whole list order: section tags plus `chats` for the rooms
    /// in no section and `im.vector.fake.direct` for the direct chats in none.
    pub async fn watch_room_section_order(
        &self,
        mut on_change: impl FnMut(Vec<String>),
    ) -> Result<()> {
        self.watch_account_data(WEB_SETTINGS_EVENT, |content| {
            let settings = as_settings(content);
            on_change(read_order(&settings, &read_data(&settings)))
        })
        .await
    }

    /// Adds a section right above the rooms that are in none; returns its tag.
    pub async fn create_room_section(&self, name: &str, space_id: &str) -> Result<String> {
        let tag = format!("{SECTION_TAG_PREFIX}{}", random_uuid()?);
        self.write_sections(|data, order| {
            data.push(StoredSection {
                tag: tag.clone(),
                name: name.to_owned(),
                space_id: Some(space_id.to_owned()),
            });
            let at = order
                .iter()
                .position(|t| t == CHATS_TAG)
                .unwrap_or(order.len());
            order.insert(at, tag.clone());
        })
        .await?;
        Ok(tag)
    }

    pub async fn rename_room_section(&self, tag: &str, name: &str) -> Result<()> {
        self.write_sections(|data, _| {
            if let Some(section) = data.iter_mut().find(|s| s.tag == tag) {
                section.name = name.to_owned();
            }
        })
        .await
    }

    /// Puts the given sections (and `chats` for the rooms in none) in this order, keeping
    /// every other entry where it is.
    pub async fn set_room_section_order(&self, tags: Vec<String>) -> Result<()> {
        self.write_sections(|_, order| {
            let slots: Vec<usize> = order
                .iter()
                .enumerate()
                .filter(|(_, t)| tags.contains(t))
                .map(|(i, _)| i)
                .collect();
            if slots.len() != tags.len() {
                return;
            }
            for (slot, tag) in slots.into_iter().zip(tags) {
                order[slot] = tag;
            }
        })
        .await
    }

    /// Removes a section; its rooms go back to the rooms that are in none.
    pub async fn delete_room_section(&self, tag: &str) -> Result<()> {
        self.write_sections(|data, order| {
            data.retain(|s| s.tag != tag);
            if let Some(index) = order.iter().position(|t| t == tag) {
                order.remove(index);
            }
        })
        .await?;
        for room in self.sdk().rooms() {
            let has_tag = room
                .tags()
                .await
                .ok()
                .flatten()
                .is_some_and(|tags| tags.keys().any(|t| t.as_ref() == tag));
            if has_tag {
                if let Err(error) = room.remove_tag(TagName::from(tag)).await {
                    tracing::warn!("couldn't remove section tag: {error}");
                }
            }
        }
        Ok(())
    }

    /// Moves a room into a section (out of favourites and low priority), or out of its
    /// section with `None`.
    pub async fn set_room_section(&self, room_id: &str, tag: Option<String>) -> Result<()> {
        let room = self.room(room_id)?;
        let current: Vec<String> = room
            .tags()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?
            .unwrap_or_default()
            .into_keys()
            .map(|t| t.as_ref().to_owned())
            .collect();
        for name in &current {
            if Some(name) != tag.as_ref()
                && (is_section_tag(name) || EXCLUSIVE_TAGS.contains(&name.as_str()))
            {
                room.remove_tag(TagName::from(name.as_str())).await?;
            }
        }
        if let Some(tag) = tag {
            if !current.contains(&tag) {
                room.set_tag(TagName::from(tag), TagInfo::new()).await?;
            }
        }
        Ok(())
    }
}
