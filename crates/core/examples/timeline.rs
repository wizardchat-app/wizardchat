//! End-to-end check of timeline behaviour: read markers, sanitising, hidden event types, polls,
//! locations, pre-uploaded files, reports and joining an upgraded room.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example timeline

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::oneshot;
use wizardchat_core::{
    CreateRoomOptions, EntryContent, RoomTimeline, TimelineEntry, UploadedAttachment,
};

use common::BoxError;

/// Watches the timeline until `check` finds what it's looking for, failing after 30 seconds.
async fn wait_for<T>(
    timeline: &RoomTimeline,
    what: &str,
    mut check: impl FnMut(&[TimelineEntry]) -> Option<T>,
) -> Result<T, BoxError> {
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut entries: Vec<TimelineEntry> = Vec::new();
    let watch = timeline.watch(|diffs| {
        for diff in diffs {
            diff.apply(&mut entries);
        }
        if let Some(found) = check(&entries) {
            if let Some(tx) = tx.take() {
                let _ = tx.send(found);
            }
        }
    });
    tokio::select! {
        found = rx => Ok(found?),
        _ = watch => Err(format!("stream ended before {what}").into()),
        _ = tokio::time::sleep(Duration::from_secs(30)) => Err(format!("timed out waiting for {what}").into()),
    }
}

fn event_id_of(entries: &[TimelineEntry], body: &str) -> Option<String> {
    entries.iter().find_map(|e| match e {
        TimelineEntry::Event {
            content: EntryContent::Text { body: b, .. },
            event_id: Some(id),
            ..
        } if b == body => Some(id.clone()),
        _ => None,
    })
}

async fn fully_read(session: &wizardchat_core::Session, room_id: &str) -> Result<Value, BoxError> {
    let url = format!(
        "{}/_matrix/client/v3/user/{}/rooms/{}/account_data/m.fully_read",
        common::server(),
        urlencode(&session.user_id),
        urlencode(room_id)
    );
    Ok(reqwest::Client::new()
        .get(url)
        .bearer_auth(&session.access_token)
        .send()
        .await?
        .json()
        .await?)
}

fn urlencode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let (alice, _, _) = common::register("timeline", "a").await?;
    let (bob, bob_session, _) = common::register("timeline", "b").await?;
    alice.start_sync().await?;
    bob.start_sync().await?;
    let bob_id = bob_session.user_id.clone();

    let room_id = alice
        .create_room_with(CreateRoomOptions {
            name: "Timeline test".into(),
            encrypted: Some(false),
            invite: vec![bob_id.clone()],
            ..Default::default()
        })
        .await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    bob.join(&room_id, &[]).await?;
    println!("room {room_id} with both users");

    let a = alice.timeline(&room_id).await?;
    a.send_text("first", None).await?;
    a.send_text("latest message", None).await?;
    let latest = wait_for(&a, "the latest message", |e| {
        event_id_of(e, "latest message")
    })
    .await?;
    alice
        .set_room_topic(&room_id, "a state event after the message")
        .await?;
    tokio::time::sleep(Duration::from_secs(2)).await;

    let b = bob.timeline(&room_id).await?;
    wait_for(&b, "bob seeing the message", |e| {
        event_id_of(e, "latest message")
    })
    .await?;
    bob.mark_room_as_read(&room_id, false).await?;
    let marker = fully_read(&bob_session, &room_id).await?;
    assert_eq!(marker["event_id"], json!(latest), "fully read: {marker}");
    println!("\"Mark as read\" sets m.fully_read on the latest message, not the topic change");
    wait_for(&a, "bob's read receipt on the message", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                event_id: Some(id),
                read_by,
                ..
            } if *id == latest && read_by.iter().any(|r| r.user_id == bob_id) => Some(()),
            _ => None,
        })
    })
    .await?;
    println!("bob's unthreaded receipt shows on the message");

    a.send_message(
        wizardchat_core::MessageKind::Text,
        "emoji",
        Some(r#"<img data-mx-emoticon src="mxc://localhost/abc" alt=":e:"> <a href="matrix:r/room:localhost">room</a>"#),
        None,
        None,
    )
    .await?;
    let html = wait_for(&b, "the formatted message", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content:
                    EntryContent::Text {
                        body,
                        html: Some(html),
                        ..
                    },
                ..
            } if body == "emoji" => Some(html.clone()),
            _ => None,
        })
    })
    .await?;
    assert!(html.contains("data-mx-emoticon"), "{html}");
    assert!(html.contains("matrix:r/room:localhost"), "{html}");
    println!("custom emoji and matrix: links survive sanitising");

    a.send_event(
        "m.room.message",
        json!({ "msgtype": "com.example.custom", "body": "custom body" }),
    )
    .await?;
    a.send_event(
        "m.poll.start",
        json!({
            "m.text": [{ "body": "stable poll fallback" }],
            "m.poll": {
                "question": { "m.text": [{ "body": "Stable?" }] },
                "answers": [
                    { "m.id": "a", "m.text": [{ "body": "yes" }] },
                    { "m.id": "b", "m.text": [{ "body": "no" }] }
                ],
                "kind": "m.disclosed",
                "max_selections": 1
            }
        }),
    )
    .await?;
    wait_for(&b, "the custom msgtype", |e| event_id_of(e, "custom body")).await?;
    wait_for(&b, "the stable poll", |e| {
        event_id_of(e, "stable poll fallback")
    })
    .await?;
    println!("custom msgtypes and stable polls show their text");

    a.send_poll("Question?", &["one".into(), "two".into()], 1, false)
        .await?;
    let poll_id = wait_for(&a, "the poll", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content: EntryContent::Poll { poll },
                event_id: Some(id),
                ..
            } if poll.question == "Question?" => Some(id.clone()),
            _ => None,
        })
    })
    .await?;
    let block = json!({
        "question": { "m.text": "Edited?", "org.matrix.msc1767.text": "Edited?", "body": "Edited?", "msgtype": "m.text" },
        "kind": "org.matrix.msc3381.poll.disclosed",
        "m.poll.disclosed": "m.poll.disclosed",
        "max_selections": 1,
        "answers": [
            { "id": "a0", "m.text": "one", "org.matrix.msc1767.text": "one", "body": "one" },
            { "id": "a1", "m.text": "three", "org.matrix.msc1767.text": "three", "body": "three" }
        ]
    });
    a.send_event(
        "org.matrix.msc3381.poll.start",
        json!({
            "m.new_content": {
                "org.matrix.msc3381.poll.start": block,
                "m.poll.start": block,
                "org.matrix.msc1767.text": "Edited?\n1. one\n2. three",
                "body": "Edited?\n1. one\n2. three",
                "msgtype": "m.text"
            },
            "m.relates_to": { "rel_type": "m.replace", "event_id": poll_id },
            "body": "* Edited?\n1. one\n2. three",
            "msgtype": "m.text"
        }),
    )
    .await?;
    wait_for(&b, "the edited poll", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content: EntryContent::Poll { poll },
                ..
            } if poll.question == "Edited?" && poll.answers.iter().any(|x| x.text == "three") => {
                Some(())
            }
            _ => None,
        })
    })
    .await?;
    println!("poll edits apply");

    a.send_location("Here", "geo:52.5,13.4", Some("Here"))
        .await?;
    let location_id = wait_for(&a, "the location", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content: EntryContent::Location { .. },
                event_id: Some(id),
                ..
            } => Some(id.clone()),
            _ => None,
        })
    })
    .await?;
    let source = alice.event_source(&room_id, &location_id).await?;
    let content = &source.original["content"];
    assert_eq!(content["org.matrix.msc3488.asset"]["type"], json!("m.self"));
    assert!(content["org.matrix.msc3488.ts"].is_u64(), "{content}");
    println!("locations carry asset and ts");

    let mut progress = Vec::new();
    let uploaded = a
        .upload_file(vec![7u8; 4096], "audio/ogg", |p| progress.push(p))
        .await?;
    assert!(progress.last().is_some_and(|p| p.current == p.total));
    a.send_uploaded(
        UploadedAttachment {
            source: uploaded,
            size: 4096,
            filename: "Voice message.ogg".into(),
            mimetype: "audio/ogg".into(),
            caption: Some("Voice message".into()),
            voice: true,
            duration_ms: Some(1200),
            waveform: Some(vec![0, 512, 1024]),
            ..Default::default()
        },
        Some(&latest),
    )
    .await?;
    let voice_id = wait_for(&b, "the voice message", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content: EntryContent::Audio { media },
                event_id: Some(id),
                in_reply_to: Some(_),
                ..
            } if media.voice && media.waveform.is_some() => Some(id.clone()),
            _ => None,
        })
    })
    .await?;
    let source = bob.event_source(&room_id, &voice_id).await?;
    let content = &source.original["content"];
    assert_eq!(content["body"], json!("Voice message"));
    assert_eq!(content["filename"], json!("Voice message.ogg"));
    assert!(
        content["org.matrix.msc1767.file"]["url"].is_string(),
        "{content}"
    );
    assert_eq!(content["org.matrix.msc1767.text"], json!("Voice message"));
    println!("pre-uploaded voice message (reply) with msc1767 blocks");

    let secret_id = alice.create_room("Encrypted upload").await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    let secret = alice.timeline(&secret_id).await?;
    let blurhash = wizardchat_core::encode_blurhash(&[200u8; 4 * 8 * 6], 8, 6)?;
    assert_eq!(
        wizardchat_core::decode_blurhash(&blurhash, 4, 4)?.len(),
        4 * 4 * 4
    );
    let uploaded = secret
        .upload_file(vec![1u8; 2048], "image/png", |_| {})
        .await?;
    assert!(uploaded.get("file").is_some(), "{uploaded}");
    secret
        .send_uploaded(
            UploadedAttachment {
                source: uploaded,
                size: 2048,
                filename: "pic.png".into(),
                mimetype: "image/png".into(),
                caption: Some("**look**".into()),
                width: Some(10),
                height: Some(10),
                spoiler: true,
                blurhash: Some(blurhash.clone()),
                ..Default::default()
            },
            None,
        )
        .await?;
    let image = wait_for(&secret, "the encrypted image", |entries| {
        entries.iter().find_map(|e| match e {
            TimelineEntry::Event {
                content: EntryContent::Image { media },
                send_state: None,
                ..
            } => Some(media.clone()),
            _ => None,
        })
    })
    .await?;
    assert!(image.source.get("file").is_some(), "{:?}", image.source);
    assert!(image.spoiler, "{image:?}");
    assert_eq!(image.blurhash.as_ref(), Some(&blurhash));
    assert_eq!(image.caption_html.as_deref(), Some("<strong>look</strong>"));
    println!("pre-uploaded encrypted image with caption, spoiler and blurhash");

    bob.report_event(&room_id, &latest, Some("test")).await?;
    println!("report with score accepted");

    let public_id = alice
        .create_room_with(CreateRoomOptions {
            name: "Upgrade test".into(),
            is_public: true,
            ..Default::default()
        })
        .await?;
    bob.join(&public_id, &[]).await?;
    let replacement = alice.upgrade_room(&public_id, "11").await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    let joined = bob.join_upgraded_room(&public_id).await?;
    assert_eq!(joined, replacement);
    println!("joined the upgraded room through the upgrader's server");

    alice.stop_sync().await;
    bob.stop_sync().await;
    Ok(())
}
