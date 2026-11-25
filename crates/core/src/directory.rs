use matrix_sdk::ruma::{
    api::client::directory::get_public_rooms_filtered::v3::Request as PublicRoomsRequest,
    directory::Filter, room::RoomType, ServerName, UInt,
};
use serde::Serialize;

use crate::{Error, Result, WizardClient};

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PublicRoom {
    pub id: String,
    pub alias: Option<String>,
    pub name: Option<String>,
    pub topic: Option<String>,
    pub avatar_url: Option<String>,
    pub member_count: u64,
    pub is_space: bool,
    pub join_rule: Option<String>,
    pub world_readable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UserResult {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

impl WizardClient {
    /// Searches a server's public room directory (the user's own server by default).
    pub async fn search_public_rooms(
        &self,
        query: &str,
        server: Option<&str>,
        limit: u32,
    ) -> Result<Vec<PublicRoom>> {
        let mut request = PublicRoomsRequest::new();
        let mut filter = Filter::new();
        filter.generic_search_term = Some(query.to_owned()).filter(|q| !q.trim().is_empty());
        request.filter = filter;
        request.limit = Some(UInt::from(limit));
        request.server = server
            .map(|s| {
                <&ServerName>::try_from(s)
                    .map(ToOwned::to_owned)
                    .map_err(|e| Error::InvalidId(e.to_string()))
            })
            .transpose()?;
        let response = self.sdk().public_rooms_filtered(request).await?;
        Ok(response
            .chunk
            .into_iter()
            .map(|room| PublicRoom {
                id: room.room_id.to_string(),
                alias: room.canonical_alias.map(|a| a.to_string()),
                name: room.name,
                topic: room.topic,
                avatar_url: room.avatar_url.map(|u| u.to_string()),
                member_count: room.num_joined_members.into(),
                is_space: room.room_type == Some(RoomType::Space),
                join_rule: Some(room.join_rule.as_str().to_owned()),
                world_readable: room.world_readable,
            })
            .collect())
    }

    /// What a room or space looks like before joining, from its ID or address.
    pub async fn room_preview(&self, id_or_alias: &str, via: &[String]) -> Result<PublicRoom> {
        use matrix_sdk::ruma::{OwnedServerName, RoomOrAliasId};
        let target =
            <&RoomOrAliasId>::try_from(id_or_alias).map_err(|e| Error::InvalidId(e.to_string()))?;
        let mut servers: Vec<OwnedServerName> = via
            .iter()
            .filter_map(|s| s.as_str().try_into().ok())
            .collect();
        if servers.is_empty() {
            if let Some(server) = target.server_name() {
                servers.push(server.to_owned());
            }
        }
        let preview = self.sdk().get_room_preview(target, servers).await?;
        Ok(PublicRoom {
            id: preview.room_id.to_string(),
            alias: preview.canonical_alias.map(|a| a.to_string()),
            name: preview.name,
            topic: preview.topic,
            avatar_url: preview.avatar_url.map(|u| u.to_string()),
            member_count: preview.num_joined_members,
            is_space: preview.room_type == Some(RoomType::Space),
            join_rule: preview.join_rule.map(|r| r.as_str().to_owned()),
            world_readable: preview.is_world_readable.unwrap_or(false),
        })
    }

    /// Searches the user directory, for starting chats and inviting.
    pub async fn search_users(&self, query: &str, limit: u32) -> Result<Vec<UserResult>> {
        let response = self.sdk().search_users(query, limit.into()).await?;
        Ok(response
            .results
            .into_iter()
            .map(|user| UserResult {
                user_id: user.user_id.to_string(),
                display_name: user.display_name,
                avatar_url: user.avatar_url.map(|u| u.to_string()),
            })
            .collect())
    }
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PublicRoomsPage {
    pub rooms: Vec<PublicRoom>,
    /// Pass back to load more
    pub next: Option<String>,
    pub total: Option<u64>,
}

impl WizardClient {
    /// A page of a server's room directory; `kind` narrows to `spaces` or `rooms`.
    pub async fn public_rooms_page(
        &self,
        query: &str,
        server: Option<&str>,
        kind: Option<&str>,
        limit: u32,
        since: Option<&str>,
    ) -> Result<PublicRoomsPage> {
        use matrix_sdk::ruma::directory::RoomTypeFilter;
        let mut request = PublicRoomsRequest::new();
        let mut filter = Filter::new();
        filter.generic_search_term = Some(query.to_owned()).filter(|q| !q.trim().is_empty());
        filter.room_types = match kind {
            Some("spaces") => vec![RoomTypeFilter::Space],
            Some("rooms") => vec![RoomTypeFilter::Default],
            _ => Vec::new(),
        };
        request.filter = filter;
        request.limit = Some(UInt::from(limit));
        request.since = since.map(ToOwned::to_owned);
        request.server = server
            .map(|s| {
                <&ServerName>::try_from(s)
                    .map(ToOwned::to_owned)
                    .map_err(|e| Error::InvalidId(e.to_string()))
            })
            .transpose()?;
        let response = self.sdk().public_rooms_filtered(request).await?;
        Ok(PublicRoomsPage {
            rooms: response
                .chunk
                .into_iter()
                .map(|room| PublicRoom {
                    id: room.room_id.to_string(),
                    alias: room.canonical_alias.map(|a| a.to_string()),
                    name: room.name,
                    topic: room.topic,
                    avatar_url: room.avatar_url.map(|u| u.to_string()),
                    member_count: room.num_joined_members.into(),
                    is_space: room.room_type == Some(RoomType::Space),
                    join_rule: Some(room.join_rule.as_str().to_owned()),
                    world_readable: room.world_readable,
                })
                .collect(),
            next: response.next_batch,
            total: response.total_room_count_estimate.map(u64::from),
        })
    }
}
