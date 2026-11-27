//! `WizardClient`: encryption, recovery, verification, identity, threads, space
//! children and devices

use super::{Handle, Listener, Subscription};
use crate::{
    DeviceInfo, EncryptionStatus, IdentityChange, PublicRoom, PublicRoomsPage, SessionEvent,
    ThreadPage, UiaAuth, UiaOutcome, UrlPreview, UserTrust, VerificationFlow, WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        /// Calls `listener` when tokens are refreshed (store the new session) or the session ends.
        watch fn watchSession(listener: Listener<SessionEvent>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_session(|event| listener.emit(&event)).await
            }))
        }

        call fn accountManagementUrl() -> Option<String> {
            Ok(this.account_management_url().await)
        }

        call fn encryptionStatus() -> EncryptionStatus {
            Ok(this.encryption_status().await)
        }

        watch fn watchEncryptionStatus(listener: Listener<EncryptionStatus>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_encryption_status(|status| listener.emit(&status)).await
            }))
        }

        /// Sets up recovery; resolves to the new recovery key (show it once).
        call fn enableRecovery() -> String {
            this.enable_recovery().await
        }

        call fn resetRecoveryKey() -> String {
            this.reset_recovery_key().await
        }

        /// Unlocks (and verifies) this device with the recovery key.
        call fn recover(recovery_key: String) -> () {
            this.recover(&recovery_key).await
        }

        call fn requestSelfVerification() -> Handle<VerificationFlow> {
            Ok(Handle::new(this.request_self_verification().await?))
        }

        call fn userTrust(user_id: String) -> UserTrust {
            this.user_trust(&user_id).await
        }

        /// Starts emoji verification with another person.
        call fn requestUserVerification(user_id: String) -> Handle<VerificationFlow> {
            Ok(Handle::new(this.request_user_verification(&user_id).await?))
        }

        /// Starts emoji verification with one of the own other devices.
        call fn requestDeviceVerification(device_id: String) -> Handle<VerificationFlow> {
            Ok(Handle::new(this.request_device_verification(&device_id).await?))
        }

        /// Accepts someone's changed identity so messages can be sent again.
        call fn acknowledgeIdentity(user_id: String) -> () {
            this.acknowledge_identity(&user_id).await
        }

        /// Reports room members whose identity changed.
        watch fn watchIdentityChanges(room_id: String, listener: Listener<Vec<IdentityChange>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this
                    .watch_identity_changes(&room_id, |changes| listener.emit(&changes))
                    .await
                {
                    tracing::error!("identity changes stream failed: {error}");
                }
            }))
        }

        /// Starts over with a new identity; without `auth` it reports what the server asks for
        /// (password or single sign-on). `onApprovalUrl` gets the page to approve it on OAuth
        /// servers, where it waits until approved or `cancelIdentityReset`.
        call fn resetIdentityWithAuth(auth: Option<UiaAuth>, on_approval_url: Listener<String>) -> UiaOutcome {
            this.reset_identity_with_auth(auth, |url| on_approval_url.emit(&url)).await
        }

        call fn cancelIdentityReset() -> () {
            this.cancel_identity_reset();
            Ok(())
        }

        /// Calls `listener` with the users whose devices or identity (and so their trust) changed.
        watch fn watchTrustChanges(listener: Listener<Vec<String>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_trust_changes(|users| listener.emit(&users)).await {
                    tracing::error!("trust changes stream failed: {error}");
                }
            }))
        }

        call fn urlPreview(url: String) -> Option<UrlPreview> {
            this.url_preview(&url).await
        }

        /// The room's threads; `mine` only those the user took part in.
        call fn threads(room_id: String, mine: bool, from: Option<String>) -> ThreadPage {
            this.threads(&room_id, mine, from.as_deref()).await
        }

        call fn addToSpace(space_id: String, child_id: String, suggested: bool) -> () {
            this.add_to_space(&space_id, &child_id, suggested).await
        }

        call fn removeFromSpace(space_id: String, child_id: String) -> () {
            this.remove_from_space(&space_id, &child_id).await
        }

        /// Sets a child's `suggested` flag and/or `order` (pass `clearOrder` to remove it).
        call fn updateSpaceChild(
            space_id: String,
            child_id: String,
            suggested: Option<bool>,
            order: Option<String>,
            clear_order: bool,
        ) -> () {
            let order = if clear_order { Some(None) } else { order.map(Some) };
            this.update_space_child(&space_id, &child_id, suggested, order).await
        }

        /// A page of a server's room directory; `kind` narrows to `spaces` or `rooms`.
        call fn publicRoomsPage(
            query: String,
            server: Option<String>,
            kind: Option<String>,
            limit: u32,
            since: Option<String>,
        ) -> PublicRoomsPage {
            this.public_rooms_page(
                &query,
                server.as_deref(),
                kind.as_deref(),
                limit,
                since.as_deref(),
            )
            .await
        }

        /// What a room or space looks like before joining, from its ID or address.
        call fn roomPreview(id_or_alias: String, via: Option<Vec<String>>) -> PublicRoom {
            this.room_preview(&id_or_alias, &via.unwrap_or_default()).await
        }

        /// Calls `listener` with a `VerificationFlow` for every incoming verification request.
        watch fn watchVerificationRequests(listener: Listener<Handle<VerificationFlow>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                this.watch_verification_requests(|flow| listener.emit(&Handle::new(flow))).await
            }))
        }

        call fn devices() -> Vec<DeviceInfo> {
            this.devices().await
        }

        call fn renameDevice(device_id: String, name: String) -> () {
            this.rename_device(&device_id, &name).await
        }

    }
}
