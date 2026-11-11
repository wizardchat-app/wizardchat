//! Room and space administration: access, history, addresses, encryption, avatar, upgrades,
//! the full power levels, moderation lists, knocking, reports, and generic state/media access
//! for editors built on top (emoji packs, widgets, space order).

use matrix_sdk::{
    deserialized_responses::RawAnySyncOrStrippedState,
    room::RoomMemberRole,
    ruma::{
        api::client::{
            alias::{create_alias, delete_alias},
            discovery::get_capabilities,
            room::{aliases, get_room_event, upgrade_room},
            state::{get_state_event_for_key, get_state_events},
        },
        events::StateEventType,
        OwnedEventId, OwnedRoomAliasId, OwnedRoomOrAliasId, OwnedServerName, RoomVersionId,
    },
    Room, RoomMemberships, RoomState,
};
use serde::Serialize;
use serde_json::{json, Value};

use crate::{
    rooms::{parse_room_id, parse_user_id},
    Error, Result, WizardClient,
};

const SYNCED_STATE_TYPES: [&str; 2] = ["m.space.parent", "m.space.child"];

fn state_entry(event: &Value, event_types: &[String]) -> Option<(String, String, Value)> {
    let event_type = event.get("type")?.as_str()?;
    if !event_types.iter().any(|t| t == event_type) {
        return None;
    }
    let content = event.get("content")?;
    content.as_object().filter(|o| !o.is_empty())?;
    Some((
        event_type.to_owned(),
        str_of(event, "/state_key").unwrap_or_default(),
        content.clone(),
    ))
}

async fn local_state_events(room: &Room, event_types: &[String]) -> Vec<(String, String, Value)> {
    let mut entries = Vec::new();
    for event_type in event_types {
        let events = room
            .get_state_events(StateEventType::from(event_type.as_str()))
            .await
            .unwrap_or_default();
        entries.extend(events.into_iter().filter_map(|raw| {
            match raw {
                RawAnySyncOrStrippedState::Sync(raw) => raw
                    .deserialize_as_unchecked::<Value>()
                    .ok()
                    .and_then(|e| state_entry(&e, event_types)),
                RawAnySyncOrStrippedState::Stripped(_) => None,
            }
        }));
    }
    entries
}

/// Everything a room or space settings screen shows, read from the server
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomSettings {
    pub room_id: String,
    pub name: Option<String>,
    pub topic: Option<String>,
    pub avatar_url: Option<String>,
    pub is_space: bool,
    pub room_version: String,
    /// `invite`, `public`, `knock`, `restricted` or `knock_restricted`
    #[cfg_attr(feature = "typegen", specta(type = crate::rpc::types::JoinRule))]
    pub join_rule: String,
    /// Spaces whose members may join (restricted rules)
    pub join_allowed_spaces: Vec<String>,
    /// `world_readable`, `shared`, `invited` or `joined`
    #[cfg_attr(feature = "typegen", specta(type = crate::rpc::types::HistoryVisibility))]
    pub history_visibility: String,
    pub guest_access: bool,
    pub encrypted: bool,
    pub published: bool,
    pub canonical_alias: Option<String>,
    pub alt_aliases: Vec<String>,
    /// Addresses on this homeserver pointing at the room
    pub local_aliases: Vec<String>,
    pub creators: Vec<String>,
    pub federate: bool,
    /// The `m.room.power_levels` content as stored
    pub power_levels: Value,
    pub tombstone: Option<Tombstone>,
    /// The room this one replaced
    pub predecessor: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Tombstone {
    pub replacement_room: String,
    pub body: String,
}

/// Someone in a room in a given state, for the ban and knock lists
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MemberEntry {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ServerCapabilities {
    pub default_room_version: String,
    /// Version -> `stable` or `unstable`
    pub room_versions: Vec<(String, String)>,
    pub change_password: bool,
    pub change_3pid: bool,
    /// Largest upload in bytes, if the server says
    pub upload_size: Option<u64>,
}

/// An event as it is stored, for "view source"
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EventSource {
    pub room_id: String,
    pub event_id: String,
    /// As the server has it (encrypted for encrypted rooms)
    pub original: Value,
    /// Decrypted, when it was encrypted
    pub decrypted: Option<Value>,
}

fn str_of(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn alias_id(alias: &str) -> Result<OwnedRoomAliasId> {
    OwnedRoomAliasId::try_from(alias).map_err(|e| Error::InvalidId(e.to_string()))
}

impl WizardClient {
    /// The room's full settings, fetched from the server (sliding sync only carries a subset).
    pub async fn room_settings(&self, room_id: &str) -> Result<RoomSettings> {
        let room = self.room(room_id)?;
        let state = self
            .sdk()
            .send(get_state_events::v3::Request::new(
                room.room_id().to_owned(),
            ))
            .await?
            .room_state;
        let events: Vec<Value> = state
            .iter()
            .filter_map(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .collect();
        let local_aliases = self
            .sdk()
            .send(aliases::v3::Request::new(room.room_id().to_owned()))
            .await
            .map(|r| r.aliases.into_iter().map(|a| a.to_string()).collect())
            .unwrap_or_default();
        let published = room
            .privacy_settings()
            .get_room_visibility()
            .await
            .map(|v| v.as_str() == "public")
            .unwrap_or(false);
        Ok(settings_from_events(
            room.room_id().as_str(),
            &events,
            local_aliases,
            published,
        ))
    }

    /// The settings as far as the local state has them, without asking the server: right away
    /// for permissions and toggles, until [`Self::room_settings`] has the rest (published flag,
    /// local addresses, state sync didn't carry).
    pub async fn local_room_settings(&self, room_id: &str) -> Result<RoomSettings> {
        use matrix_sdk::deserialized_responses::RawAnySyncOrStrippedState;
        use matrix_sdk::ruma::events::StateEventType;
        let room = self.room(room_id)?;
        let mut events = Vec::new();
        for kind in [
            "m.room.create",
            "m.room.name",
            "m.room.topic",
            "m.room.avatar",
            "m.room.join_rules",
            "m.room.history_visibility",
            "m.room.guest_access",
            "m.room.encryption",
            "m.room.canonical_alias",
            "m.room.power_levels",
            "m.room.tombstone",
        ] {
            let Ok(Some(raw)) = room.get_state_event(StateEventType::from(kind), "").await else {
                continue;
            };
            let event = match raw {
                RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked::<Value>(),
                RawAnySyncOrStrippedState::Stripped(raw) => raw.deserialize_as_unchecked::<Value>(),
            };
            if let Ok(event) = event {
                events.push(event);
            }
        }
        Ok(settings_from_events(
            room.room_id().as_str(),
            &events,
            Vec::new(),
            false,
        ))
    }
}

fn settings_from_events(
    room_id: &str,
    events: &[Value],
    local_aliases: Vec<String>,
    published: bool,
) -> RoomSettings {
    let content = |kind: &str| {
        events
            .iter()
            .find(|e| {
                e.get("type").and_then(Value::as_str) == Some(kind)
                    && e.get("state_key").and_then(Value::as_str) == Some("")
            })
            .and_then(|e| e.get("content").cloned())
            .unwrap_or_else(|| json!({}))
    };
    let create = content("m.room.create");
    let join_rules = content("m.room.join_rules");
    let aliases_content = content("m.room.canonical_alias");
    let tombstone = content("m.room.tombstone");
    let mut creators: Vec<String> = events
        .iter()
        .find(|e| e.get("type").and_then(Value::as_str) == Some("m.room.create"))
        .and_then(|e| str_of(e, "/sender"))
        .into_iter()
        .collect();
    if let Some(extra) = create.get("additional_creators").and_then(Value::as_array) {
        creators.extend(
            extra
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned),
        );
    }
    RoomSettings {
        room_id: room_id.to_owned(),
        name: str_of(&content("m.room.name"), "/name").filter(|n| !n.is_empty()),
        topic: str_of(&content("m.room.topic"), "/topic").filter(|t| !t.is_empty()),
        avatar_url: str_of(&content("m.room.avatar"), "/url"),
        is_space: create.get("type").and_then(Value::as_str) == Some("m.space"),
        room_version: str_of(&create, "/room_version").unwrap_or_else(|| "1".into()),
        join_rule: str_of(&join_rules, "/join_rule").unwrap_or_else(|| "invite".into()),
        join_allowed_spaces: join_rules
            .get("allow")
            .and_then(Value::as_array)
            .map(|allow| allow.iter().filter_map(|a| str_of(a, "/room_id")).collect())
            .unwrap_or_default(),
        history_visibility: str_of(&content("m.room.history_visibility"), "/history_visibility")
            .unwrap_or_else(|| "shared".into()),
        guest_access: str_of(&content("m.room.guest_access"), "/guest_access").as_deref()
            == Some("can_join"),
        encrypted: content("m.room.encryption").get("algorithm").is_some(),
        published,
        canonical_alias: str_of(&aliases_content, "/alias"),
        alt_aliases: aliases_content
            .get("alt_aliases")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        local_aliases,
        creators,
        federate: create
            .get("m.federate")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        power_levels: content("m.room.power_levels"),
        predecessor: str_of(&create, "/predecessor/room_id"),
        tombstone: str_of(&tombstone, "/replacement_room").map(|replacement_room| Tombstone {
            replacement_room,
            body: str_of(&tombstone, "/body").unwrap_or_default(),
        }),
    }
}

impl WizardClient {
    /// `invite`, `public`, `knock`, `restricted` or `knock_restricted` (the last two allow
    /// members of `allowed_spaces`).
    pub async fn set_join_rule(
        &self,
        room_id: &str,
        rule: &str,
        allowed_spaces: &[String],
    ) -> Result<()> {
        let mut content = json!({ "join_rule": rule });
        if rule.ends_with("restricted") {
            let allow: Vec<Value> = allowed_spaces
                .iter()
                .map(|id| json!({ "type": "m.room_membership", "room_id": id }))
                .collect();
            content["allow"] = json!(allow);
        }
        self.set_state_event(room_id, "m.room.join_rules", "", content)
            .await
    }

    /// `world_readable`, `shared`, `invited` or `joined`
    pub async fn set_history_visibility(&self, room_id: &str, visibility: &str) -> Result<()> {
        self.set_state_event(
            room_id,
            "m.room.history_visibility",
            "",
            json!({ "history_visibility": visibility }),
        )
        .await
    }

    pub async fn set_guest_access(&self, room_id: &str, allowed: bool) -> Result<()> {
        let value = if allowed { "can_join" } else { "forbidden" };
        self.set_state_event(
            room_id,
            "m.room.guest_access",
            "",
            json!({ "guest_access": value }),
        )
        .await
    }

    /// Lists the room in the server's public directory, or not.
    pub async fn set_published(&self, room_id: &str, published: bool) -> Result<()> {
        use matrix_sdk::ruma::api::client::room::Visibility;
        let visibility = if published {
            Visibility::Public
        } else {
            Visibility::Private
        };
        self.room(room_id)?
            .privacy_settings()
            .update_room_visibility(visibility)
            .await?;
        Ok(())
    }

    /// Turns on end-to-end encryption (it can't be turned off).
    pub async fn enable_encryption(&self, room_id: &str) -> Result<()> {
        self.room(room_id)?.enable_encryption().await?;
        Ok(())
    }

    pub async fn set_room_avatar(
        &self,
        room_id: &str,
        data: Vec<u8>,
        mimetype: &str,
    ) -> Result<()> {
        let mime: mime::Mime = mimetype
            .parse()
            .map_err(|_| Error::InvalidId("unknown image type".into()))?;
        self.room(room_id)?.upload_avatar(&mime, data, None).await?;
        Ok(())
    }

    pub async fn remove_room_avatar(&self, room_id: &str) -> Result<()> {
        self.room(room_id)?.remove_avatar().await?;
        Ok(())
    }

    /// Creates `#local:server` pointing at the room.
    pub async fn add_room_alias(&self, room_id: &str, alias: &str) -> Result<()> {
        let request =
            create_alias::v3::Request::new(alias_id(alias)?, parse_room_id(room_id)?.to_owned());
        self.sdk().send(request).await?;
        Ok(())
    }

    pub async fn remove_room_alias(&self, alias: &str) -> Result<()> {
        self.sdk()
            .send(delete_alias::v3::Request::new(alias_id(alias)?))
            .await?;
        Ok(())
    }

    /// Sets the main address and the other published ones.
    pub async fn set_canonical_alias(
        &self,
        room_id: &str,
        alias: Option<&str>,
        alt_aliases: &[String],
    ) -> Result<()> {
        let mut content = json!({ "alt_aliases": alt_aliases });
        if let Some(alias) = alias {
            alias_id(alias)?;
            content["alias"] = json!(alias);
        }
        self.set_state_event(room_id, "m.room.canonical_alias", "", content)
            .await
    }

    /// Replaces the power levels with this content (edit what `room_settings` returned).
    pub async fn set_power_levels(&self, room_id: &str, content: Value) -> Result<()> {
        self.set_state_event(room_id, "m.room.power_levels", "", content)
            .await
    }

    /// Moves the room to a new room version; returns the new room's id.
    pub async fn upgrade_room(&self, room_id: &str, version: &str) -> Result<String> {
        let version =
            RoomVersionId::try_from(version).map_err(|e| Error::InvalidId(e.to_string()))?;
        let request = upgrade_room::v3::Request::new(parse_room_id(room_id)?.to_owned(), version);
        Ok(self.sdk().send(request).await?.replacement_room.to_string())
    }

    pub async fn server_capabilities(&self) -> Result<ServerCapabilities> {
        let caps = self
            .sdk()
            .send(get_capabilities::v3::Request::new())
            .await?
            .capabilities;
        let mut room_versions: Vec<(String, String)> = caps
            .room_versions
            .available
            .iter()
            .map(|(version, stability)| (version.to_string(), stability.as_str().to_owned()))
            .collect();
        room_versions.sort_by(|a, b| {
            let n = |v: &str| v.parse::<u32>().unwrap_or(u32::MAX);
            n(&a.0).cmp(&n(&b.0)).then(a.0.cmp(&b.0))
        });
        let upload_size = self
            .sdk()
            .load_or_fetch_max_upload_size()
            .await
            .ok()
            .map(u64::from);
        Ok(ServerCapabilities {
            default_room_version: caps.room_versions.default.to_string(),
            room_versions,
            change_password: caps.change_password.enabled,
            change_3pid: caps.thirdparty_id_changes.enabled,
            upload_size,
        })
    }

    /// Banned users, people knocking, or invited ones: `ban`, `knock` or `invite`.
    pub async fn members_in_state(
        &self,
        room_id: &str,
        membership: &str,
    ) -> Result<Vec<MemberEntry>> {
        let filter = match membership {
            "ban" => RoomMemberships::BAN,
            "knock" => RoomMemberships::KNOCK,
            "invite" => RoomMemberships::INVITE,
            _ => RoomMemberships::LEAVE,
        };
        let room = self.room(room_id)?;
        Ok(room
            .members(filter)
            .await?
            .into_iter()
            .map(|m| MemberEntry {
                user_id: m.user_id().to_string(),
                display_name: m.display_name().map(ToOwned::to_owned),
                avatar_url: m.avatar_url().map(ToString::to_string),
                reason: m.event().reason().map(ToOwned::to_owned),
            })
            .collect())
    }

    pub async fn unban(&self, room_id: &str, user_id: &str, reason: Option<&str>) -> Result<()> {
        self.room(room_id)?
            .unban_user(parse_user_id(user_id)?, reason)
            .await?;
        Ok(())
    }

    /// Lets someone who knocked in (an invite).
    pub async fn accept_knock(&self, room_id: &str, user_id: &str) -> Result<()> {
        self.room(room_id)?
            .invite_user_by_id(parse_user_id(user_id)?)
            .await?;
        Ok(())
    }

    pub async fn reject_knock(
        &self,
        room_id: &str,
        user_id: &str,
        reason: Option<&str>,
    ) -> Result<()> {
        self.room(room_id)?
            .kick_user(parse_user_id(user_id)?, reason)
            .await?;
        Ok(())
    }

    /// Asks to join a room or space that allows knocking.
    pub async fn knock(
        &self,
        room_id_or_alias: &str,
        reason: Option<&str>,
        via: &[String],
    ) -> Result<String> {
        let target = OwnedRoomOrAliasId::try_from(room_id_or_alias)
            .map_err(|e| Error::InvalidId(e.to_string()))?;
        let via = via
            .iter()
            .filter_map(|s| OwnedServerName::try_from(s.as_str()).ok())
            .collect();
        let room = self
            .sdk()
            .knock(target, reason.map(ToOwned::to_owned), via)
            .await?;
        Ok(room.room_id().to_string())
    }

    /// Reports a message to the homeserver's admins.
    pub async fn report_event(
        &self,
        room_id: &str,
        event_id: &str,
        reason: Option<&str>,
    ) -> Result<()> {
        // ruma dropped `score`, which the original client sent (-100: most offensive)
        let event_id =
            OwnedEventId::try_from(event_id).map_err(|e| Error::InvalidId(e.to_string()))?;
        let room = self.room(room_id)?;
        let mut url = self.sdk().homeserver();
        url.path_segments_mut()
            .map_err(|_| Error::Sdk("invalid homeserver URL".into()))?
            .pop_if_empty()
            .extend([
                "_matrix",
                "client",
                "v3",
                "rooms",
                room.room_id().as_str(),
                "report",
                event_id.as_str(),
            ]);
        let mut body = serde_json::json!({ "score": -100 });
        if let Some(reason) = reason {
            body["reason"] = serde_json::json!(reason);
        }
        let response = reqwest::Client::new()
            .post(url)
            .bearer_auth(self.sdk().access_token().unwrap_or_default())
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await.unwrap_or_default();
            return Err(Error::Matrix {
                errcode: error["errcode"].as_str().unwrap_or("M_UNKNOWN").to_owned(),
                message: error["error"]
                    .as_str()
                    .unwrap_or("the report was refused")
                    .to_owned(),
            });
        }
        Ok(())
    }

    pub async fn report_room(&self, room_id: &str, reason: &str) -> Result<()> {
        self.room(room_id)?.report_room(reason.to_owned()).await?;
        Ok(())
    }

    /// The highest role a member can be given (own level), for role pickers.
    pub async fn suggested_role(&self, room_id: &str, user_id: &str) -> Result<String> {
        let member = self
            .room(room_id)?
            .get_member(parse_user_id(user_id)?)
            .await?
            .ok_or_else(|| Error::InvalidId("not a member".into()))?;
        Ok(match member.suggested_role_for_power_level() {
            RoomMemberRole::Creator => "creator",
            RoomMemberRole::Administrator => "admin",
            RoomMemberRole::Moderator => "moderator",
            RoomMemberRole::User => "user",
        }
        .to_owned())
    }

    /// One state event's content from the server, if set.
    pub async fn state_event(
        &self,
        room_id: &str,
        event_type: &str,
        state_key: &str,
    ) -> Result<Option<Value>> {
        let request = get_state_event_for_key::v3::Request::new(
            parse_room_id(room_id)?.to_owned(),
            event_type.into(),
            state_key.to_owned(),
        );
        match self.sdk().send(request).await {
            Ok(response) => Ok(
                serde_json::from_str::<Value>(response.event_or_content.get())
                    .ok()
                    .filter(|c| c.as_object().is_some_and(|o| !o.is_empty())),
            ),
            Err(e)
                if matches!(
                    e.client_api_error_kind(),
                    Some(matrix_sdk::ruma::api::error::ErrorKind::NotFound)
                ) =>
            {
                Ok(None)
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Every state event of a type (all state keys), e.g. emoji packs.
    pub async fn state_events_of_type(
        &self,
        room_id: &str,
        event_type: &str,
    ) -> Result<Vec<(String, Value)>> {
        Ok(self
            .state_events_of_types(room_id, &[event_type.to_owned()])
            .await?
            .into_iter()
            .map(|(_, state_key, content)| (state_key, content))
            .collect())
    }

    pub async fn state_events_of_types(
        &self,
        room_id: &str,
        event_types: &[String],
    ) -> Result<Vec<(String, String, Value)>> {
        let room_id = parse_room_id(room_id)?;
        let joined = self
            .sdk()
            .get_room(room_id)
            .filter(|room| room.state() == RoomState::Joined);
        if let Some(room) = joined {
            if event_types
                .iter()
                .all(|t| SYNCED_STATE_TYPES.contains(&t.as_str()))
            {
                return Ok(local_state_events(&room, event_types).await);
            }
        }
        let request = get_state_events::v3::Request::new(room_id.to_owned());
        Ok(self
            .sdk()
            .send(request)
            .await?
            .room_state
            .iter()
            .filter_map(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .filter_map(|e| state_entry(&e, event_types))
            .collect())
    }

    /// The room's whole current state from the server, as full events
    pub async fn room_state(&self, room_id: &str) -> Result<Vec<Value>> {
        let request = get_state_events::v3::Request::new(parse_room_id(room_id)?.to_owned());
        Ok(self
            .sdk()
            .send(request)
            .await?
            .room_state
            .iter()
            .filter_map(|raw| serde_json::from_str::<Value>(raw.json().get()).ok())
            .collect())
    }

    pub async fn set_state_event(
        &self,
        room_id: &str,
        event_type: &str,
        state_key: &str,
        content: Value,
    ) -> Result<()> {
        self.room(room_id)?
            .send_state_event_raw(event_type, state_key, content)
            .await?;
        Ok(())
    }

    /// Sends any message-like event (custom types, forwarding).
    pub async fn send_event(
        &self,
        room_id: &str,
        event_type: &str,
        content: Value,
    ) -> Result<String> {
        let response = self.room(room_id)?.send_raw(event_type, content).await?;
        Ok(response.response.event_id.to_string())
    }

    /// Uploads a file to the media repository; returns its `mxc://` URI.
    pub async fn upload_media(&self, data: Vec<u8>, mimetype: &str) -> Result<String> {
        let mime: mime::Mime = mimetype.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);
        let response = self.sdk().media().upload(&mime, data, None).await?;
        Ok(response.content_uri.to_string())
    }

    /// The event as stored and, for encrypted ones, decrypted.
    pub async fn event_source(&self, room_id: &str, event_id: &str) -> Result<EventSource> {
        let room = self.room(room_id)?;
        let event_id =
            OwnedEventId::try_from(event_id).map_err(|e| Error::InvalidId(e.to_string()))?;
        let request = get_room_event::v3::Request::new(room.room_id().to_owned(), event_id.clone());
        let original: Value = self
            .sdk()
            .send(request)
            .await?
            .event
            .deserialize_as_unchecked()
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let decrypted = if original.get("type").and_then(Value::as_str) == Some("m.room.encrypted")
        {
            room.event(&event_id, None)
                .await
                .ok()
                .and_then(|e| e.raw().deserialize_as_unchecked::<Value>().ok())
        } else {
            None
        };
        Ok(EventSource {
            room_id: room.room_id().to_string(),
            event_id: event_id.to_string(),
            original,
            decrypted,
        })
    }

    /// Sends a copy of a message to another room (without its replies, threads or edits).
    pub async fn forward_event(
        &self,
        from_room_id: &str,
        event_id: &str,
        to_room_id: &str,
    ) -> Result<()> {
        let source = self.event_source(from_room_id, event_id).await?;
        let event = source.decrypted.unwrap_or(source.original);
        let event_type =
            str_of(&event, "/type").ok_or_else(|| Error::InvalidId("no event type".into()))?;
        let mut content = event.get("content").cloned().unwrap_or_else(|| json!({}));
        if let Some(obj) = content.as_object_mut() {
            obj.remove("m.relates_to");
            obj.remove("m.new_content");
            if let Some(Value::Object(mentions)) = obj.get_mut("m.mentions") {
                mentions.clear();
            }
        }
        self.send_event(to_room_id, &event_type, content).await?;
        Ok(())
    }
}

/// A room tag with its sort order (favourites, low priority, custom `u.*` tags)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomTag {
    pub name: String,
    pub order: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAlias {
    pub room_id: String,
    pub servers: Vec<String>,
}

/// A state change seen in sync, so cached settings can be refreshed
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct StateChange {
    pub room_id: String,
    pub event_type: String,
    pub state_key: String,
}

impl WizardClient {
    pub async fn room_tags(&self, room_id: &str) -> Result<Vec<RoomTag>> {
        let tags = self
            .room(room_id)?
            .tags()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(tags
            .unwrap_or_default()
            .into_iter()
            .map(|(name, info)| RoomTag {
                name: name.to_string(),
                order: info.order,
            })
            .collect())
    }

    /// Favourites the room at a position (`order` between 0 and 1, lower first).
    pub async fn set_favourite_order(&self, room_id: &str, order: Option<f64>) -> Result<()> {
        use matrix_sdk::ruma::events::tag::{TagInfo, TagName};
        let mut info = TagInfo::new();
        info.order = order;
        self.room(room_id)?.set_tag(TagName::Favorite, info).await?;
        Ok(())
    }

    /// Per-room account data (e.g. `org.matrix.msc3230.space_order` on a space).
    pub async fn room_account_data(
        &self,
        room_id: &str,
        event_type: &str,
    ) -> Result<Option<Value>> {
        let raw = self.room(room_id)?.account_data(event_type.into()).await?;
        Ok(raw
            .and_then(|raw| raw.deserialize_as_unchecked::<Value>().ok())
            .and_then(|event| event.get("content").cloned()))
    }

    pub async fn set_room_account_data(
        &self,
        room_id: &str,
        event_type: &str,
        content: Value,
    ) -> Result<()> {
        let raw = matrix_sdk::ruma::serde::Raw::new(&content)
            .map_err(|e| Error::Sdk(e.to_string()))?
            .cast_unchecked();
        self.room(room_id)?
            .set_account_data_raw(event_type.into(), raw)
            .await?;
        Ok(())
    }

    /// Looks up which room an address (`#name:server`) points at.
    pub async fn resolve_alias(&self, alias: &str) -> Result<ResolvedAlias> {
        let response = self.sdk().resolve_room_alias(&alias_id(alias)?).await?;
        Ok(ResolvedAlias {
            room_id: response.room_id.to_string(),
            servers: response
                .servers
                .into_iter()
                .map(|s| s.to_string())
                .collect(),
        })
    }

    pub async fn event_at_time(&self, room_id: &str, timestamp: u64) -> Result<Option<String>> {
        use matrix_sdk::ruma::{
            api::{client::room::get_event_by_timestamp, Direction},
            MilliSecondsSinceUnixEpoch, UInt,
        };
        let room_id = parse_room_id(room_id)?.to_owned();
        let ts = MilliSecondsSinceUnixEpoch(UInt::new_saturating(timestamp));
        for dir in [Direction::Forward, Direction::Backward] {
            let request = get_event_by_timestamp::v1::Request::new(room_id.clone(), ts, dir);
            if let Ok(response) = self.sdk().send(request).await {
                return Ok(Some(response.event_id.to_string()));
            }
        }
        Ok(None)
    }

    /// Reports state changes arriving through sync, for refreshing cached settings.
    pub async fn watch_state_changes(&self, mut on_change: impl FnMut(StateChange)) {
        use futures_util::StreamExt;
        use matrix_sdk::ruma::events::AnySyncStateEvent;
        let (sender, mut receiver) = futures_channel::mpsc::unbounded::<StateChange>();
        let handle = self.sdk().add_event_handler(
            move |raw: matrix_sdk::ruma::serde::Raw<AnySyncStateEvent>, room: matrix_sdk::Room| {
                let sender = sender.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    let _ = sender.unbounded_send(StateChange {
                        room_id: room.room_id().to_string(),
                        event_type: str_of(&event, "/type").unwrap_or_default(),
                        state_key: str_of(&event, "/state_key").unwrap_or_default(),
                    });
                }
            },
        );
        let _guard = self.sdk().event_handler_drop_guard(handle);
        while let Some(change) = receiver.next().await {
            on_change(change);
        }
    }
}

impl WizardClient {
    /// Encrypts and uploads a file for use in an encrypted room; returns the `file` object
    /// (`EncryptedFile` JSON with its `mxc://` URL) to put in message content.
    pub async fn upload_encrypted_media(&self, data: Vec<u8>) -> Result<Value> {
        let mut reader = std::io::Cursor::new(data);
        let file = self
            .sdk()
            .upload_encrypted_file(&mut reader)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        serde_json::to_value(file).map_err(|e| Error::Sdk(e.to_string()))
    }
}

impl WizardClient {
    /// Whether the server lets the user set an extended profile field (MSC4133): it must support
    /// extended profiles, and its `m.profile_fields` capability must allow the field.
    pub async fn can_set_profile_field(&self, field: &str) -> Result<bool> {
        let versions = self.sdk().server_versions().await?;
        let unstable = self.sdk().unstable_features().await?;
        let supported = versions.iter().any(|v| v.as_str() == Some("v1.16"))
            || unstable
                .iter()
                .any(|f| matches!(f.as_ref(), "uk.tcpip.msc4133" | "uk.tcpip.msc4133.stable"));
        if !supported {
            return Ok(false);
        }
        let Ok(response) = self.sdk().send(get_capabilities::v3::Request::new()).await else {
            return Ok(true);
        };
        let caps = response.capabilities;
        let Some(cap) = caps
            .get("m.profile_fields")
            .or_else(|| caps.get("uk.tcpip.msc4133.profile_fields"))
        else {
            return Ok(true);
        };
        if cap.get("enabled").and_then(Value::as_bool) == Some(false) {
            return Ok(false);
        }
        let listed = |key: &str| {
            cap.get(key)
                .and_then(Value::as_array)
                .map(|fields| fields.iter().any(|f| f.as_str() == Some(field)))
        };
        if let Some(allowed) = listed("allowed") {
            return Ok(allowed);
        }
        Ok(listed("disallowed") != Some(true))
    }

    /// The loaded messages (text, media, stickers, undecryptable ones) a user sent in a room and
    /// that aren't deleted yet, newest last: what "remove recent messages" deletes.
    pub async fn recent_user_messages(&self, room_id: &str, user_id: &str) -> Result<Vec<String>> {
        let room = self.room(room_id)?;
        let user = parse_user_id(user_id)?;
        let (cache, _handles) = room
            .event_cache()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let events = cache
            .events()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        Ok(events
            .iter()
            .filter_map(|event| {
                let value = event.raw().deserialize_as_unchecked::<Value>().ok()?;
                let kind = str_of(&value, "/type")?;
                let removable = matches!(
                    kind.as_str(),
                    "m.room.message" | "m.sticker" | "m.room.encrypted"
                );
                (removable
                    && str_of(&value, "/sender").as_deref() == Some(user.as_str())
                    && value.pointer("/unsigned/redacted_because").is_none())
                .then(|| str_of(&value, "/event_id"))
                .flatten()
            })
            .collect())
    }

    /// Deletes these events (all at once); fails if any of them couldn't be deleted.
    pub async fn redact_events(
        &self,
        room_id: &str,
        event_ids: &[String],
        reason: Option<&str>,
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let ids = event_ids
            .iter()
            .map(|id| {
                OwnedEventId::try_from(id.as_str()).map_err(|e| Error::InvalidId(e.to_string()))
            })
            .collect::<Result<Vec<_>>>()?;
        let results =
            futures_util::future::join_all(ids.iter().map(|id| room.redact(id, reason, None)))
                .await;
        for result in results {
            result?;
        }
        Ok(())
    }
}
