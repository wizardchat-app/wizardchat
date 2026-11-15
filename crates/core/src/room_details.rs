use matrix_sdk::{
    ruma::events::{room::power_levels::UserPowerLevel, StateEventType},
    EncryptionState, Room, RoomMemberships,
};
use serde::Serialize;

use crate::{Result, WizardClient};

/// What the user may do in a room, for showing or hiding actions
#[derive(Clone, Debug, Default, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomPermissions {
    pub invite: bool,
    pub kick: bool,
    pub ban: bool,
    pub redact_others: bool,
    pub change_name: bool,
    pub change_topic: bool,
    pub change_avatar: bool,
    pub change_permissions: bool,
    pub pin: bool,
    pub manage_widgets: bool,
    pub enable_encryption: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RoomDetails {
    pub id: String,
    pub name: Option<String>,
    pub topic: Option<String>,
    pub avatar_url: Option<String>,
    pub canonical_alias: Option<String>,
    pub is_encrypted: bool,
    pub is_public: bool,
    pub is_direct: bool,
    pub is_space: bool,
    pub is_favourite: bool,
    pub member_count: u64,
    /// Pinned messages, oldest first
    pub pinned_event_ids: Vec<String>,
    /// `None` for the room's creators, who outrank everyone (room v12)
    pub own_power_level: Option<i64>,
    pub permissions: RoomPermissions,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    /// `None` for creators
    pub power_level: Option<i64>,
    pub is_invite: bool,
}

fn level(level: UserPowerLevel) -> Option<i64> {
    match level {
        UserPowerLevel::Infinite => None,
        UserPowerLevel::Int(value) => Some(value.into()),
        _ => None,
    }
}

async fn details_of(room: &Room) -> RoomDetails {
    let own_id = room.own_user_id().to_owned();
    let power_levels = room.power_levels().await.ok();
    let permissions = power_levels
        .as_ref()
        .map(|pl| RoomPermissions {
            invite: pl.user_can_invite(&own_id),
            kick: pl.user_can_kick(&own_id),
            ban: pl.user_can_ban(&own_id),
            redact_others: pl.user_can_redact_event_of_other(&own_id),
            change_name: pl.user_can_send_state(&own_id, StateEventType::RoomName),
            change_topic: pl.user_can_send_state(&own_id, StateEventType::RoomTopic),
            change_avatar: pl.user_can_send_state(&own_id, StateEventType::RoomAvatar),
            change_permissions: pl.user_can_send_state(&own_id, StateEventType::RoomPowerLevels),
            pin: pl.user_can_send_state(&own_id, StateEventType::RoomPinnedEvents),
            manage_widgets: pl
                .user_can_send_state(&own_id, StateEventType::from(crate::widgets::WIDGET_EVENT)),
            enable_encryption: pl.user_can_send_state(&own_id, StateEventType::RoomEncryption),
        })
        .unwrap_or_default();
    let is_encrypted = matches!(
        room.latest_encryption_state().await,
        Ok(EncryptionState::Encrypted)
    );
    RoomDetails {
        id: room.room_id().to_string(),
        name: crate::rooms::room_name(room),
        topic: room.topic(),
        avatar_url: room.avatar_url().map(|u| u.to_string()),
        canonical_alias: room.canonical_alias().map(|a| a.to_string()),
        is_encrypted,
        is_public: room.is_public().unwrap_or(false),
        is_direct: room.direct_targets_length() > 0,
        is_space: room.is_space(),
        is_favourite: room.is_favourite(),
        member_count: room.joined_members_count(),
        pinned_event_ids: room
            .pinned_event_ids()
            .unwrap_or_default()
            .iter()
            .map(ToString::to_string)
            .collect(),
        own_power_level: power_levels
            .as_ref()
            .and_then(|pl| level(pl.for_user(&own_id))),
        permissions,
    }
}

impl WizardClient {
    pub async fn room_details(&self, room_id: &str) -> Result<RoomDetails> {
        Ok(details_of(&self.room(room_id)?).await)
    }

    /// Reports the room's details now and whenever its state changes.
    pub async fn watch_room_details(
        &self,
        room_id: &str,
        mut on_change: impl FnMut(RoomDetails),
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let mut info = room.subscribe_info();
        on_change(details_of(&room).await);
        while info.next().await.is_some() {
            on_change(details_of(&room).await);
        }
        Ok(())
    }

    /// Joined and invited members, highest power level first.
    pub async fn members(&self, room_id: &str) -> Result<Vec<Member>> {
        let room = self.room(room_id)?;
        let power_levels = room.power_levels().await.ok();
        let mut members: Vec<Member> = room
            .members(RoomMemberships::JOIN | RoomMemberships::INVITE)
            .await?
            .into_iter()
            .map(|member| Member {
                user_id: member.user_id().to_string(),
                display_name: member.display_name().map(ToOwned::to_owned),
                avatar_url: member.avatar_url().map(ToString::to_string),
                power_level: power_levels
                    .as_ref()
                    .and_then(|pl| level(pl.for_user(member.user_id()))),
                is_invite: *member.membership()
                    == matrix_sdk::ruma::events::room::member::MembershipState::Invite,
            })
            .collect();
        members.sort_by(|a, b| {
            let rank = |m: &Member| {
                (
                    m.is_invite,
                    std::cmp::Reverse(m.power_level.unwrap_or(i64::MAX)),
                )
            };
            rank(a).cmp(&rank(b)).then_with(|| {
                let name = |m: &Member| {
                    m.display_name
                        .clone()
                        .unwrap_or_else(|| m.user_id.clone())
                        .to_lowercase()
                };
                name(a).cmp(&name(b))
            })
        });
        Ok(members)
    }

    pub async fn kick(&self, room_id: &str, user_id: &str, reason: Option<&str>) -> Result<()> {
        Ok(self
            .room(room_id)?
            .kick_user(crate::rooms::parse_user_id(user_id)?, reason)
            .await?)
    }

    pub async fn ban(&self, room_id: &str, user_id: &str, reason: Option<&str>) -> Result<()> {
        Ok(self
            .room(room_id)?
            .ban_user(crate::rooms::parse_user_id(user_id)?, reason)
            .await?)
    }

    pub async fn set_room_name(&self, room_id: &str, name: &str) -> Result<()> {
        self.room(room_id)?.set_name(name.to_owned()).await?;
        Ok(())
    }

    pub async fn set_room_topic(&self, room_id: &str, topic: &str) -> Result<()> {
        self.room(room_id)?.set_room_topic(topic).await?;
        Ok(())
    }
}
