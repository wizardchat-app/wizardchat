use matrix_sdk::ruma::{
    events::{
        poll::start::PollKind,
        room::message::{FormattedBody, MessageFormat, MessageType},
    },
    html::{Html, ListBehavior, PropertiesNames, SanitizerConfig},
    UserId,
};
use matrix_sdk_crypto::types::events::UtdCause;
use matrix_sdk_ui::timeline::{
    EncryptedMessage, InReplyToDetails, MsgLikeKind, TimelineDetails, TimelineItemContent,
};
use serde::Serialize;
use serde_json::Value;

/// What a message shows. Media keeps its source opaque; pass it to
/// [`crate::WizardClient::media`] to get the (decrypted) bytes.
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EntryContent {
    Text {
        body: String,
        html: Option<String>,
        /// The formatting in `html` as blocks to draw; `None` when it has none
        rich: Option<Vec<crate::rich_text::RichBlock>>,
    },
    Notice {
        body: String,
        html: Option<String>,
        /// The formatting in `html` as blocks to draw; `None` when it has none
        rich: Option<Vec<crate::rich_text::RichBlock>>,
    },
    Emote {
        body: String,
        html: Option<String>,
        /// The formatting in `html` as blocks to draw; `None` when it has none
        rich: Option<Vec<crate::rich_text::RichBlock>>,
    },
    Image {
        media: MediaInfo,
    },
    Video {
        media: MediaInfo,
    },
    Audio {
        media: MediaInfo,
    },
    File {
        media: MediaInfo,
    },
    Sticker {
        body: String,
        media: MediaInfo,
    },
    Poll {
        poll: PollView,
    },
    #[serde(rename_all = "camelCase")]
    Location {
        body: String,
        /// `geo:lat,long`
        geo_uri: String,
        description: Option<String>,
    },
    /// An in-room request to verify, from the sender to `to`
    VerificationRequest {
        to: String,
    },
    /// Deleted, by the sender or a moderator (`by`)
    Redacted {
        by: Option<String>,
    },
    /// `reason`: unknown, sentBeforeWeJoined, verificationViolation, unsignedDevice,
    /// unknownDevice, historicalMessageAndBackupIsDisabled, withheldForUnverifiedOrInsecureDevice,
    /// withheldBySender, historicalMessageAndDeviceIsUnverified
    UnableToDecrypt {
        #[cfg_attr(feature = "typegen", specta(type = crate::rpc::types::UtdReason))]
        reason: String,
    },
    #[serde(rename_all = "camelCase")]
    Membership {
        user_id: String,
        display_name: Option<String>,
        change: Option<String>,
        reason: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ProfileChange {
        user_id: String,
        name_changed: bool,
        old_name: Option<String>,
        new_name: Option<String>,
        avatar_changed: bool,
    },
    /// Any other state change, with its content as sent
    #[serde(rename_all = "camelCase")]
    State {
        event_type: String,
        state_key: String,
        content: Value,
        prev_content: Option<Value>,
    },
    /// A call, shown on the first of its events
    Call {
        call: crate::call_history::CallHistoryView,
    },
    /// One of a call's other events: shown as part of its `call`
    CallPart,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// Opaque media source (`{ url }` or `{ file }` for encrypted media)
    pub source: Value,
    pub thumbnail_source: Option<Value>,
    pub filename: String,
    /// The text sent along with the media, if any
    pub caption: Option<String>,
    pub mimetype: Option<String>,
    pub size: Option<u64>,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub duration_ms: Option<u64>,
    /// Blurred until clicked (MSC4193)
    pub spoiler: bool,
    pub spoiler_reason: Option<String>,
    /// A recorded voice message (MSC3245)
    pub voice: bool,
    /// Loudness samples 0-1024 for drawing voice messages (MSC1767)
    pub waveform: Option<Vec<u16>>,
    pub blurhash: Option<String>,
    /// Animated image (GIF, animated WebP); play on hover when autoplay is off
    pub is_animated: bool,
    /// The caption as sanitised HTML, if it was formatted
    pub caption_html: Option<String>,
}

/// Fills in what typed contents drop: spoilers, voice and waveform, blurhash
fn enrich_media(media: &mut MediaInfo, raw: Option<&Value>) {
    let Some(raw) = raw else { return };
    let flag = raw
        .get("m.spoiler")
        .or_else(|| raw.get("page.codeberg.everypizza.msc4193.spoiler"));
    media.spoiler =
        matches!(flag, Some(Value::Bool(true))) || flag.and_then(Value::as_str) == Some("true");
    media.spoiler_reason = raw
        .get("m.spoiler.reason")
        .or_else(|| raw.get("page.codeberg.everypizza.msc4193.spoiler.reason"))
        .and_then(Value::as_str)
        .filter(|r| !r.is_empty())
        .map(ToOwned::to_owned);
    media.voice = raw.get("org.matrix.msc3245.voice").is_some() || raw.get("m.voice").is_some();
    media.waveform = raw
        .pointer("/org.matrix.msc1767.audio/waveform")
        .or_else(|| raw.pointer("/m.audio_details/waveform"))
        .and_then(Value::as_array)
        .map(|w| {
            w.iter()
                .filter_map(Value::as_u64)
                .map(|v| v.min(1024) as u16)
                .collect()
        });
    if media.duration_ms.is_none() {
        media.duration_ms = raw
            .pointer("/org.matrix.msc1767.audio/duration")
            .and_then(Value::as_u64);
    }
    if media.caption.is_some()
        && raw.get("format").and_then(Value::as_str) == Some("org.matrix.custom.html")
    {
        media.caption_html = raw
            .get("formatted_body")
            .and_then(Value::as_str)
            .map(sanitize);
    }
    enrich_image(media, raw);
}

fn enrich_image(media: &mut MediaInfo, raw: &Value) {
    let flag = |key: &str| match raw.pointer(key) {
        Some(Value::Bool(b)) => Some(*b),
        Some(Value::String(s)) if s == "true" => Some(true),
        _ => None,
    };
    media.is_animated = flag("/info/is_animated")
        .or_else(|| flag("/info/org.matrix.msc4230.is_animated"))
        .unwrap_or_else(|| {
            matches!(
                media.mimetype.as_deref().map(str::to_lowercase).as_deref(),
                Some("image/gif" | "image/webp" | "image/apng" | "image/avif")
            )
        });
    media.blurhash = raw
        .pointer("/info/xyz.amorgan.blurhash")
        .or_else(|| raw.pointer("/info/blurhash"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PollView {
    pub question: String,
    /// Results are only shown once the poll ends
    pub undisclosed: bool,
    pub max_selections: u64,
    pub answers: Vec<PollAnswerView>,
    /// Answer IDs the user voted for
    pub my_votes: Vec<String>,
    pub total_votes: usize,
    pub ended: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PollAnswerView {
    pub id: String,
    pub text: String,
    pub votes: usize,
}

/// The message a reply points at, as far as it's known yet
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ReplyPreview {
    #[serde(rename_all = "camelCase")]
    Ready {
        event_id: String,
        sender: String,
        sender_name: Option<String>,
        summary: String,
        /// The replied-to message as far as it's known (formatting, media, decryption failure)
        content: Box<EntryContent>,
    },
    /// Not loaded yet: call `loadReplyDetails(eventId)`
    #[serde(rename_all = "camelCase")]
    Unavailable { event_id: String },
    #[serde(rename_all = "camelCase")]
    Pending { event_id: String },
}

/// Matrix-spec sanitising plus what clients commonly send: `matrix:` links and custom emoji
fn sanitize(html: &str) -> String {
    let config = SanitizerConfig::compat()
        .remove_reply_fallback()
        .allow_attributes(
            [
                PropertiesNames {
                    parent: "img",
                    properties: &["data-mx-emoticon"],
                },
                PropertiesNames {
                    parent: "ol",
                    properties: &["type"],
                },
            ],
            ListBehavior::Add,
        );
    let html = Html::parse(html);
    html.sanitize_with(&config);
    html.to_string()
}

/// The HTML a message's Markdown turns into, as sending it without HTML would produce; `None`
/// when it has no formatting
pub fn markdown_to_html(body: &str) -> Option<String> {
    FormattedBody::markdown(body).map(|formatted| formatted.body)
}

/// Sanitised once here so every app renders the same safe subset
pub(crate) fn sanitized(formatted: Option<&FormattedBody>) -> Option<String> {
    let formatted = formatted?;
    (formatted.format == MessageFormat::Html).then(|| sanitize(&formatted.body))
}

fn media_source(json: &Value, plain: &str, encrypted: &str) -> Option<Value> {
    if let Some(url) = json.get(plain) {
        Some(serde_json::json!({ "url": url }))
    } else {
        json.get(encrypted)
            .map(|file| serde_json::json!({ "file": file }))
    }
}

fn media_info(msgtype: &MessageType) -> Option<MediaInfo> {
    let json = serde_json::to_value(msgtype).ok()?;
    let info = json.get("info").cloned().unwrap_or(Value::Null);
    let body = json
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let filename = json
        .get("filename")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    // Per spec, `body` is the caption when a separate filename is given
    let caption = filename
        .as_ref()
        .filter(|name| **name != body)
        .map(|_| body.clone());
    let number = |key: &str| info.get(key).and_then(Value::as_u64);
    Some(MediaInfo {
        source: media_source(&json, "url", "file")?,
        thumbnail_source: media_source(&info, "thumbnail_url", "thumbnail_file"),
        filename: filename.unwrap_or(body),
        caption,
        mimetype: info
            .get("mimetype")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        size: number("size"),
        width: number("w"),
        height: number("h"),
        duration_ms: number("duration"),
        spoiler: false,
        spoiler_reason: None,
        voice: false,
        waveform: None,
        blurhash: None,
        is_animated: false,
        caption_html: None,
    })
}

fn message_content(msgtype: &MessageType, body: &str, raw: Option<&Value>) -> EntryContent {
    // The SDK already sanitised the typed content (dropping custom emoji), so start over from
    // the event as sent where there is one
    let raw_html = raw
        .map(|r| r.get("m.new_content").unwrap_or(r))
        .filter(|c| c.get("format").and_then(Value::as_str) == Some("org.matrix.custom.html"))
        .and_then(|c| c.get("formatted_body"))
        .and_then(Value::as_str)
        .map(sanitize);
    let text = |formatted: Option<&FormattedBody>| {
        let html = sanitized(formatted).map(|typed| raw_html.clone().unwrap_or(typed));
        (body.to_owned(), html)
    };
    let media = || {
        media_info(msgtype).map(|mut media| {
            enrich_media(&mut media, raw);
            media
        })
    };
    match msgtype {
        MessageType::Text(c) => {
            let (body, html) = text(c.formatted.as_ref());
            let rich = html.as_deref().and_then(crate::rich_text::rich_blocks);
            EntryContent::Text { body, html, rich }
        }
        MessageType::Notice(c) => {
            let (body, html) = text(c.formatted.as_ref());
            let rich = html.as_deref().and_then(crate::rich_text::rich_blocks);
            EntryContent::Notice { body, html, rich }
        }
        MessageType::Emote(c) => {
            let (body, html) = text(c.formatted.as_ref());
            let rich = html.as_deref().and_then(crate::rich_text::rich_blocks);
            EntryContent::Emote { body, html, rich }
        }
        MessageType::Image(_) => {
            media().map_or(EntryContent::Other, |media| EntryContent::Image { media })
        }
        MessageType::Video(_) => {
            media().map_or(EntryContent::Other, |media| EntryContent::Video { media })
        }
        MessageType::Audio(_) => {
            media().map_or(EntryContent::Other, |media| EntryContent::Audio { media })
        }
        MessageType::File(_) => {
            media().map_or(EntryContent::Other, |media| EntryContent::File { media })
        }
        MessageType::Location(c) => EntryContent::Location {
            body: c.body.clone(),
            geo_uri: c.geo_uri.clone(),
            description: raw
                .and_then(|r| {
                    r.pointer("/org.matrix.msc3488.location/description")
                        .or_else(|| r.get("title"))
                        .or_else(|| r.get("org.matrix.msc3488.body"))
                })
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        },
        MessageType::VerificationRequest(c) => EntryContent::VerificationRequest {
            to: c.to.to_string(),
        },
        _ => EntryContent::Text {
            body: body.to_owned(),
            html: None,
            rich: None,
        },
    }
}

fn utd_reason(cause: UtdCause) -> &'static str {
    match cause {
        UtdCause::Unknown => "unknown",
        UtdCause::SentBeforeWeJoined => "sentBeforeWeJoined",
        UtdCause::VerificationViolation => "verificationViolation",
        UtdCause::UnsignedDevice => "unsignedDevice",
        UtdCause::UnknownDevice => "unknownDevice",
        UtdCause::HistoricalMessageAndBackupIsDisabled => "historicalMessageAndBackupIsDisabled",
        UtdCause::WithheldForUnverifiedOrInsecureDevice => "withheldForUnverifiedOrInsecureDevice",
        UtdCause::WithheldBySender => "withheldBySender",
        UtdCause::HistoricalMessageAndDeviceIsUnverified => {
            "historicalMessageAndDeviceIsUnverified"
        }
        #[allow(unreachable_patterns)]
        _ => "unknown",
    }
}

/// `raw` is the event as sent (decrypted), for what the typed content leaves out
pub(crate) fn content_of(
    content: &TimelineItemContent,
    own_user: Option<&UserId>,
    raw: Option<&Value>,
) -> EntryContent {
    let raw_content = raw.and_then(|r| r.get("content"));
    match content {
        TimelineItemContent::MsgLike(msg_like) => match &msg_like.kind {
            MsgLikeKind::Message(message) => {
                message_content(message.msgtype(), message.body(), raw_content)
            }
            MsgLikeKind::Sticker(sticker) => {
                let content = sticker.content();
                let json = serde_json::to_value(content).unwrap_or(Value::Null);
                let info = json.get("info").cloned().unwrap_or(Value::Null);
                match media_source(&json, "url", "file") {
                    Some(source) => {
                        let mut media = MediaInfo {
                            source,
                            thumbnail_source: None,
                            filename: content.body.clone(),
                            caption: None,
                            mimetype: info
                                .get("mimetype")
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned),
                            size: info.get("size").and_then(Value::as_u64),
                            width: info.get("w").and_then(Value::as_u64),
                            height: info.get("h").and_then(Value::as_u64),
                            duration_ms: None,
                            spoiler: false,
                            spoiler_reason: None,
                            voice: false,
                            waveform: None,
                            blurhash: None,
                            is_animated: false,
                            caption_html: None,
                        };
                        enrich_image(&mut media, raw_content.unwrap_or(&json));
                        EntryContent::Sticker {
                            body: content.body.clone(),
                            media,
                        }
                    }
                    None => EntryContent::Other,
                }
            }
            MsgLikeKind::Poll(state) => {
                let result = state.results();
                let my_votes = own_user
                    .map(|own| {
                        result
                            .votes
                            .iter()
                            .filter(|(_, voters)| voters.iter().any(|v| v == own.as_str()))
                            .map(|(answer, _)| answer.clone())
                            .collect()
                    })
                    .unwrap_or_default();
                let voters: std::collections::HashSet<&String> =
                    result.votes.values().flatten().collect();
                EntryContent::Poll {
                    poll: PollView {
                        question: result.question.clone(),
                        undisclosed: result.kind == PollKind::Undisclosed,
                        max_selections: result.max_selections,
                        answers: result
                            .answers
                            .iter()
                            .map(|a| PollAnswerView {
                                id: a.id.clone(),
                                text: a.text.clone(),
                                votes: result.votes.get(&a.id).map_or(0, Vec::len),
                            })
                            .collect(),
                        my_votes,
                        total_votes: voters.len(),
                        ended: result.end_time.is_some(),
                    },
                }
            }
            MsgLikeKind::Redacted => EntryContent::Redacted {
                by: raw
                    .and_then(|r| r.pointer("/unsigned/redacted_because/sender"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
            },
            MsgLikeKind::UnableToDecrypt(message) => EntryContent::UnableToDecrypt {
                reason: match message {
                    EncryptedMessage::MegolmV1AesSha2 { cause, .. } => utd_reason(*cause),
                    _ => "unknown",
                }
                .to_owned(),
            },
            MsgLikeKind::Other(other) if other.event_type().to_string() == "m.poll.start" => {
                fallback_text(raw_content).map_or(EntryContent::Other, |body| EntryContent::Text {
                    body,
                    html: None,
                    rich: None,
                })
            }
            _ => EntryContent::Other,
        },
        TimelineItemContent::MembershipChange(change) => EntryContent::Membership {
            user_id: change.user_id().to_string(),
            display_name: change.display_name(),
            change: change.change().map(|c| format!("{c:?}")),
            reason: raw_content
                .and_then(|c| c.get("reason"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        },
        TimelineItemContent::ProfileChange(change) => {
            let name = change.displayname_change();
            EntryContent::ProfileChange {
                user_id: change.user_id().to_string(),
                name_changed: name.is_some(),
                old_name: name.and_then(|c| c.old.clone()),
                new_name: name.and_then(|c| c.new.clone()),
                avatar_changed: change.avatar_url_change().is_some(),
            }
        }
        content
            if crate::call_history::is_call_item(
                content,
                raw.and_then(|r| r.get("type")).and_then(Value::as_str),
            ) =>
        {
            EntryContent::CallPart
        }
        TimelineItemContent::OtherState(state) => EntryContent::State {
            event_type: raw
                .and_then(|r| r.get("type"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            state_key: state.state_key().to_owned(),
            content: raw_content.cloned().unwrap_or(Value::Null),
            prev_content: raw
                .and_then(|r| r.pointer("/unsigned/prev_content"))
                .cloned(),
        },
        _ => EntryContent::Other,
    }
}

/// The plain-text fallback of extensible events (stable polls)
fn fallback_text(content: Option<&Value>) -> Option<String> {
    let content = content?;
    content
        .get("body")
        .or_else(|| content.get("org.matrix.msc1767.text"))
        .and_then(Value::as_str)
        .or_else(|| {
            content
                .get("m.text")
                .and_then(Value::as_array)
                .and_then(|texts| texts.first())
                .and_then(|t| t.get("body"))
                .and_then(Value::as_str)
        })
        .map(ToOwned::to_owned)
}

/// A one-line plain-text summary, for reply previews and notifications
pub(crate) fn summary_of(content: &TimelineItemContent) -> String {
    match content_of(content, None, None) {
        EntryContent::Text { body, .. }
        | EntryContent::Notice { body, .. }
        | EntryContent::Emote { body, .. }
        | EntryContent::Sticker { body, .. } => body.lines().next().unwrap_or_default().to_owned(),
        EntryContent::Image { media }
        | EntryContent::Video { media }
        | EntryContent::Audio { media }
        | EntryContent::File { media } => media.caption.unwrap_or(media.filename),
        EntryContent::Poll { poll } => poll.question,
        EntryContent::Location { body, .. } => body,
        _ => String::new(),
    }
}

pub(crate) fn reply_preview(details: &InReplyToDetails) -> ReplyPreview {
    let event_id = details.event_id.to_string();
    match &details.event {
        TimelineDetails::Ready(event) => ReplyPreview::Ready {
            event_id,
            sender: event.sender.to_string(),
            sender_name: match &event.sender_profile {
                TimelineDetails::Ready(profile) => profile.display_name.clone(),
                _ => None,
            },
            summary: summary_of(&event.content),
            content: Box::new(content_of(&event.content, None, None)),
        },
        TimelineDetails::Pending => ReplyPreview::Pending { event_id },
        _ => ReplyPreview::Unavailable { event_id },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use matrix_sdk::ruma::events::room::message::{
        ImageMessageEventContent, TextMessageEventContent,
    };
    use matrix_sdk::ruma::{events::room::MediaSource, mxc_uri};

    #[test]
    fn html_is_sanitised_and_scripts_dropped() {
        let html = sanitized(Some(&FormattedBody::html(
            "<b>hi</b><script>alert(1)</script><img src=x onerror=alert(2)>",
        )))
        .unwrap();
        assert!(html.starts_with("<b>hi</b>"));
        assert!(!html.contains("<script") && !html.contains("onerror"));
    }

    #[test]
    fn plain_text_has_no_html() {
        let content = message_content(
            &MessageType::Text(TextMessageEventContent::plain("hey")),
            "hey",
            None,
        );
        assert!(matches!(content, EntryContent::Text { html: None, .. }));
    }

    #[test]
    fn image_media_info_keeps_the_source_and_caption() {
        let mut image = ImageMessageEventContent::new(
            "look at this".into(),
            MediaSource::Plain(mxc_uri!("mxc://localhost/abc").to_owned()),
        );
        image.filename = Some("cat.png".into());
        let info = media_info(&MessageType::Image(image)).expect("media info");
        assert_eq!(
            info.source,
            serde_json::json!({ "url": "mxc://localhost/abc" })
        );
        assert_eq!(info.filename, "cat.png");
        assert_eq!(info.caption.as_deref(), Some("look at this"));
    }

    #[test]
    fn renders_markdown_like_sending_does() {
        let html = markdown_to_html("**bold** and ~~gone~~").unwrap();
        assert!(html.contains("<strong>bold</strong>"), "{html}");
        assert!(html.contains("<del>gone</del>"), "{html}");
        assert_eq!(markdown_to_html("just text"), None);
        assert_eq!(
            markdown_to_html("[smh](https://a.b)").as_deref(),
            Some(r#"<a href="https://a.b">smh</a>"#)
        );
    }
}
