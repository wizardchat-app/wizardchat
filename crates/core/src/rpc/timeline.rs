//! A room's timeline: `RoomTimeline`

use serde::Deserialize;

use serde_json::Value;

use super::{Bytes, Listener, Subscription};
use crate::{
    timeline::{UploadProgress, UploadedAttachment},
    Attachment, ListDiff, MentionsInput, MessageKind, TimelineEntry, TypingUser,
};

/// How `sendFile` uploads and sends a file
#[derive(Deserialize, Default)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
pub struct AttachmentOptions {
    #[cfg_attr(feature = "typegen", specta(optional))]
    filename: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    mimetype: String,
    #[cfg_attr(feature = "typegen", specta(optional))]
    caption: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    width: Option<u32>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    height: Option<u32>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    spoiler: bool,
    #[cfg_attr(feature = "typegen", specta(optional))]
    spoiler_reason: Option<String>,
    /// A recorded voice message
    #[cfg_attr(feature = "typegen", specta(optional))]
    voice: bool,
    #[cfg_attr(feature = "typegen", specta(optional))]
    duration_ms: Option<u64>,
    /// Loudness samples 0-1024
    #[cfg_attr(feature = "typegen", specta(optional))]
    waveform: Option<Vec<u16>>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    reply_to: Option<String>,
    /// A preview image (encoded bytes) for images and videos
    #[cfg_attr(feature = "typegen", specta(optional))]
    thumbnail: Option<AttachmentThumbnail>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    is_animated: bool,
    /// The caption as HTML (otherwise Markdown)
    #[cfg_attr(feature = "typegen", specta(optional))]
    caption_html: Option<String>,
    #[cfg_attr(feature = "typegen", specta(optional))]
    mentions: Option<MentionsInput>,
}

#[derive(Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AttachmentThumbnail {
    data: Bytes,
    mimetype: String,
    width: u32,
    height: u32,
}

/// A file uploaded with `uploadFile`, to send with `sendUploaded`
#[derive(Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UploadedFile {
    /// What `uploadFile` returned
    source: Value,
    size: u64,
    filename: String,
    mimetype: String,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    caption: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    caption_html: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    width: Option<u32>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    height: Option<u32>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    duration_ms: Option<u64>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    spoiler: bool,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    spoiler_reason: Option<String>,
    /// A recorded voice message
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    voice: bool,
    /// Loudness samples 0-1024
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    waveform: Option<Vec<u16>>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    is_animated: bool,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    thumbnail: Option<UploadedThumbnail>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    mentions: Option<MentionsInput>,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    reply_to: Option<String>,
}

#[derive(Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UploadedThumbnail {
    /// What `uploadFile` returned for the preview image
    source: Value,
    mimetype: String,
    width: u32,
    height: u32,
    size: u64,
}

rpc_methods! {
    RoomTimeline(this: crate::RoomTimeline) {
        /// Calls `listener` with timeline diffs, starting with a `reset` of the current items.
        watch fn watch(listener: Listener<Vec<ListDiff<TimelineEntry>>>) -> Subscription {
            let events = listener.clone();
            Ok(listener.watch(async move {
                this.watch(|diffs| events.emit(&diffs)).await
            }))
        }

        /// Loads older events; resolves `true` once the start of the room is reached.
        /// Loads newer messages in a timeline opened at an event; true once at the latest.
        call fn paginateForward(events: u16) -> bool {
            this.paginate_forward(events).await
        }

        call fn paginateBack(events: u16) -> bool {
            this.paginate_back(events).await
        }

        /// Sends a text message (Markdown), as a reply when `replyTo` is an event ID.
        call fn sendText(body: String, reply_to: Option<String>) -> () {
            this.send_text(&body, reply_to.as_deref()).await
        }

        /// Sends ready-made HTML (custom emoji), as a reply when `replyTo` is set.
        call fn sendHtml(body: String, html: String, reply_to: Option<String>) -> () {
            this.send_html(&body, &html, reply_to.as_deref()).await
        }

        call fn sendSticker(body: String, url: String) -> () {
            this.send_sticker(&body, &url).await
        }

        call fn editText(item_key: String, body: String, html: Option<String>, mentions: Option<MentionsInput>) -> () {
            this.edit_text(&item_key, &body, html.as_deref(), mentions).await
        }

        call fn editCaption(item_key: String, caption: String, html: Option<String>, mentions: Option<MentionsInput>) -> () {
            this.edit_caption(&item_key, &caption, html.as_deref(), mentions).await
        }

        call fn redact(item_key: String, reason: Option<String>) -> () {
            this.redact(&item_key, reason.as_deref()).await
        }

        call fn toggleReaction(item_key: String, key: String) -> () {
            this.toggle_reaction(&item_key, &key).await
        }

        call fn loadReplyDetails(event_id: String) -> () {
            this.load_reply_details(&event_id).await
        }

        /// Sends a text, emote or notice; without `html` the body is Markdown.
        call fn sendMessage(
            kind: MessageKind,
            body: String,
            html: Option<String>,
            reply_to: Option<String>,
            mentions: Option<MentionsInput>,
        ) -> () {
            this.send_message(kind, &body, html.as_deref(), reply_to.as_deref(), mentions).await
        }

        /// Sends any message-like event content with a local echo; `m.relates_to` is kept.
        call fn sendEvent(event_type: String, content: serde_json::Value) -> () {
            this.send_event(&event_type, content).await
        }

        /// Tries a failed message again.
        call fn retrySend(item_key: String) -> () {
            this.retry_send(&item_key).await
        }

        /// Shares a location (`geo:lat,long`).
        call fn sendLocation(body: String, geo_uri: String, description: Option<String>) -> () {
            this.send_location(&body, &geo_uri, description.as_deref()).await
        }

        /// Uploads and sends a file with options (spoilers, voice messages).
        call fn sendFile(bytes: Bytes, options: AttachmentOptions) -> () {
            let o = options;
            let attachment = Attachment {
                bytes: bytes.0,
                filename: o.filename,
                mimetype: o.mimetype,
                caption: o.caption,
                width: o.width,
                height: o.height,
                spoiler: o.spoiler,
                spoiler_reason: o.spoiler_reason,
                voice: o.voice,
                duration_ms: o.duration_ms,
                duration_ms_video: o.duration_ms,
                waveform: o.waveform,
                thumbnail: o.thumbnail.map(|t| (t.data.0, t.mimetype, t.width, t.height)),
                is_animated: o.is_animated,
                caption_html: o.caption_html,
                mentions: o.mentions,
            };
            this.send_attachment(attachment, o.reply_to.as_deref()).await
        }

        /// Uploads a file for this room ahead of sending (encrypted in encrypted rooms);
        /// `listener` gets the progress where the platform reports it. Resolves to the source
        /// to pass to `sendUploaded`.
        call fn uploadFile(data: Bytes, mimetype: String, listener: Listener<UploadProgress>) -> Value {
            this.upload_file(data.0, &mimetype, |p| listener.emit(&p)).await
        }

        /// Sends a file uploaded with `uploadFile` (images, video, audio, voice messages, files).
        call fn sendUploaded(file: UploadedFile) -> () {
            let f = file;
            let attachment = UploadedAttachment {
                source: f.source,
                size: f.size,
                filename: f.filename,
                mimetype: f.mimetype,
                caption: f.caption,
                caption_html: f.caption_html,
                width: f.width,
                height: f.height,
                duration_ms: f.duration_ms,
                spoiler: f.spoiler,
                spoiler_reason: f.spoiler_reason,
                voice: f.voice,
                waveform: f.waveform,
                is_animated: f.is_animated,
                thumbnail: f.thumbnail.map(|t| (t.source, t.mimetype, t.width, t.height, t.size)),
                mentions: f.mentions,
            };
            this.send_uploaded(attachment, f.reply_to.as_deref()).await
        }

        /// Starts a poll; `maxSelections` 1 makes it single-choice.
        call fn sendPoll(question: String, answers: Vec<String>, max_selections: u32, undisclosed: bool) -> () {
            this.send_poll(&question, &answers, max_selections.into(), undisclosed).await
        }

        call fn vote(poll_event_id: String, answers: Vec<String>) -> () {
            this.vote(&poll_event_id, &answers).await
        }

        call fn endPoll(poll_event_id: String) -> () {
            this.end_poll(&poll_event_id).await
        }

        call fn pin(event_id: String) -> () {
            this.pin(&event_id).await
        }

        call fn unpin(event_id: String) -> () {
            this.unpin(&event_id).await
        }

        call fn setTyping(typing: bool) -> () {
            this.set_typing(typing).await
        }

        /// Calls `listener` with the other users currently typing.
        watch fn watchTyping(listener: Listener<Vec<TypingUser>>) -> Subscription {
            let events = listener.clone();
            Ok(listener.watch(async move {
                this.watch_typing(|users| events.emit(&users)).await
            }))
        }

        /// Marks the room read up to its latest message (unthreaded receipt and fully-read
        /// marker); in a thread, a threaded and an unthreaded receipt. Private receipts aren't
        /// shown to others.
        call fn markAsRead(private: Option<bool>) -> () {
            this.mark_as_read(private.unwrap_or(false)).await
        }
    }
}

/// `WizardClient` methods of the timeline area
pub(super) mod client {
    use crate::WizardClient;

    rpc_methods! {
        WizardClient(this: WizardClient) {
            /// "Mark as read": moves the unthreaded read receipt and the fully-read marker to
            /// the room's latest message. Private receipts aren't shown to others.
            call fn markRoomAsRead(room_id: String, private: Option<bool>) -> () {
                this.mark_room_as_read(&room_id, private.unwrap_or(false)).await
            }

            /// Joins the room that replaced an upgraded room; resolves to its ID.
            call fn joinUpgradedRoom(room_id: String) -> String {
                this.join_upgraded_room(&room_id).await
            }
        }
    }
}
