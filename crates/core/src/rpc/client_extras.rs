//! `WizardClient`: QR grant, spaces, account data, tags, aliases, calls, notifications

use serde_json::Value;

use super::{Bytes, Handle, Listener, Obj, Subscription};
use crate::{
    CallMember, CallSession, IncomingCallEvent, Notification, PusherConfig, QrLoginControl,
    QrLoginStatus, ResolvedAlias, RoomSection, RoomTag, ServerFeatures, SfuConfig, SpaceNode,
    StateChange, WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        /// Lets a new device sign in to this account through this one (QR code).
        call fn grantLoginWithQr(
            scanned: Option<Bytes>,
            control: Obj<QrLoginControl>,
            listener: Listener<QrLoginStatus>,
        ) -> () {
            this.grant_login_with_qr(scanned.map(Into::into), (*control).clone(), |s| {
                listener.emit(&s)
            })
            .await
        }

        /// Every joined space with its children (local state; call again on changes).
        call fn spaceGraph() -> Vec<SpaceNode> {
            this.space_graph().await
        }

        /// Calls `listener` with an account data event's content now and on every change.
        watch fn watchAccountData(event_type: String, listener: Listener<Option<Value>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_account_data(&event_type, |c| listener.emit(&c)).await {
                    tracing::error!("account data stream failed: {error}");
                }
            }))
        }

        call fn roomTags(room_id: String) -> Vec<RoomTag> {
            this.room_tags(&room_id).await
        }

        /// Favourites the room at a position (0-1, lower first).
        call fn setFavouriteOrder(room_id: String, order: Option<f64>) -> () {
            this.set_favourite_order(&room_id, order).await
        }

        /// Calls `listener` with the room list sections in order, now and on every change.
        watch fn watchRoomSections(listener: Listener<Vec<RoomSection>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_room_sections(|s| listener.emit(&s)).await {
                    tracing::error!("room sections stream failed: {error}");
                }
            }))
        }

        /// Adds a room list section (Element compatible); returns its tag.
        call fn createRoomSection(name: String, space_id: String) -> String {
            this.create_room_section(&name, &space_id).await
        }

        call fn renameRoomSection(tag: String, name: String) -> () {
            this.rename_room_section(&tag, &name).await
        }

        /// Reorders the given sections; `chats` stands for the rooms in no section.
        call fn setRoomSectionOrder(tags: Vec<String>) -> () {
            this.set_room_section_order(tags).await
        }

        /// Deletes a section and takes its tag off every room.
        call fn deleteRoomSection(tag: String) -> () {
            this.delete_room_section(&tag).await
        }

        /// Moves a room into a section, or out of its section with `null`.
        call fn setRoomSection(room_id: String, tag: Option<String>) -> () {
            this.set_room_section(&room_id, tag).await
        }

        call fn roomAccountData(room_id: String, event_type: String) -> Option<Value> {
            this.room_account_data(&room_id, &event_type).await
        }

        call fn setRoomAccountData(room_id: String, event_type: String, content: Value) -> () {
            this.set_room_account_data(&room_id, &event_type, content).await
        }

        call fn resolveAlias(alias: String) -> ResolvedAlias {
            this.resolve_alias(&alias).await
        }

        call fn eventAtTime(room_id: String, timestamp: u64) -> Option<String> {
            this.event_at_time(&room_id, timestamp).await
        }

        /// Reports every state change arriving through sync (to refresh cached settings).
        watch fn watchStateChanges(listener: Listener<StateChange>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_state_changes(|c| listener.emit(&c)).await
            }))
        }

        call fn serverFeatures() -> ServerFeatures {
            this.server_features().await
        }

        /// Encrypts and uploads a file; returns the `file` object for message content.
        call fn uploadEncryptedMedia(data: Bytes) -> Value {
            this.upload_encrypted_media(data.0).await
        }

        /// The HTML a message's Markdown turns into; `None` when it has no formatting. Apps add
        /// mentions and custom emoji to it, which plain Markdown sending can't.
        call fn markdownToHtml(body: String) -> Option<String> {
            Ok(crate::content::markdown_to_html(&body))
        }

        /// The LiveKit service the homeserver offers for calls, if any
        call fn rtcServiceUrl() -> Option<String> {
            Ok(this.rtc_service_url().await)
        }

        /// Whether calls can work on this server (lenient: unknown counts as yes)
        call fn rtcSupported() -> bool {
            Ok(this.rtc_supported().await)
        }

        /// The recent call log (every call, the media side included), for bug reports
        call fn callLog() -> String {
            Ok(this.call_log())
        }

        call fn callMembers(room_id: String) -> Vec<CallMember> {
            this.call_members(&room_id).await
        }

        /// Calls `listener` with the room's call members now and on every change.
        watch fn watchCallMembers(room_id: String, listener: Listener<Vec<CallMember>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_call_members(&room_id, |m| listener.emit(&m)).await {
                    tracing::error!("call members stream failed: {error}");
                }
            }))
        }

        /// A token for a LiveKit service, for this device in the room's call.
        call fn sfuConfig(room_id: String, service_url: String) -> SfuConfig {
            this.sfu_config(&room_id, &service_url).await
        }

        /// Joins the room's call; `ring` notifies the others when nobody is in it yet.
        /// `serviceUrl` overrides the homeserver's call server.
        call fn joinCall(
            room_id: String,
            video: bool,
            ring: bool,
            service_url: Option<String>,
        ) -> Handle<CallSession> {
            let session = match service_url {
                Some(url) => this.join_call_via(&room_id, &url, video, ring).await?,
                None => this.join_call(&room_id, video, ring).await?,
            };
            Ok(Handle::new(session))
        }

        /// Rings as they start and end: answered or declined on one of the user's devices, the
        /// caller left, or it expired.
        watch fn watchIncomingCalls(listener: Listener<IncomingCallEvent>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_incoming_calls(|e| listener.emit(&e)).await
            }))
        }

        call fn declineCall(room_id: String, event_id: String) -> () {
            this.decline_call(&room_id, &event_id).await
        }

        /// Calls `listener` for each new message that should notify (push rules, replies to
        /// the user, messages decrypted later).
        watch fn watchNotifications(listener: Listener<Notification>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_notifications(|n| listener.emit(&n)).await
            }))
        }

        call fn setPusher(config: PusherConfig) -> () {
            this.set_pusher(config).await
        }

        call fn removePusher(app_id: String, pushkey: String) -> () {
            this.remove_pusher(app_id, pushkey).await
        }

        call fn pushedNotification(room_id: String, event_id: String) -> Option<Notification> {
            this.pushed_notification(&room_id, &event_id).await
        }

        call fn logout() -> () {
            this.logout().await
        }
    }
}
