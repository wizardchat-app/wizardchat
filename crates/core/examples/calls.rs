//! End-to-end check of call signalling with two devices of the same account: memberships,
//! media key exchange, membership renewal, the delayed leave (also when the server loses it),
//! rejoining after the membership vanished, and ringing another account. Needs no SFU.
//!
//!     WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example calls

#![recursion_limit = "256"]

#[path = "common/mod.rs"]
mod common;

use std::{sync::Arc, time::Duration};

use serde_json::json;
use tokio::{sync::mpsc, task::JoinHandle};
use wizardchat_core::{
    CallErrorKind, CallEvent, CallStatus, CallTimings, CreateRoomOptions, IncomingCallEvent,
    MediaState, RingEnd,
};

use common::BoxError;

async fn next_matching(
    rx: &mut mpsc::UnboundedReceiver<CallEvent>,
    what: &str,
    pred: impl Fn(&CallEvent) -> bool,
) -> Result<CallEvent, BoxError> {
    loop {
        match tokio::time::timeout(Duration::from_secs(40), rx.recv()).await {
            Ok(Some(event)) if pred(&event) => return Ok(event),
            Ok(Some(CallEvent::Error { message, fatal, .. })) => {
                println!("  (error: {message})");
                if fatal {
                    return Err(format!("fatal call error waiting for {what}: {message}").into());
                }
            }
            Ok(Some(_)) => {}
            _ => return Err(format!("timed out waiting for {what}").into()),
        }
    }
}

fn run(
    session: Arc<wizardchat_core::CallSession>,
) -> (mpsc::UnboundedReceiver<CallEvent>, JoinHandle<()>) {
    let (tx, rx) = mpsc::unbounded_channel();
    session.report_media(MediaState::Connected, None);
    let task = tokio::spawn(async move { session.run(|event| drop(tx.send(event))).await });
    (rx, task)
}

async fn eventually(
    what: &str,
    secs: u64,
    mut check: impl AsyncFnMut() -> bool,
) -> Result<(), BoxError> {
    for _ in 0..secs * 2 {
        if check().await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!("timed out waiting for {what}").into())
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let started = std::time::Instant::now();
    let (a, _, account) = common::register("calls", "a").await?;
    let a = Arc::new(a);
    let b = Arc::new(common::sign_in("calls", "b", &account).await?.0);
    a.start_sync().await?;
    b.start_sync().await?;
    println!("two devices signed in");
    println!("  call server advertised: {:?}", a.rtc_service_url().await);

    let room = a
        .create_room_with(CreateRoomOptions {
            name: "Voice test".into(),
            is_voice: true,
            ..Default::default()
        })
        .await?;
    for _ in 0..60 {
        if b.room_details(&room).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let sfu = "https://sfu.invalid";
    // A short membership expiry, so renewals have to happen during the test
    let timings = CallTimings {
        membership_expiry: Duration::from_secs(20),
        ..Default::default()
    };
    let session_a = Arc::new(a.join_call_with(&room, sfu, false, false, timings).await?);
    let (mut events_a, run_a) = run(session_a.clone());
    next_matching(&mut events_a, "A to see itself", |e| {
        matches!(e, CallEvent::Members { members } if members.len() == 1 && members[0].is_own_device)
    })
    .await?;
    next_matching(&mut events_a, "A to be connected", |e| {
        matches!(
            e,
            CallEvent::Status {
                status: CallStatus::Connected
            }
        )
    })
    .await?;
    println!("A joined the voice room's call");

    let session_b = Arc::new(b.join_call_via(&room, sfu, false, false).await?);
    let (mut events_b, _run_b) = run(session_b.clone());
    next_matching(
        &mut events_b,
        "B to see both",
        |e| matches!(e, CallEvent::Members { members } if members.len() == 2),
    )
    .await?;
    next_matching(
        &mut events_a,
        "A to see both",
        |e| matches!(e, CallEvent::Members { members } if members.len() == 2),
    )
    .await?;
    println!("both devices see each other in the call");

    let identity_a = session_a.identity().to_owned();
    let identity_b = session_b.identity().to_owned();
    next_matching(
        &mut events_b,
        "A's key at B",
        |e| matches!(e, CallEvent::Key { identity, .. } if *identity == identity_a),
    )
    .await?;
    next_matching(
        &mut events_a,
        "B's key at A",
        |e| matches!(e, CallEvent::Key { identity, .. } if *identity == identity_b),
    )
    .await?;
    println!("media keys exchanged over encrypted to-device messages");

    session_a.send_reaction("🎉", "party").await?;
    next_matching(&mut events_b, "A's reaction at B", |e| matches!(e, CallEvent::Reaction { identity, emoji } if *identity == identity_a && emoji == "🎉")).await?;
    session_a.set_hand_raised(true).await?;
    next_matching(&mut events_b, "A's raised hand at B", |e| matches!(e, CallEvent::HandRaised { identity, raised: true } if *identity == identity_a)).await?;
    session_a.set_hand_raised(false).await?;
    next_matching(&mut events_b, "A's lowered hand at B", |e| matches!(e, CallEvent::HandRaised { identity, raised: false } if *identity == identity_a)).await?;
    println!("reactions and raised hands reach the other device");

    // Past the delayed leave's timeout and A's 20 s expiry: the heartbeat and renewals keep both
    tokio::time::sleep(Duration::from_secs(50)).await;
    assert_eq!(
        b.call_members(&room).await?.len(),
        2,
        "heartbeat or renewal failed to keep the memberships"
    );
    println!("A's 20 s membership was renewed and both survive past the delayed leave timeout");

    let delayed_events = session_a.delay_id().is_some();
    if delayed_events {
        // The server loses A's delayed leave: the next restart fails, and a new one replaces it
        let lost = session_a.delay_id().ok_or("A has no delayed leave")?;
        session_a.cancel_delayed_leave().await?;
        eventually("a new delayed leave", 20, async || {
            session_a.delay_id().is_some_and(|id| id != lost)
        })
        .await?;
        tokio::time::sleep(Duration::from_secs(25)).await;
        assert_eq!(
            b.call_members(&room).await?.len(),
            2,
            "the heartbeat stopped after a failed restart"
        );
        println!("a lost delayed leave is replaced and the heartbeat goes on");
    } else {
        println!("the server refuses delayed events: skipping the delayed leave checks");
    }

    // Someone removes A's membership: A joins again
    let (user_a, device_a) = identity_a.rsplit_once(':').ok_or("bad identity")?;
    a.set_state_event(
        &room,
        "org.matrix.msc3401.call.member",
        &format!("_{user_a}_{device_a}_m.call"),
        json!({}),
    )
    .await?;
    eventually("A's membership to vanish", 20, async || {
        b.call_members(&room)
            .await
            .is_ok_and(|m| m.iter().all(|m| m.identity != identity_a))
    })
    .await?;
    eventually("A to join again", 30, async || {
        b.call_members(&room)
            .await
            .is_ok_and(|m| m.iter().any(|m| m.identity == identity_a))
    })
    .await?;
    println!("a removed membership is sent again");

    while events_a.try_recv().is_ok() {}
    session_b.leave().await?;
    next_matching(
        &mut events_a,
        "B to leave",
        |e| matches!(e, CallEvent::Members { members } if members.len() == 1),
    )
    .await?;
    let rotated = next_matching(
        &mut events_a,
        "A's rotated key",
        |e| matches!(e, CallEvent::Key { identity, .. } if *identity == identity_a),
    )
    .await?;
    println!("B left; A rotated its key ({rotated:?})");

    let first = Arc::new(b.join_call_via(&room, sfu, false, false).await?);
    let (_events_first, _run_first) = run(first.clone());
    eventually("B to be back", 20, async || {
        a.call_members(&room).await.is_ok_and(|m| m.len() == 2)
    })
    .await?;
    first.leave().await?;
    let again = Arc::new(b.join_call_via(&room, sfu, false, false).await?);
    let (mut events_again, _run_again) = run(again.clone());
    next_matching(&mut events_again, "B's quick rejoin to connect", |e| {
        matches!(
            e,
            CallEvent::Status {
                status: CallStatus::Connected
            }
        )
    })
    .await?;
    tokio::time::sleep(Duration::from_secs(8)).await;
    let tag = format!("[call {} ", again.log_id());
    let log = b.call_log();
    assert!(
        !log.lines()
            .any(|l| l.contains(&tag) && l.contains("membership.vanished")),
        "a stale membership counted as the new session's own:\n{log}"
    );
    assert_eq!(a.call_members(&room).await?.len(), 2);
    println!("leaving and joining again at once needs no rejoin");

    again.report_media(MediaState::Disconnected, Some("DUPLICATE_IDENTITY".into()));
    next_matching(&mut events_again, "the replaced error", |e| {
        matches!(
            e,
            CallEvent::Error {
                kind: CallErrorKind::Replaced,
                fatal: true,
                ..
            }
        )
    })
    .await?;
    again.leave().await?;
    tokio::time::sleep(Duration::from_secs(3)).await;
    assert_eq!(
        a.call_members(&room).await?.len(),
        2,
        "a replaced session must not remove the membership the other window uses"
    );
    let (user_b, device_b) = identity_b.rsplit_once(':').ok_or("bad identity")?;
    b.set_state_event(
        &room,
        "org.matrix.msc3401.call.member",
        &format!("_{user_b}_{device_b}_m.call"),
        json!({}),
    )
    .await?;
    eventually("B to be gone", 20, async || {
        a.call_members(&room).await.is_ok_and(|m| m.len() == 1)
    })
    .await?;
    println!("a session replaced by another window keeps the membership");

    if delayed_events {
        // A's client vanishes without leaving: the server's delayed leave removes it
        run_a.abort();
        eventually("the delayed leave to remove A", 40, async || {
            a.call_members(&room).await.is_ok_and(|m| m.is_empty())
        })
        .await?;
        println!("a vanished device drops out through the server's delayed leave");
    } else {
        session_a.leave().await?;
    }

    // Ringing another account in a direct chat
    let (c, _, _) = common::register("calls", "c").await?;
    let c = Arc::new(c);
    c.start_sync().await?;
    let dm = a.start_dm(&c.user_id().ok_or("no user")?).await?;
    eventually("C to accept the DM", 30, async || {
        c.accept_invite(&dm).await.is_ok()
    })
    .await?;
    eventually("C to have joined", 30, async || {
        b.members(&dm).await.is_ok_and(|m| {
            m.iter()
                .any(|m| Some(&m.user_id) == c.user_id().as_ref() && !m.is_invite)
        })
    })
    .await?;
    let (ring_tx, mut rings) = mpsc::unbounded_channel::<IncomingCallEvent>();
    tokio::spawn({
        let c = c.clone();
        async move {
            c.watch_incoming_calls(|event| drop(ring_tx.send(event)))
                .await
        }
    });
    tokio::time::sleep(Duration::from_secs(1)).await;
    let mut next_ring = async |what: &str| {
        tokio::time::timeout(Duration::from_secs(30), async {
            loop {
                match rings.recv().await {
                    Some(event) => match &event {
                        IncomingCallEvent::Ringing { call } if call.room_id == dm => {
                            return Some(event)
                        }
                        IncomingCallEvent::Ended { call, .. } if call.room_id == dm => {
                            return Some(event)
                        }
                        _ => println!("  (incoming: {event:?})"),
                    },
                    None => return None,
                }
            }
        })
        .await
        .map_err(|_| format!("timed out waiting for {what}"))?
        .ok_or_else(|| format!("C's incoming calls ended before {what}"))
    };
    let ring = a.join_call_via(&dm, sfu, true, true).await?;
    assert!(ring.rang(), "joining an empty DM call should ring");
    let IncomingCallEvent::Ringing { call: incoming } = next_ring("the ring").await? else {
        return Err("expected a ring".into());
    };
    assert!(incoming.ring && !incoming.event_id.is_empty());
    println!("C is rung by A ({:?})", incoming.sender_name);
    c.decline_call(&dm, &incoming.event_id).await?;
    let ended = next_ring("the decline").await?;
    assert!(
        matches!(
            ended,
            IncomingCallEvent::Ended {
                reason: RingEnd::Declined,
                ..
            }
        ),
        "declining should end the ring: {ended:?}"
    );
    ring.leave().await?;
    println!("C declined and the ring ended");

    eventually("A's first ring call to end", 40, async || {
        a.call_members(&dm).await.is_ok_and(|m| m.is_empty())
    })
    .await?;
    let ring = a.join_call_via(&dm, sfu, true, true).await?;
    let IncomingCallEvent::Ringing { .. } = next_ring("the second ring").await? else {
        return Err("expected a second ring".into());
    };
    ring.leave().await?;
    let ended = next_ring("the caller leaving").await?;
    assert!(
        matches!(
            ended,
            IncomingCallEvent::Ended {
                reason: RingEnd::CallerLeft,
                ..
            }
        ),
        "the caller leaving should end the ring: {ended:?}"
    );
    println!("the caller hanging up ends the ring as missed");
    c.logout().await.ok();

    let widget = a
        .set_widget(
            &room,
            None,
            "Notes",
            "https://pad.example/p/$matrix_room_id",
        )
        .await?;
    let mut widgets = Vec::new();
    for _ in 0..20 {
        widgets = a.widgets(&room).await?;
        if !widgets.is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    assert_eq!(widgets.len(), 1, "widget missing");
    let url = a.widget_url(&room, &widgets[0], "dark", "en").await?;
    assert!(
        url.ends_with(&room.replace('!', "%21").replace(':', "%3A")),
        "placeholder not filled: {url}"
    );
    a.remove_widget(&room, &widget).await?;
    for _ in 0..20 {
        if a.widgets(&room).await?.is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    assert!(a.widgets(&room).await?.is_empty(), "widget not removed");
    println!("widget added, its URL filled in, and removed");

    a.leave(&room).await.ok();
    a.logout().await.ok();
    b.logout().await.ok();
    println!("took {}s", started.elapsed().as_secs());
    std::process::exit(0);
}
