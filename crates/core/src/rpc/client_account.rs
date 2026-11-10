//! `WizardClient`: profile, presence, notification settings, account data, search, emoji packs, widgets

use serde_json::Value;

use super::{Bytes, Listener, Subscription};
use crate::{
    EmojiPack, MentionRule, MutualRoom, NotificationMode, NotificationPrefs, Presence,
    PresenceInfo, SearchHit, UiaAuth, UiaOutcome, UserProfile, Widget, WizardClient,
};

rpc_methods! {
    WizardClient(this: WizardClient) {
        call fn userProfile(user_id: String) -> UserProfile {
            this.user_profile(&user_id).await
        }

        call fn mutualRooms(user_id: String) -> Vec<MutualRoom> {
            this.mutual_rooms(&user_id).await
        }

        call fn ownProfile() -> UserProfile {
            this.own_profile().await
        }

        call fn presence(user_id: String) -> Option<PresenceInfo> {
            Ok(this.presence(&user_id).await)
        }

        call fn setDisplayName(name: String) -> () {
            this.set_display_name(&name).await
        }

        /// Uploads and sets a new avatar; resolves to its mxc:// URI.
        call fn setAvatar(bytes: Bytes, mimetype: String) -> String {
            this.set_avatar(bytes.0, &mimetype).await
        }

        call fn removeAvatar() -> () {
            this.remove_avatar().await
        }

        call fn setCustomStatus(text: String, expires_at: Option<f64>, presence: Presence) -> () {
            this.set_custom_status(&text, expires_at.map(|ms| ms as u64), presence).await
        }

        call fn clearCustomStatus(presence: Presence) -> () {
            this.clear_custom_status(presence).await
        }

        call fn setPresence(presence: Presence, status_msg: Option<String>) -> () {
            this.set_presence(presence, status_msg.as_deref()).await
        }

        call fn presenceSupported() -> bool {
            Ok(this.presence_supported().await)
        }

        call fn ignoreUser(user_id: String) -> () {
            this.ignore_user(&user_id).await
        }

        call fn unignoreUser(user_id: String) -> () {
            this.unignore_user(&user_id).await
        }

        call fn setPowerLevel(room_id: String, user_id: String, level: f64) -> () {
            this.set_power_level(&room_id, &user_id, level as i64).await
        }

        call fn notificationPrefs() -> NotificationPrefs {
            Ok(this.notification_prefs().await)
        }

        call fn setDefaultNotificationMode(direct: bool, mode: NotificationMode) -> () {
            this.set_default_notification_mode(direct, mode).await
        }

        call fn setMentionRule(rule: MentionRule, enabled: bool) -> () {
            this.set_mention_rule(rule, enabled).await
        }

        call fn addNotificationKeyword(keyword: String) -> () {
            this.add_notification_keyword(&keyword).await
        }

        call fn removeNotificationKeyword(keyword: String) -> () {
            this.remove_notification_keyword(&keyword).await
        }

        call fn roomNotificationMode(room_id: String) -> Option<NotificationMode> {
            this.room_notification_mode(&room_id).await
        }

        /// Sets the room's own notification mode; `null` goes back to the default.
        call fn setRoomNotificationMode(room_id: String, mode: Option<NotificationMode>) -> () {
            this.set_room_notification_mode(&room_id, mode).await
        }

        /// Reads an account data document (synced across the account's devices).
        call fn accountData(event_type: String) -> Option<Value> {
            this.account_data(&event_type).await
        }

        call fn setAccountData(event_type: String, content: Value) -> () {
            this.set_account_data(&event_type, content).await
        }

        /// Every global account data type the account has (asks the server).
        call fn accountDataTypes() -> Vec<String> {
            this.account_data_types().await
        }

        /// Changes the password; without `auth` it tries unconfirmed first and reports what
        /// the server asks for.
        call fn changePasswordWithAuth(new_password: String, auth: Option<UiaAuth>) -> UiaOutcome {
            this.change_password_with_auth(&new_password, auth).await
        }

        /// Deactivates the account for good; `erase` also asks the server to forget its messages.
        call fn deactivateAccountWithAuth(erase: bool, auth: Option<UiaAuth>) -> UiaOutcome {
            this.deactivate_account_with_auth(erase, auth).await
        }

        /// Signs other devices out, reporting what the server asks for to confirm it.
        call fn deleteDevicesWithAuth(device_ids: Vec<String>, auth: Option<UiaAuth>) -> UiaOutcome {
            this.delete_devices_with_auth(&device_ids, auth).await
        }

        /// Adds the email once it's confirmed; `token` is the code from the email.
        call fn addEmailWithAuth(
            secret: String,
            sid: String,
            token: Option<String>,
            auth: Option<UiaAuth>,
        ) -> UiaOutcome {
            this.add_email_with_auth(&secret, &sid, token.as_deref(), auth).await
        }

        /// The account page for removing a device, on servers with next-generation auth.
        call fn deviceManagementUrl(device_id: String) -> Option<String> {
            Ok(this.device_management_url(&device_id).await)
        }

        /// The homeserver URL from the server name's `.well-known`, if any.
        call fn wellKnownHomeserverUrl() -> Option<String> {
            Ok(this.well_known_homeserver_url().await)
        }

        call fn keyBackupExistsOnServer() -> bool {
            this.key_backup_exists_on_server().await
        }

        /// Calls `listener` whenever the account's own devices change.
        watch fn watchOwnDevices(listener: Listener<()>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_own_devices(|| listener.emit(&())).await {
                    tracing::error!("devices stream failed: {error}");
                }
            }))
        }

        /// Searches messages on the server (not possible for encrypted rooms).
        call fn searchMessages(term: String, room_id: Option<String>) -> Vec<SearchHit> {
            this.search_messages(&term, room_id.as_deref()).await
        }

        call fn emojiPacks(room_id: Option<String>) -> Vec<EmojiPack> {
            this.emoji_packs(room_id.as_deref()).await
        }

        call fn widgets(room_id: String) -> Vec<Widget> {
            this.widgets(&room_id).await
        }

        watch fn watchWidgets(room_id: String, listener: Listener<Vec<Widget>>) -> Subscription {
            Ok(listener.clone().watch(async move {
                if let Err(error) = this.watch_widgets(&room_id, |widgets| listener.emit(&widgets)).await {
                    tracing::error!("widgets stream failed: {error}");
                }
            }))
        }

        /// Adds a web page widget (or replaces the one with `id`); returns its id.
        call fn setWidget(room_id: String, id: Option<String>, name: String, url: String) -> String {
            this.set_widget(&room_id, id.as_deref(), &name, &url).await
        }

        call fn removeWidget(room_id: String, id: String) -> () {
            this.remove_widget(&room_id, &id).await
        }

        /// The URL to load for a widget, with the user's and room's details filled in.
        call fn widgetUrl(room_id: String, widget: Widget, theme: String, language: String) -> String {
            this.widget_url(&room_id, &widget, &theme, &language).await
        }
    }
}
