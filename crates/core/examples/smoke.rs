//! End-to-end check of the core against a real homeserver:
//! sign in, sync, create a room, send a message, and wait for the room list and timeline.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example smoke

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::{future::Future, time::Duration};

use futures_util::StreamExt;
use tokio::sync::oneshot;
use wizardchat_core::{EntryContent, RoomSummary, TimelineEntry};

use common::BoxError;

/// Runs `watch` until `done` fires, failing after 30 seconds.
async fn until(
    what: &str,
    done: oneshot::Receiver<()>,
    watch: impl Future,
) -> Result<(), BoxError> {
    tokio::select! {
        _ = done => Ok(()),
        _ = watch => Err(format!("stream ended before {what}").into()),
        _ = tokio::time::sleep(Duration::from_secs(30)) => Err(format!("timed out waiting for {what}").into()),
    }
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let (client, session, _) = common::register("smoke", "a").await?;
    let store_dir = common::store("smoke", "a").location;
    println!(
        "registered {} (device {})",
        session.user_id, session.device_id
    );

    client.start_sync().await?;
    let room_name = format!("Smoke test {}", std::process::id());
    let room_id = client.create_room(&room_name).await?;
    println!("created {room_id}");

    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut rooms: Vec<RoomSummary> = Vec::new();
    until(
        "the new room in the room list",
        rx,
        client.watch_rooms(100, futures_util::stream::pending(), |diffs| {
            for diff in diffs {
                diff.apply(&mut rooms);
            }
            if rooms
                .iter()
                .any(|r| r.id == room_id && r.name.as_deref() == Some(room_name.as_str()))
            {
                if let Some(tx) = tx.take() {
                    println!("room list shows \"{room_name}\" ({} rooms)", rooms.len());
                    let _ = tx.send(());
                }
            }
        }),
    )
    .await?;

    let timeline = client.timeline(&room_id).await?;
    let body = "hello from wizardchat-core";
    timeline.send_text(body, None).await?;
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut entries: Vec<TimelineEntry> = Vec::new();
    until("the sent message from the server", rx, timeline.watch(|diffs| {
        for diff in diffs {
            diff.apply(&mut entries);
        }
        let echoed = entries.iter().any(|e| {
            matches!(e, TimelineEntry::Event { content: EntryContent::Text { body: b, .. }, event_id: Some(_), .. } if b == body)
        });
        if echoed {
            if let Some(tx) = tx.take() {
                println!("timeline shows the message with its server event ID ({} entries)", entries.len());
                let _ = tx.send(());
            }
        }
    }))
    .await?;

    let find = |entries: &[TimelineEntry], pred: &dyn Fn(&TimelineEntry) -> bool| {
        entries.iter().find(|e| pred(e)).cloned()
    };
    let event_of = |entry: &TimelineEntry| match entry {
        TimelineEntry::Event {
            item_key, event_id, ..
        } => (item_key.clone(), event_id.clone()),
        _ => unreachable!(),
    };
    let first = find(&entries, &|e| matches!(e, TimelineEntry::Event { content: EntryContent::Text { body: b, .. }, .. } if b == body))
        .expect("first message");
    let (first_key, first_event) = event_of(&first);

    // Reply, react, edit, upload: then wait until the timeline reflects all of them
    timeline
        .send_text("a **reply**", first_event.as_deref())
        .await?;
    timeline.toggle_reaction(&first_key, "👍").await?;
    timeline
        .edit_text(
            &first_key,
            "hello from wizardchat-core (edited)",
            None,
            None,
        )
        .await?;
    let png: Vec<u8> = vec![
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0,
        0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0x0d, 0x49, 0x44,
        0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0, 0x05, 0x00, 0x01, 0xff,
        0x89, 0x99, 0x3d, 0x1d, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];
    timeline
        .send_attachment(
            wizardchat_core::Attachment {
                bytes: png.clone(),
                filename: "pixel.png".into(),
                mimetype: "image/png".into(),
                caption: Some("a tiny pixel".into()),
                width: Some(1),
                height: Some(1),
                ..Default::default()
            },
            None,
        )
        .await?;
    timeline.set_typing(true).await?;

    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut entries: Vec<TimelineEntry> = Vec::new();
    let mut image_source = None;
    until("reply, reaction, edit and upload", rx, timeline.watch(|diffs| {
        for diff in diffs {
            diff.apply(&mut entries);
        }
        let reply_ok = entries.iter().any(|e| matches!(e, TimelineEntry::Event {
            content: EntryContent::Text { html: Some(h), .. }, in_reply_to: Some(_), event_id: Some(_), .. } if h.contains("<strong>reply</strong>")));
        let edited_ok = entries.iter().any(|e| matches!(e, TimelineEntry::Event {
            content: EntryContent::Text { body: b, .. }, edited: true, reactions, .. }
            if b.ends_with("(edited)") && reactions.iter().any(|r| r.key == "👍" && r.mine)));
        let image = entries.iter().find_map(|e| match e {
            TimelineEntry::Event { content: EntryContent::Image { media }, event_id: Some(_), .. } => Some(media.clone()),
            _ => None,
        });
        if reply_ok && edited_ok {
            if let Some(media) = image {
                if let Some(tx) = tx.take() {
                    println!("reply (rendered HTML), 👍 reaction, edit and image upload all in the timeline");
                    println!("  image: {} ({}x{}, caption {:?})", media.filename, media.width.unwrap_or(0), media.height.unwrap_or(0), media.caption);
                    image_source = Some(media.source);
                    let _ = tx.send(());
                }
            }
        }
    }))
    .await?;

    let bytes = client
        .media(image_source.expect("image source"), None)
        .await?;
    assert_eq!(bytes, png, "downloaded media differs from the upload");
    println!("downloaded the image again, bytes match");

    timeline.set_typing(false).await?;
    timeline.redact(&first_key, Some("smoke test")).await?;
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut entries: Vec<TimelineEntry> = Vec::new();
    until("the redaction", rx, timeline.watch(|diffs| {
        for diff in diffs {
            diff.apply(&mut entries);
        }
        if entries.iter().any(|e| matches!(e, TimelineEntry::Event { item_key, content: EntryContent::Redacted { .. }, .. } if *item_key == first_key)) {
            if let Some(tx) = tx.take() {
                println!("deleted the first message");
                let _ = tx.send(());
            }
        }
    }))
    .await?;

    timeline.mark_as_read(false).await?;
    println!("marked as read");

    // Spaces and room management
    let space_id = client
        .create_room_with(wizardchat_core::CreateRoomOptions {
            name: "Smoke space".into(),
            is_space: true,
            ..Default::default()
        })
        .await?;
    let child_id = client
        .create_room_with(wizardchat_core::CreateRoomOptions {
            name: "Space child".into(),
            topic: Some("inside the space".into()),
            parent_space_id: Some(space_id.clone()),
            ..Default::default()
        })
        .await?;
    println!("created a space with a room in it");

    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut spaces: Vec<wizardchat_core::SpaceSummary> = Vec::new();
    until(
        "the new space in the space list",
        rx,
        client.watch_spaces(|diffs| {
            for diff in diffs {
                diff.apply(&mut spaces);
            }
            if spaces.iter().any(|s| s.id == space_id) {
                if let Some(tx) = tx.take() {
                    let _ = tx.send(());
                }
            }
        }),
    )
    .await?;
    println!("space list shows \"Smoke space\"");

    let children = client.space_children(&space_id).await?;
    assert!(
        children.iter().any(|c| c.id == child_id && c.joined),
        "child missing from the hierarchy"
    );
    println!("space hierarchy lists the child room as joined");

    let (filter_tx, filter_rx) = futures_util::stream::iter(vec![wizardchat_core::RoomFilter {
        space_id: Some(space_id.clone()),
        ..Default::default()
    }])
    .chain(futures_util::stream::pending())
    .boxed()
    .into_future()
    .await;
    let filters = futures_util::stream::iter(filter_tx).chain(filter_rx);
    let (tx, rx) = oneshot::channel();
    let mut tx = Some(tx);
    let mut rooms: Vec<RoomSummary> = Vec::new();
    until(
        "the space filter",
        rx,
        client.watch_rooms(100, filters, |diffs| {
            for diff in diffs {
                diff.apply(&mut rooms);
            }
            if rooms.len() == 1 && rooms[0].id == child_id {
                if let Some(tx) = tx.take() {
                    let _ = tx.send(());
                }
            }
        }),
    )
    .await?;
    println!("filtering by the space shows only its room");

    let details = client.room_details(&child_id).await?;
    assert_eq!(details.topic.as_deref(), Some("inside the space"));
    assert!(
        details.is_encrypted
            && details.permissions.invite
            && details.own_power_level.is_none_or(|l| l >= 100)
    );
    let members = client.members(&child_id).await?;
    assert_eq!(members.len(), 1);
    println!("room details (topic, encrypted, own permissions) and members");

    client.set_favourite(&child_id, true).await?;
    client.leave(&child_id).await?;
    client.leave(&space_id).await?;
    println!("favourite, then left the room and the space");
    // Profiles, custom status and presence
    client.set_display_name("Core Smoke").await?;
    let avatar = client.set_avatar(png.clone(), "image/png").await?;
    let expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000;
    client
        .set_custom_status(
            "testing the core",
            Some(expires),
            wizardchat_core::Presence::Online,
        )
        .await?;
    let profile = client.own_profile().await?;
    assert_eq!(profile.display_name.as_deref(), Some("Core Smoke"));
    assert_eq!(profile.avatar_url.as_deref(), Some(avatar.as_str()));
    assert_eq!(
        profile.custom_status.as_ref().map(|s| s.text.as_str()),
        Some("testing the core")
    );
    println!("display name, avatar and custom status (with expiry) set and read back");
    println!(
        "  presence supported: {}, presence: {:?}",
        client.presence_supported().await,
        profile.presence.map(|p| p.state)
    );
    client
        .clear_custom_status(wizardchat_core::Presence::Online)
        .await?;
    client.remove_avatar().await?;
    assert!(client.own_profile().await?.custom_status.is_none());
    client.ignore_user("@nobody:localhost").await?;
    assert!(client.user_profile("@wzcore:localhost").await.is_ok());
    client.unignore_user("@nobody:localhost").await?;
    println!("cleared status and avatar, ignored and unignored a user");

    // Polls, threads and pins
    let room = client.create_room("Threads and polls").await?;
    let timeline = client.timeline(&room).await?;
    timeline
        .send_poll(
            "Pizza or pasta?",
            &["Pizza".into(), "Pasta".into()],
            1,
            false,
        )
        .await?;
    timeline.send_text("thread root", None).await?;
    let entries = std::sync::Arc::new(std::sync::Mutex::new(Vec::<TimelineEntry>::new()));
    let watcher = {
        let entries = entries.clone();
        let timeline = client.timeline(&room).await?;
        tokio::spawn(async move {
            timeline
                .watch(|diffs| {
                    let mut list = entries.lock().unwrap();
                    for diff in diffs {
                        diff.apply(&mut list);
                    }
                })
                .await
        })
    };
    let find_event = |pred: &dyn Fn(&TimelineEntry) -> bool| -> Option<TimelineEntry> {
        entries.lock().unwrap().iter().find(|e| pred(e)).cloned()
    };
    let wait = async |what: &str,
                      pred: &dyn Fn(&TimelineEntry) -> bool|
           -> Result<TimelineEntry, BoxError> {
        for _ in 0..60 {
            if let Some(e) = find_event(pred) {
                return Ok(e);
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        Err(format!("timed out waiting for {what}").into())
    };
    let poll = wait("the poll", &|e| {
        matches!(
            e,
            TimelineEntry::Event {
                content: EntryContent::Poll { .. },
                event_id: Some(_),
                ..
            }
        )
    })
    .await?;
    let TimelineEntry::Event {
        event_id: Some(poll_id),
        ..
    } = &poll
    else {
        unreachable!()
    };
    timeline.vote(poll_id, &["a0".into()]).await?;
    wait("the vote", &|e| {
        matches!(e, TimelineEntry::Event { content: EntryContent::Poll { poll }, .. }
        if poll.my_votes == ["a0"] && poll.answers[0].votes == 1)
    })
    .await?;
    timeline.end_poll(poll_id).await?;
    wait("the poll to end", &|e| matches!(e, TimelineEntry::Event { content: EntryContent::Poll { poll }, .. } if poll.ended)).await?;
    println!("poll created, voted on (results and own vote) and ended");

    let root = wait("the thread root", &|e| matches!(e, TimelineEntry::Event { content: EntryContent::Text { body, .. }, event_id: Some(_), .. } if body == "thread root")).await?;
    let TimelineEntry::Event {
        event_id: Some(root_id),
        ..
    } = &root
    else {
        unreachable!()
    };
    let thread = client
        .timeline_of(
            &room,
            wizardchat_core::TimelineKind::Thread {
                root_event_id: root_id.clone(),
            },
        )
        .await?;
    thread.send_text("a reply in the thread", None).await?;
    wait(
        "the thread summary",
        &|e| matches!(e, TimelineEntry::Event { thread: Some(t), .. } if t.replies == 1),
    )
    .await?;
    assert!(find_event(&|e| matches!(e, TimelineEntry::Event { content: EntryContent::Text { body, .. }, .. } if body == "a reply in the thread")).is_none(),
        "thread replies must not show in the main timeline");
    println!("thread reply: summary on the root, hidden from the main timeline");

    timeline.pin(root_id).await?;
    let mut pinned = false;
    for _ in 0..30 {
        if client
            .room_details(&room)
            .await?
            .pinned_event_ids
            .contains(root_id)
        {
            pinned = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    assert!(pinned, "pinned event missing from the room details");
    timeline.unpin(root_id).await?;
    println!("pinned and unpinned a message");
    watcher.abort();
    client.leave(&room).await?;

    // Notification settings and synced app settings
    use wizardchat_core::NotificationMode;
    let before = client.notification_prefs().await;
    client
        .set_default_notification_mode(false, NotificationMode::Mentions)
        .await?;
    client.add_notification_keyword("wizard").await?;
    // Push rules come back through sync, so give the new rules a moment
    let mut after = client.notification_prefs().await;
    for _ in 0..20 {
        if after.group_chats == NotificationMode::Mentions
            && after.keywords.iter().any(|k| k == "wizard")
        {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        after = client.notification_prefs().await;
    }
    assert_eq!(after.group_chats, NotificationMode::Mentions);
    assert!(after.keywords.iter().any(|k| k == "wizard"));
    client.remove_notification_keyword("wizard").await?;
    client
        .set_default_notification_mode(false, before.group_chats)
        .await?;
    let room = client.create_room("Notification test").await?;
    client
        .set_room_notification_mode(&room, Some(NotificationMode::Mute))
        .await?;
    assert_eq!(
        client.room_notification_mode(&room).await?,
        Some(NotificationMode::Mute)
    );
    client.set_room_notification_mode(&room, None).await?;
    assert_eq!(client.room_notification_mode(&room).await?, None);
    client.leave(&room).await?;
    println!("notification defaults, keywords and per-room mute set and read back");
    client
        .set_account_data(
            "org.wizardchat.settings",
            serde_json::json!({ "theme": "hallow" }),
        )
        .await?;
    let stored = client.account_data("org.wizardchat.settings").await?;
    assert_eq!(
        stored.and_then(|v| v.get("theme").cloned()),
        Some(serde_json::json!("hallow"))
    );
    println!("synced settings stored in account data");

    client.logout().await?;
    let _ = std::fs::remove_dir_all(&store_dir);
    println!("signed out");
    // Don't wait for background sync requests to time out
    std::process::exit(0)
}
