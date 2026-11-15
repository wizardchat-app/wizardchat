use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use matrix_sdk::{
    ruma::{events::StateEventType, room::RoomType, OwnedRoomId, RoomId},
    Room, RoomState,
};
use matrix_sdk_ui::spaces::SpaceService;
use serde::Serialize;

use crate::{Error, ListDiff, Result, WizardClient};

/// A space the user has joined, for the space rail
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceSummary {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub children_count: u64,
    pub member_count: u64,
    pub topic: Option<String>,
}

/// A room or subspace inside a space, joined or not
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceChild {
    pub id: String,
    pub name: String,
    pub topic: Option<String>,
    pub avatar_url: Option<String>,
    pub canonical_alias: Option<String>,
    pub member_count: u64,
    pub is_space: bool,
    pub joined: bool,
    pub invited: bool,
    /// Asked to join and waiting for an answer
    pub knocked: bool,
    /// Servers to join through
    pub via: Vec<String>,
    pub suggested: bool,
    /// `public`, `invite`, `knock`, `restricted`, ...
    pub join_rule: Option<String>,
    pub world_readable: bool,
    pub children_count: u64,
}

/// A space's rooms from the server, as far as they could be loaded
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceHierarchy {
    /// The space itself, as the server describes it
    pub space: Option<SpaceChild>,
    /// Its direct children (rooms and subspaces)
    pub children: Vec<SpaceChild>,
    /// False when a page failed and the list is partial
    pub complete: bool,
}

const HIERARCHY_PAGE_LIMIT: u32 = 100;
const HIERARCHY_MAX_PAGES: usize = 50;

impl WizardClient {
    pub(crate) async fn space_service(&self) -> Arc<SpaceService> {
        if let Some(service) = self.spaces.lock().unwrap().clone() {
            return service;
        }
        let service = Arc::new(SpaceService::new(self.sdk().clone()).await);
        self.spaces.lock().unwrap().get_or_insert(service).clone()
    }

    /// Room IDs that belong to a joined space, at any depth
    pub(crate) async fn space_descendants(&self, space_id: &str) -> Vec<OwnedRoomId> {
        self.space_service()
            .await
            .space_filters()
            .await
            .into_iter()
            .find(|filter| filter.space_room.room_id == space_id)
            .map(|filter| filter.descendants)
            .unwrap_or_default()
    }

    /// Every joined space with the rooms it lists as children (`m.space.child` with servers)
    async fn joined_spaces(&self) -> Vec<(Room, Vec<String>)> {
        let mut spaces = Vec::new();
        for room in self.sdk().joined_space_rooms() {
            let children = child_links(&room)
                .await
                .into_iter()
                .map(|link| link.room_id)
                .collect();
            spaces.push((room, children));
        }
        spaces
    }

    /// Joined spaces as the space rail shows them; with `top_level_only`, those that no other
    /// joined space lists as a child.
    async fn space_summaries(&self, top_level_only: bool) -> Vec<SpaceSummary> {
        let spaces = self.joined_spaces().await;
        let joined: HashSet<String> = spaces
            .iter()
            .map(|(r, _)| r.room_id().to_string())
            .collect();
        let nested: HashSet<&String> = spaces
            .iter()
            .flat_map(|(_, children)| children.iter())
            .filter(|id| joined.contains(*id))
            .collect();
        spaces
            .iter()
            .filter(|(room, _)| !top_level_only || !nested.contains(&room.room_id().to_string()))
            .map(|(room, children)| SpaceSummary {
                id: room.room_id().to_string(),
                name: crate::rooms::room_name(room).unwrap_or_else(|| room.room_id().to_string()),
                avatar_url: room.avatar_url().map(|u| u.to_string()),
                children_count: children.len() as u64,
                member_count: room.joined_members_count(),
                topic: room.topic(),
            })
            .collect()
    }

    async fn watch_space_summaries(
        &self,
        top_level_only: bool,
        mut on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>),
    ) {
        let mut updates = self.sdk().subscribe_to_all_room_updates();
        let mut current = self.space_summaries(top_level_only).await;
        on_update(vec![ListDiff::Reset {
            values: current.clone(),
        }]);
        loop {
            match updates.recv().await {
                Ok(update) => {
                    let touches_space = update
                        .iter_all_room_ids()
                        .any(|id| self.sdk().get_room(id).is_none_or(|room| room.is_space()));
                    if !touches_space {
                        continue;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
            let next = self.space_summaries(top_level_only).await;
            if next != current {
                current = next;
                on_update(vec![ListDiff::Reset {
                    values: current.clone(),
                }]);
            }
        }
    }

    /// Streams the top-level joined spaces (those no other joined space lists as a child) as
    /// diffs, starting with the current list.
    pub async fn watch_spaces(&self, on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>)) {
        self.watch_space_summaries(true, on_update).await;
    }

    /// Streams every joined space, subspaces included, as diffs.
    pub async fn watch_all_spaces(&self, on_update: impl FnMut(Vec<ListDiff<SpaceSummary>>)) {
        self.watch_space_summaries(false, on_update).await;
    }

    /// The rooms and subspaces in a space (from the server's hierarchy), joined or not.
    pub async fn space_children(&self, space_id: &str) -> Result<Vec<SpaceChild>> {
        Ok(self.space_hierarchy(space_id).await?.children)
    }

    /// One level of a space's hierarchy, page by page. A failed page ends it with what was
    /// loaded so far; it's an error only when nothing could be loaded.
    pub async fn space_hierarchy(&self, space_id: &str) -> Result<SpaceHierarchy> {
        use matrix_sdk::ruma::{api::client::space::get_hierarchy, UInt};
        let space_id = RoomId::parse(space_id).map_err(|e| Error::InvalidId(e.to_string()))?;
        let mut chunks = Vec::new();
        let mut from = None;
        let mut complete = true;
        for _ in 0..HIERARCHY_MAX_PAGES {
            let mut request = get_hierarchy::v1::Request::new(space_id.clone());
            request.limit = Some(UInt::from(HIERARCHY_PAGE_LIMIT));
            request.max_depth = Some(UInt::from(1u32));
            request.from = from.take();
            match self.sdk().send(request).await {
                Ok(response) => {
                    chunks.extend(response.rooms);
                    match response.next_batch {
                        Some(next) => from = Some(next),
                        None => break,
                    }
                }
                Err(error) if chunks.is_empty() => return Err(error.into()),
                Err(error) => {
                    tracing::warn!("space hierarchy truncated: {error}");
                    complete = false;
                    break;
                }
            }
        }
        let mut links: HashMap<String, (Vec<String>, bool)> = HashMap::new();
        for chunk in &chunks {
            for raw in &chunk.children_state {
                let Ok(event) = raw.deserialize_as_unchecked::<serde_json::Value>() else {
                    continue;
                };
                let Some(child) = event.get("state_key").and_then(serde_json::Value::as_str) else {
                    continue;
                };
                let via: Vec<String> = event
                    .pointer("/content/via")
                    .and_then(serde_json::Value::as_array)
                    .map(|v| {
                        v.iter()
                            .filter_map(|s| s.as_str().map(ToOwned::to_owned))
                            .collect()
                    })
                    .unwrap_or_default();
                let suggested = event
                    .pointer("/content/suggested")
                    .and_then(serde_json::Value::as_bool)
                    == Some(true);
                let entry = links.entry(child.to_owned()).or_default();
                if !via.is_empty() {
                    entry.0 = via;
                }
                entry.1 |= suggested;
            }
        }
        let mut space = None;
        let mut children = Vec::new();
        let mut seen = HashSet::new();
        for chunk in chunks {
            let summary = chunk.summary;
            if !seen.insert(summary.room_id.clone()) {
                continue;
            }
            let local = self.sdk().get_room(&summary.room_id);
            let state = local.as_ref().map(|r| r.state());
            let (via, suggested) = links
                .get(summary.room_id.as_str())
                .cloned()
                .unwrap_or_default();
            let child = SpaceChild {
                id: summary.room_id.to_string(),
                name: summary
                    .name
                    .clone()
                    .filter(|n| !n.is_empty())
                    .or_else(|| local.as_ref().and_then(crate::rooms::room_name))
                    .unwrap_or_default(),
                topic: summary.topic.clone(),
                avatar_url: summary.avatar_url.as_ref().map(ToString::to_string),
                canonical_alias: summary.canonical_alias.as_ref().map(ToString::to_string),
                member_count: summary.num_joined_members.into(),
                is_space: summary.room_type == Some(RoomType::Space),
                joined: state == Some(RoomState::Joined),
                invited: state == Some(RoomState::Invited),
                knocked: state == Some(RoomState::Knocked),
                via,
                suggested,
                join_rule: Some(summary.join_rule.as_str().to_owned()),
                world_readable: summary.world_readable,
                children_count: chunk.children_state.len() as u64,
            };
            if summary.room_id == space_id {
                space = Some(child);
            } else {
                children.push(child);
            }
        }
        Ok(SpaceHierarchy {
            space,
            children,
            complete,
        })
    }
}

impl WizardClient {
    /// Adds a room or sub-space to a space (and links it back as its parent when allowed).
    pub async fn add_to_space(
        &self,
        space_id: &str,
        child_id: &str,
        suggested: bool,
    ) -> Result<()> {
        let server = self
            .sdk()
            .user_id()
            .map(|u| u.server_name().to_string())
            .unwrap_or_default();
        let mut content = serde_json::json!({ "via": [server.clone()] });
        if suggested {
            content["suggested"] = serde_json::json!(true);
        }
        self.set_state_event(space_id, "m.space.child", child_id, content)
            .await?;
        // Linking back needs permission in the child; the space link alone is enough to show it
        let _ = self
            .set_state_event(
                child_id,
                "m.space.parent",
                space_id,
                serde_json::json!({ "via": [server], "canonical": true }),
            )
            .await;
        Ok(())
    }

    pub async fn remove_from_space(&self, space_id: &str, child_id: &str) -> Result<()> {
        self.set_state_event(space_id, "m.space.child", child_id, serde_json::json!({}))
            .await?;
        let _ = self
            .set_state_event(child_id, "m.space.parent", space_id, serde_json::json!({}))
            .await;
        Ok(())
    }

    /// Changes a child's `suggested` flag or `order` (a short string sorted lexically), keeping
    /// the rest of its link.
    pub async fn update_space_child(
        &self,
        space_id: &str,
        child_id: &str,
        suggested: Option<bool>,
        order: Option<Option<String>>,
    ) -> Result<()> {
        let mut content = self
            .state_event(space_id, "m.space.child", child_id)
            .await?
            .ok_or_else(|| Error::InvalidId("not a child of this space".into()))?;
        if let Some(suggested) = suggested {
            content["suggested"] = serde_json::json!(suggested);
        }
        match order {
            Some(Some(order)) => content["order"] = serde_json::json!(order),
            Some(None) => {
                if let Some(obj) = content.as_object_mut() {
                    obj.remove("order");
                }
            }
            None => {}
        }
        self.set_state_event(space_id, "m.space.child", child_id, content)
            .await
    }
}

/// A joined space and the rooms and spaces it links to (from local state)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceNode {
    pub space_id: String,
    pub children: Vec<SpaceLink>,
    /// The first parent this space names as canonical (`m.space.parent`)
    pub canonical_parent: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SpaceLink {
    pub room_id: String,
    pub order: Option<String>,
    pub suggested: bool,
    /// When the link was made, to keep equal `order`s stable
    pub timestamp: u64,
    /// Servers to join through
    pub via: Vec<String>,
}

async fn state_events_json(room: &Room, event_type: StateEventType) -> Vec<serde_json::Value> {
    use matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState;
    room.get_state_events(event_type)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|raw| match raw {
            RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked().ok(),
            RawAnySyncOrStrippedState::Stripped(_) => None,
        })
        .collect()
}

/// A space's `m.space.child` links that name servers (an empty one removes the child), in the
/// space's order
async fn child_links(room: &Room) -> Vec<SpaceLink> {
    let mut children: Vec<SpaceLink> = state_events_json(room, StateEventType::SpaceChild)
        .await
        .into_iter()
        .filter_map(|event| {
            let content = event.get("content")?;
            let via: Vec<String> = content
                .get("via")?
                .as_array()
                .filter(|v| !v.is_empty())?
                .iter()
                .filter_map(|s| s.as_str().map(ToOwned::to_owned))
                .collect();
            Some(SpaceLink {
                room_id: event.get("state_key")?.as_str()?.to_owned(),
                order: content
                    .get("order")
                    .and_then(serde_json::Value::as_str)
                    .map(ToOwned::to_owned),
                timestamp: event
                    .get("origin_server_ts")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or_default(),
                suggested: content
                    .get("suggested")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                via,
            })
        })
        .collect();
    children.sort_by(|a, b| match (&a.order, &b.order) {
        (Some(x), Some(y)) => x.cmp(y).then(a.timestamp.cmp(&b.timestamp)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        _ => a
            .timestamp
            .cmp(&b.timestamp)
            .then(a.room_id.cmp(&b.room_id)),
    });
    children
}

impl WizardClient {
    /// Every joined space with its children, read from local state (cheap; call on changes).
    pub async fn space_graph(&self) -> Result<Vec<SpaceNode>> {
        let mut nodes = Vec::new();
        for room in self.sdk().joined_space_rooms() {
            let canonical_parent = state_events_json(&room, StateEventType::SpaceParent)
                .await
                .into_iter()
                .find(|event| {
                    event
                        .pointer("/content/canonical")
                        .and_then(serde_json::Value::as_bool)
                        == Some(true)
                })
                .and_then(|event| event.get("state_key")?.as_str().map(ToOwned::to_owned));
            nodes.push(SpaceNode {
                space_id: room.room_id().to_string(),
                children: child_links(&room).await,
                canonical_parent,
            });
        }
        Ok(nodes)
    }
}
