//! End-to-end check of timeline extras, threads, spaces, the directory, trust and push rules,
//! with two accounts.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example extras

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use serde_json::json;
use wizardchat_core::{
    Attachment, CreateRoomOptions, EntryContent, ListDiff, MentionsInput, MessageKind,
    NotificationGroup, NotificationLevel, NotificationMode, StoreConfig, TimelineEntry,
    WizardClient,
};

use common::BoxError;

async fn eventually<T>(
    what: &str,
    mut check: impl AsyncFnMut() -> Option<T>,
) -> Result<T, BoxError> {
    for _ in 0..60 {
        if let Some(value) = check().await {
            return Ok(value);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!("timed out waiting for {what}").into())
}

type Entries = Arc<Mutex<Vec<TimelineEntry>>>;

async fn watch(
    client: &WizardClient,
    room: &str,
) -> Result<(Arc<wizardchat_core::RoomTimeline>, Entries), BoxError> {
    let timeline = Arc::new(client.timeline(room).await?);
    let entries: Entries = Arc::default();
    {
        let (timeline, entries) = (timeline.clone(), entries.clone());
        tokio::spawn(async move {
            timeline
                .watch(|diffs: Vec<ListDiff<TimelineEntry>>| {
                    let mut list = entries.lock().unwrap();
                    for diff in diffs {
                        diff.apply(&mut list);
                    }
                })
                .await
        });
    }
    Ok((timeline, entries))
}

fn find(entries: &Entries, pred: impl Fn(&TimelineEntry) -> bool) -> Option<TimelineEntry> {
    entries.lock().unwrap().iter().find(|e| pred(e)).cloned()
}

fn body_is(e: &TimelineEntry, text: &str) -> bool {
    matches!(e, TimelineEntry::Event { content: EntryContent::Text { body, .. } | EntryContent::Emote { body, .. } | EntryContent::Notice { body, .. }, event_id: Some(_), .. } if body == text)
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let started = std::time::Instant::now();
    let me = common::register("extras", "me").await?.0;
    let strict = StoreConfig {
        exclude_insecure_devices: true,
        ..common::store("extras", "other")
    };
    let other = common::register_in("extras", "other", strict).await?.0;
    me.start_sync().await?;
    other.start_sync().await?;
    let other_id = other.user_id().unwrap();
    println!("two accounts (the second excludes insecure devices)");

    let room = me
        .create_room_with(CreateRoomOptions {
            name: "Extras".into(),
            encrypted: Some(false),
            invite: vec![other_id.clone()],
            ..Default::default()
        })
        .await?;
    eventually("the invite", async || other.accept_invite(&room).await.ok()).await?;
    let (mine, entries) = watch(&me, &room).await?;
    let (theirs, their_entries) = watch(&other, &room).await?;

    mine.send_message(
        MessageKind::Text,
        "hello @other",
        None,
        None,
        Some(MentionsInput {
            user_ids: vec![other_id.clone()],
            room: false,
        }),
    )
    .await?;
    mine.send_message(MessageKind::Emote, "waves", None, None, None)
        .await?;
    mine.send_message(
        MessageKind::Notice,
        "a notice",
        Some("<b>a notice</b>"),
        None,
        None,
    )
    .await?;
    mine.send_location("Berlin", "geo:52.52,13.405", Some("TV tower"))
        .await?;
    mine.send_attachment(
        Attachment {
            bytes: vec![0; 64],
            filename: "voice.ogg".into(),
            mimetype: "audio/ogg".into(),
            voice: true,
            duration_ms: Some(1500),
            waveform: Some(vec![0, 512, 1024]),
            ..Default::default()
        },
        None,
    )
    .await?;
    mine.send_attachment(
        Attachment {
            bytes: vec![0; 16],
            filename: "secret.png".into(),
            mimetype: "image/png".into(),
            spoiler: true,
            spoiler_reason: Some("plot".into()),
            ..Default::default()
        },
        None,
    )
    .await?;
    let hello = eventually("the mention", async || {
        find(&their_entries, |e| body_is(e, "hello @other") && matches!(e, TimelineEntry::Event { mentions: Some(m), .. } if m.user_ids.contains(&other_id)))
    })
    .await?;
    eventually("emote and notice", async || {
        (find(&their_entries, |e| body_is(e, "waves") && matches!(e, TimelineEntry::Event { content: EntryContent::Emote { .. }, .. })).is_some()
            && find(&their_entries, |e| matches!(e, TimelineEntry::Event { content: EntryContent::Notice { html: Some(h), .. }, .. } if h.contains("<b>"))).is_some())
        .then_some(())
    })
    .await?;
    eventually("the location", async || {
        find(&their_entries, |e| matches!(e, TimelineEntry::Event { content: EntryContent::Location { geo_uri, description: Some(d), .. }, .. } if geo_uri == "geo:52.52,13.405" && d == "TV tower"))
    })
    .await?;
    eventually("the voice message", async || {
        find(&their_entries, |e| matches!(e, TimelineEntry::Event { content: EntryContent::Audio { media }, .. } if media.voice && media.waveform.as_ref().is_some_and(|w| w.len() == 3)))
    })
    .await?;
    eventually("the spoiler", async || {
        find(&their_entries, |e| matches!(e, TimelineEntry::Event { content: EntryContent::Image { media }, .. } if media.spoiler && media.spoiler_reason.as_deref() == Some("plot")))
    })
    .await?;
    println!("mentions, emote, notice, location, voice message with waveform, spoiler with reason");

    theirs.mark_as_read(false).await?;
    let _ = hello;
    eventually("their read receipt", async || {
        find(&entries, |e| matches!(e, TimelineEntry::Event { read_by, .. } if read_by.iter().any(|r| r.user_id == other_id)))
    })
    .await?;
    println!("read receipts show who read up to a message");

    let root = find(&entries, |e| body_is(e, "waves")).and_then(|e| match e {
        TimelineEntry::Event { event_id, .. } => event_id,
        _ => None,
    });
    let root = root.ok_or("no root")?;
    let thread = other
        .timeline_of(
            &room,
            wizardchat_core::TimelineKind::Thread {
                root_event_id: root.clone(),
            },
        )
        .await?;
    thread.send_text("in a thread", None).await?;
    let page = eventually("the thread list", async || {
        let page = me.threads(&room, false, None).await.ok()?;
        page.threads
            .iter()
            .any(|t| t.root_event_id == root && t.replies >= 1)
            .then_some(page)
    })
    .await?;
    let mine_only = me.threads(&room, true, None).await?;
    println!(
        "thread list ({} thread, {} I took part in)",
        page.threads.len(),
        mine_only.threads.len()
    );

    match me.url_preview("https://example.org").await {
        Ok(preview) => println!("link preview: {:?}", preview.map(|p| p.title)),
        Err(e) => println!("  link previews unavailable on this server ({e})"),
    }

    let space = me
        .create_room_with(CreateRoomOptions {
            name: "Extras space".into(),
            is_space: true,
            ..Default::default()
        })
        .await?;
    me.add_to_space(&space, &room, true).await?;
    me.update_space_child(&space, &room, Some(false), Some(Some("a".into())))
        .await?;
    let child = me
        .state_event(&space, "m.space.child", &room)
        .await?
        .ok_or("no child")?;
    assert_eq!(child["order"], json!("a"));
    assert_eq!(child["suggested"], json!(false));
    me.remove_from_space(&space, &room).await?;
    assert!(me
        .state_event(&space, "m.space.child", &room)
        .await?
        .is_none());
    println!("added to a space as suggested, reordered, removed");

    let page = me
        .public_rooms_page("", None, Some("rooms"), 5, None)
        .await?;
    println!(
        "directory page: {} rooms, next {:?}",
        page.rooms.len(),
        page.next.is_some()
    );

    let trust = me.user_trust(&other_id).await?;
    println!(
        "trust in {other_id}: identity {}, verified {}",
        trust.has_identity, trust.verified
    );
    if trust.has_identity {
        let flow = me.request_user_verification(&other_id).await?;
        flow.cancel().await.ok();
        println!("asked {other_id} to verify, then cancelled");
    }

    me.set_push_rule_level("underride", ".m.rule.message", "silent")
        .await?;
    let rules = me.push_rules().await?;
    let rule = rules["underride"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["rule_id"] == ".m.rule.message")
        .unwrap()
        .clone();
    assert!(rule["actions"]
        .as_array()
        .unwrap()
        .iter()
        .all(|a| a.get("set_tweak") != Some(&json!("sound"))));
    me.set_push_rule_level("underride", ".m.rule.message", "loud")
        .await?;
    println!("push rule levels set (silent, then loud)");

    let rule_of = |rules: &serde_json::Value, kind: &str, id: &str| {
        rules[kind]
            .as_array()
            .and_then(|list| list.iter().find(|r| r["rule_id"] == id).cloned())
    };
    me.set_push_rule_level("override", ".m.rule.is_user_mention", "off")
        .await?;
    let rules = me.push_rules().await?;
    let mention = rule_of(&rules, "override", ".m.rule.is_user_mention").unwrap();
    assert_eq!(mention["enabled"], json!(true));
    assert_eq!(mention["actions"], json!([]));
    me.set_push_rule_level("override", ".m.rule.is_user_mention", "silent")
        .await?;
    let rules = me.push_rules().await?;
    let mention = rule_of(&rules, "override", ".m.rule.is_user_mention").unwrap();
    assert!(mention["actions"]
        .as_array()
        .unwrap()
        .contains(&json!({ "set_tweak": "highlight" })));
    println!("\"off\" empties the rule's actions; back on, it highlights again");

    me.set_notification_level(NotificationGroup::GroupChats, NotificationLevel::Noisy)
        .await?;
    me.set_notification_level(NotificationGroup::UserMentions, NotificationLevel::On)
        .await?;
    let levels = me.notification_rules().await;
    assert_eq!(levels.group_chats, NotificationLevel::Noisy);
    assert_eq!(levels.user_mentions, Some(NotificationLevel::On));
    let rules = me.push_rules().await?;
    let mention = rule_of(&rules, "override", ".m.rule.is_user_mention").unwrap();
    assert!(mention["actions"]
        .as_array()
        .unwrap()
        .contains(&json!({ "set_tweak": "highlight" })));
    me.set_notification_level(NotificationGroup::GroupChats, NotificationLevel::Off)
        .await?;
    assert_eq!(
        me.notification_rules().await.group_chats,
        NotificationLevel::Off
    );
    me.set_notification_level(NotificationGroup::GroupChats, NotificationLevel::On)
        .await?;
    me.set_notification_level(NotificationGroup::UserMentions, NotificationLevel::Noisy)
        .await?;
    println!("notification levels per group set and read back; mentions keep their highlight");

    me.add_notification_keyword("wizardword").await?;
    assert!(me
        .notification_rules()
        .await
        .keywords
        .contains(&"wizardword".to_owned()));
    let rules = me.push_rules().await?;
    let keyword = rule_of(&rules, "content", "wizardword").unwrap();
    assert!(keyword["actions"]
        .as_array()
        .unwrap()
        .contains(&json!({ "set_tweak": "highlight" })));
    me.remove_notification_keyword("wizardword").await?;
    assert!(rule_of(&me.push_rules().await?, "content", "wizardword").is_none());
    println!("keyword rule highlights, visible without waiting for sync, removed");

    me.set_room_notification_mode(&room, Some(NotificationMode::Mentions))
        .await?;
    let rules = me.push_rules().await?;
    for suffix in ["displayname", "user_ids", "at_room"] {
        assert!(rule_of(&rules, "override", &format!("{room}.mentions.{suffix}")).is_some());
    }
    assert_eq!(
        me.room_notification_mode(&room).await?,
        Some(NotificationMode::Mentions)
    );
    me.set_room_notification_mode(&room, None).await?;
    let rules = me.push_rules().await?;
    assert!(rule_of(&rules, "override", &format!("{room}.mentions.user_ids")).is_none());
    assert_eq!(me.room_notification_mode(&room).await?, None);
    println!("room \"mentions & keywords\" adds its own mention rules; default removes them");

    let notifications: Arc<Mutex<Vec<wizardchat_core::Notification>>> = Arc::default();
    let collected = notifications.clone();
    let watcher = other.watch_notifications(move |n| collected.lock().unwrap().push(n));
    let checks = async {
        tokio::time::sleep(Duration::from_secs(1)).await;
        mine.send_message(
            MessageKind::Text,
            "secret",
            Some("<span data-mx-spoiler>secret</span>"),
            None,
            None,
        )
        .await?;
        let spoiler = eventually("the spoiler notification", async || {
            notifications
                .lock()
                .unwrap()
                .iter()
                .find(|n| n.spoiler)
                .cloned()
        })
        .await?;
        assert!(spoiler.body.is_empty());
        println!("spoiler notifies without its text");

        other
            .set_room_notification_mode(&room, Some(NotificationMode::Mentions))
            .await?;
        theirs
            .send_message(MessageKind::Text, "my question", None, None, None)
            .await?;
        let question = eventually("their message", async || {
            find(&entries, |e| body_is(e, "my question"))
        })
        .await?;
        let TimelineEntry::Event {
            event_id: Some(question_id),
            ..
        } = question
        else {
            unreachable!()
        };
        // Only the reply fallback is left to notify them
        for rule in [
            format!("{room}.mentions.user_ids"),
            ".m.rule.is_user_mention".into(),
        ] {
            other.set_push_rule_level("override", &rule, "off").await?;
        }
        mine.send_message(MessageKind::Text, "not for you", None, None, None)
            .await?;
        mine.send_message(
            MessageKind::Text,
            "the answer",
            None,
            Some(&question_id),
            None,
        )
        .await?;
        eventually("the reply notification", async || {
            notifications
                .lock()
                .unwrap()
                .iter()
                .any(|n| n.body.contains("the answer"))
                .then_some(())
        })
        .await?;
        assert!(!notifications
            .lock()
            .unwrap()
            .iter()
            .any(|n| n.body == "not for you"));
        println!("in \"mentions\" mode only the reply to them notifies (reply fallback)");
        other.set_room_notification_mode(&room, None).await?;
        Ok::<(), BoxError>(())
    };
    tokio::select! {
        () = watcher => return Err("notification watcher ended".into()),
        result = checks => result?,
    }

    for id in [&room, &space] {
        me.leave(id).await.ok();
    }
    other.leave(&room).await.ok();
    me.logout().await.ok();
    other.logout().await.ok();
    println!("took {}s", started.elapsed().as_secs());
    std::process::exit(0);
}
