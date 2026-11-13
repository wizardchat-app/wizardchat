//! `WizardClient`: room administration, state events, media, accounts and profile fields

use serde_json::Value;

use super::{Bytes, Listener, Subscription};
use crate::{
    AuditLogPage, EventSource, ListDiff, MemberEntry, MessageVersion, RoomSettings,
    ServerCapabilities, SpaceHierarchy, SpaceSummary, ThirdPartyId, UnreadMention, UnreadThread,
    WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        /// The room's full settings, fetched from the server.
        call fn roomSettings(room_id: String) -> RoomSettings {
            this.room_settings(&room_id).await
        }

        /// The settings as far as local state has them (no request): permissions and toggles
        /// right away; `published` and `localAliases` stay empty.
        call fn localRoomSettings(room_id: String) -> RoomSettings {
            this.local_room_settings(&room_id).await
        }

        /// Unread messages in a room that mention the user (highlights, intentional mentions,
        /// replies to them), newest first.
        call fn unreadMentions(room_id: String, limit: u32) -> Vec<UnreadMention> {
            this.unread_mentions(&room_id, limit).await
        }

        call fn unreadThreads(room_id: String) -> Vec<UnreadThread> {
            this.unread_threads(&room_id).await
        }

        /// Calls `listener` with diffs of every joined space, subspaces included.
        watch fn watchAllSpaces(listener: Listener<Vec<ListDiff<SpaceSummary>>>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                client.watch_all_spaces(|diffs| events.emit(&diffs)).await;
            }))
        }

        /// A space and its direct children from the server; partial when a page failed.
        call fn spaceHierarchy(space_id: String) -> SpaceHierarchy {
            this.space_hierarchy(&space_id).await
        }

        /// Calls `listener` with every room's account data of a type as [roomId, content]
        /// pairs, now and on every change (e.g. `m.tag` for favourite orders).
        watch fn watchRoomAccountData(event_type: String, listener: Listener<Vec<(String, Value)>>) -> Subscription {
            let client = this.clone();
            let events = listener.clone();
            Ok(listener.watch(async move {
                client
                    .watch_room_account_data(&event_type, |data| events.emit(&data))
                    .await;
            }))
        }

        /// Whether the server lets the user set this extended profile field.
        call fn canSetProfileField(field: String) -> bool {
            this.can_set_profile_field(&field).await
        }

        /// IDs of the loaded, not yet deleted messages a user sent in a room, oldest first.
        call fn recentUserMessages(room_id: String, user_id: String) -> Vec<String> {
            this.recent_user_messages(&room_id, &user_id).await
        }

        /// Deletes these events.
        call fn redactEvents(room_id: String, event_ids: Vec<String>, reason: Option<String>) -> () {
            this.redact_events(&room_id, &event_ids, reason.as_deref()).await
        }

        call fn setJoinRule(room_id: String, rule: super::types::JoinRule, allowed_spaces: Vec<String>) -> () {
            this.set_join_rule(&room_id, &rule.0, &allowed_spaces).await
        }

        call fn setHistoryVisibility(room_id: String, visibility: super::types::HistoryVisibility) -> () {
            this.set_history_visibility(&room_id, &visibility.0).await
        }

        call fn setGuestAccess(room_id: String, allowed: bool) -> () {
            this.set_guest_access(&room_id, allowed).await
        }

        /// Lists the room in the server's directory (often admins only).
        call fn setPublished(room_id: String, published: bool) -> () {
            this.set_published(&room_id, published).await
        }

        call fn enableEncryption(room_id: String) -> () {
            this.enable_encryption(&room_id).await
        }

        call fn setRoomAvatar(room_id: String, data: Bytes, mimetype: String) -> () {
            this.set_room_avatar(&room_id, data.0, &mimetype).await
        }

        call fn removeRoomAvatar(room_id: String) -> () {
            this.remove_room_avatar(&room_id).await
        }

        call fn addRoomAlias(room_id: String, alias: String) -> () {
            this.add_room_alias(&room_id, &alias).await
        }

        call fn removeRoomAlias(alias: String) -> () {
            this.remove_room_alias(&alias).await
        }

        call fn setCanonicalAlias(room_id: String, alias: Option<String>, alt_aliases: Vec<String>) -> () {
            this.set_canonical_alias(&room_id, alias.as_deref(), &alt_aliases).await
        }

        call fn setPowerLevels(room_id: String, content: Value) -> () {
            this.set_power_levels(&room_id, content).await
        }

        /// Moves the room to a new version; returns the new room's id.
        call fn upgradeRoom(room_id: String, version: String) -> String {
            this.upgrade_room(&room_id, &version).await
        }

        call fn serverCapabilities() -> ServerCapabilities {
            this.server_capabilities().await
        }

        /// Banned (`ban`), knocking (`knock`) or invited (`invite`) people.
        call fn membersInState(room_id: String, membership: String) -> Vec<MemberEntry> {
            this.members_in_state(&room_id, &membership).await
        }

        call fn unban(room_id: String, user_id: String, reason: Option<String>) -> () {
            this.unban(&room_id, &user_id, reason.as_deref()).await
        }

        call fn acceptKnock(room_id: String, user_id: String) -> () {
            this.accept_knock(&room_id, &user_id).await
        }

        call fn rejectKnock(room_id: String, user_id: String, reason: Option<String>) -> () {
            this.reject_knock(&room_id, &user_id, reason.as_deref()).await
        }

        /// Asks to join; returns the room id.
        call fn knock(room_id_or_alias: String, reason: Option<String>, via: Vec<String>) -> String {
            this.knock(&room_id_or_alias, reason.as_deref(), &via).await
        }

        call fn reportEvent(room_id: String, event_id: String, reason: Option<String>) -> () {
            this.report_event(&room_id, &event_id, reason.as_deref()).await
        }

        call fn reportRoom(room_id: String, reason: String) -> () {
            this.report_room(&room_id, &reason).await
        }

        /// One state event's content from the server, or null.
        call fn stateEvent(room_id: String, event_type: String, state_key: String) -> Option<Value> {
            this.state_event(&room_id, &event_type, &state_key).await
        }

        /// Every state event of a type as [stateKey, content] pairs.
        call fn stateEventsOfType(room_id: String, event_type: String) -> Vec<(String, Value)> {
            this.state_events_of_type(&room_id, &event_type).await
        }

        /// Every state event of the given types as [type, stateKey, content], with one request
        /// to the server at most.
        call fn stateEventsOfTypes(room_id: String, event_types: Vec<String>) -> Vec<(String, String, Value)> {
            this.state_events_of_types(&room_id, &event_types).await
        }

        call fn auditLog(room_id: String, from: Option<String>) -> AuditLogPage {
            this.audit_log(&room_id, from).await
        }

        /// Every current state event of the room in full, for exploring it.
        call fn roomState(room_id: String) -> Vec<Value> {
            this.room_state(&room_id).await
        }

        call fn setStateEvent(room_id: String, event_type: String, state_key: String, content: Value) -> () {
            this.set_state_event(&room_id, &event_type, &state_key, content).await
        }

        /// Sends any message-like event; returns its id.
        call fn sendEvent(room_id: String, event_type: String, content: Value) -> String {
            this.send_event(&room_id, &event_type, content).await
        }

        /// Uploads a file; returns its `mxc://` URI.
        call fn uploadMedia(data: Bytes, mimetype: String) -> String {
            this.upload_media(data.0, &mimetype).await
        }

        call fn eventSource(room_id: String, event_id: String) -> EventSource {
            this.event_source(&room_id, &event_id).await
        }

        call fn editHistory(room_id: String, event_id: String) -> Vec<MessageVersion> {
            this.edit_history(&room_id, &event_id).await
        }

        call fn forwardEvent(from_room_id: String, event_id: String, to_room_id: String) -> () {
            this.forward_event(&from_room_id, &event_id, &to_room_id).await
        }

        call fn emailAddresses() -> Vec<ThirdPartyId> {
            this.email_addresses().await
        }

        /// Sends a verification email; returns the session id for `addEmail`.
        call fn requestEmailToken(email: String, secret: String, attempt: u32) -> String {
            this.request_email_token(&email, &secret, attempt).await
        }

        call fn removeEmail(address: String) -> () {
            this.remove_email(&address).await
        }

        /// Any extended profile field (MSC4133), or null.
        call fn profileField(user_id: String, field: String) -> Option<Value> {
            this.profile_field(&user_id, &field).await
        }

        call fn setProfileField(field: String, value: Value) -> () {
            this.set_profile_field(&field, value).await
        }

        call fn deleteProfileField(field: String) -> () {
            this.delete_profile_field(&field).await
        }

        /// A user's profile banner (`mxc://`), or null.
        call fn banner(user_id: String) -> Option<String> {
            this.banner(&user_id).await
        }

        /// Uploads and sets the own banner; with no data it removes it.
        call fn setBanner(data: Option<Bytes>, mimetype: Option<String>) -> () {
            let image = data.map(|d| (d.0, mimetype.unwrap_or_else(|| "image/png".into())));
            this.set_banner(image).await
        }
    }
}
