//! `WizardClient`: session, sync, rooms, timelines and media

use serde::Deserialize;

use super::{Bytes, Handle, Listener, RoomListSubscription, Subscription};
use crate::{
    CreateRoomOptions, InviteInfo, ListDiff, LoadState, Member, PublicRoom, RoomDetails,
    RoomSummary, RoomTimeline, Session, SpaceChild, SpaceSummary, SyncState, UserResult,
    WizardClient,
};

/// Which part of a room a timeline shows
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
pub enum TimelineKind {
    Main,
    #[serde(rename_all = "camelCase")]
    Thread {
        root_event_id: String,
    },
    Pinned,
    /// Around one event (jump to a message)
    #[serde(rename_all = "camelCase")]
    Event {
        event_id: String,
    },
}

impl From<TimelineKind> for crate::TimelineKind {
    fn from(kind: TimelineKind) -> Self {
        match kind {
            TimelineKind::Main => crate::TimelineKind::Main,
            TimelineKind::Thread { root_event_id } => crate::TimelineKind::Thread { root_event_id },
            TimelineKind::Pinned => crate::TimelineKind::Pinned,
            TimelineKind::Event { event_id } => crate::TimelineKind::Event { event_id },
        }
    }
}

rpc_methods! {
    WizardClient(this: WizardClient) {
        prop fn session() -> Session {
            this.session()
        }

        prop fn userId() -> Option<String> {
            Ok(this.user_id())
        }

        call fn startSync() -> () {
            this.start_sync().await
        }

        call fn stopSync() -> () {
            this.stop_sync().await;
            Ok(())
        }

        /// Calls `listener` with the sync state now and on every change.
        watch fn watchSyncState(listener: Listener<SyncState>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                if let Err(error) = client.watch_sync_state(|state| events.emit(&state)).await {
                    tracing::error!("sync state stream failed: {error}");
                }
            }))
        }

        /// Calls `listener` with how far the account has loaded (cached data, then the first sync).
        watch fn watchLoadState(listener: Listener<LoadState>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                if let Err(error) = client.watch_load_state(|state| events.emit(&state)).await {
                    tracing::error!("load state stream failed: {error}");
                }
            }))
        }

        /// Account data as this device stored it at the last sync (no request to the server).
        call fn cachedAccountData(event_type: String) -> Option<serde_json::Value> {
            this.cached_account_data(&event_type).await
        }

        /// Hands over a session another tab on the same store saved after refreshing its tokens.
        call fn adoptSession(session: Session) -> () {
            this.adopt_session(&session);
            Ok(())
        }

        /// Calls `listener` with room list diffs, starting with the current list.
        watch fn watchRooms(page_size: usize, listener: Listener<Vec<ListDiff<RoomSummary>>>) -> RoomListSubscription {
            let client = this.clone();
            let events = listener.clone();
            let (sender, receiver) = futures_channel::mpsc::unbounded();
            let future = async move {
                if let Err(error) = client
                    .watch_rooms(page_size, receiver, |diffs| events.emit(&diffs))
                    .await
                {
                    tracing::error!("room list stream failed: {error}");
                }
            };
            Ok(listener.watch_room_list(future, super::RoomList(sender)))
        }

        /// Calls `listener` with diffs of the top-level joined spaces.
        watch fn watchSpaces(listener: Listener<Vec<ListDiff<SpaceSummary>>>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                client.watch_spaces(|diffs| events.emit(&diffs)).await;
            }))
        }

        call fn spaceChildren(space_id: String) -> Vec<SpaceChild> {
            this.space_children(&space_id).await
        }

        /// Joins by room ID or alias; resolves to the room ID.
        call fn join(id_or_alias: String, via: Option<Vec<String>>) -> String {
            this.join(&id_or_alias, &via.unwrap_or_default()).await
        }

        call fn leave(room_id: String) -> () {
            this.leave(&room_id).await
        }

        call fn acceptInvite(room_id: String) -> () {
            this.accept_invite(&room_id).await
        }

        call fn declineInvite(room_id: String) -> () {
            this.decline_invite(&room_id).await
        }

        call fn inviteInfo(room_id: String) -> InviteInfo {
            this.invite_info(&room_id).await
        }

        /// Creates a room or space; resolves to its ID.
        call fn createRoom(options: CreateRoomOptions) -> String {
            this.create_room_with(options).await
        }

        /// Opens or creates the direct chat with a user; resolves to the room ID.
        call fn startDm(user_id: String) -> String {
            this.start_dm(&user_id).await
        }

        call fn invite(room_id: String, user_id: String) -> () {
            this.invite(&room_id, &user_id).await
        }

        call fn setFavourite(room_id: String, favourite: bool) -> () {
            this.set_favourite(&room_id, favourite).await
        }

        call fn setMarkedUnread(room_id: String, unread: bool) -> () {
            this.set_marked_unread(&room_id, unread).await
        }

        call fn roomDetails(room_id: String) -> RoomDetails {
            this.room_details(&room_id).await
        }

        /// Calls `listener` with the room's details now and on every change.
        watch fn watchRoomDetails(room_id: String, listener: Listener<RoomDetails>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                if let Err(error) = client
                    .watch_room_details(&room_id, |details| events.emit(&details))
                    .await
                {
                    tracing::error!("room details stream failed: {error}");
                }
            }))
        }

        call fn members(room_id: String) -> Vec<Member> {
            this.members(&room_id).await
        }

        call fn kick(room_id: String, user_id: String, reason: Option<String>) -> () {
            this.kick(&room_id, &user_id, reason.as_deref()).await
        }

        call fn ban(room_id: String, user_id: String, reason: Option<String>) -> () {
            this.ban(&room_id, &user_id, reason.as_deref()).await
        }

        call fn setRoomName(room_id: String, name: String) -> () {
            this.set_room_name(&room_id, &name).await
        }

        call fn setRoomTopic(room_id: String, topic: String) -> () {
            this.set_room_topic(&room_id, &topic).await
        }

        call fn searchPublicRooms(query: String, server: Option<String>, limit: Option<u32>) -> Vec<PublicRoom> {
            this.search_public_rooms(&query, server.as_deref(), limit.unwrap_or(30)).await
        }

        call fn searchUsers(query: String, limit: Option<u32>) -> Vec<UserResult> {
            this.search_users(&query, limit.unwrap_or(20)).await
        }

        /// A thread's or the pinned messages' timeline (or the main one).
        call fn timelineOf(room_id: String, kind: TimelineKind) -> Handle<RoomTimeline> {
            Ok(Handle::new(this.timeline_of(&room_id, kind.into()).await?))
        }

        call fn timeline(room_id: String) -> Handle<RoomTimeline> {
            Ok(Handle::new(this.timeline(&room_id).await?))
        }

        /// Bytes of a message's media, decrypted if needed. With a size, a server-side thumbnail
        /// of unencrypted media is fetched instead of the full file.
        call fn media(source: super::types::MediaSource, width: Option<u32>, height: Option<u32>) -> Bytes {
            Ok(Bytes(this.media(source.0, width.zip(height)).await?))
        }

        /// Bytes of a thumbnail for an `mxc://` URI, fetched with this account's credentials;
        /// scaled to fit unless `crop` is set.
        call fn thumbnail(mxc: String, width: u32, height: u32, crop: Option<bool>) -> Bytes {
            Ok(Bytes(this.thumbnail(&mxc, width, height, crop.unwrap_or(false)).await?))
        }

        /// The MIME type of media bytes, from their first bytes (images, audio, video, PDF).
        bare fn sniffMimeType(head: Bytes) -> Option<String> {
            Ok(crate::sniff_mime_type(&head).map(ToOwned::to_owned))
        }

        /// A BlurHash to send with an image or video, from RGBA pixels of a copy about 32 px wide.
        bare fn encodeBlurhash(rgba: Bytes, width: u32, height: u32) -> String {
            crate::encode_blurhash(&rgba, width, height)
        }

        /// RGBA pixels of a received BlurHash (at most 64 px a side), to show while media loads.
        bare fn decodeBlurhash(hash: String, width: u32, height: u32) -> Bytes {
            Ok(Bytes(crate::decode_blurhash(&hash, width, height)?))
        }
    }
}
