use std::{collections::HashMap, time::Duration};

use matrix_sdk::{executor::spawn, sleep::sleep, Client};
use tokio::sync::broadcast::error::RecvError;

const FIRST_DELAY_SECS: u64 = 2;
const MAX_DELAY_SECS: u64 = 60;
const CALM_AFTER_MS: u64 = 120_000;

pub(crate) fn watch_send_errors(client: Client) {
    let mut errors = client.send_queue().subscribe_errors();
    spawn(async move {
        let mut attempts: HashMap<String, (u32, u64)> = HashMap::new();
        loop {
            let error = match errors.recv().await {
                Ok(error) => error,
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            };
            let Some(room) = client.get_room(&error.room_id) else {
                continue;
            };
            if !error.is_recoverable {
                room.send_queue().set_enabled(true);
                continue;
            }
            let now = u64::from(matrix_sdk::ruma::MilliSecondsSinceUnixEpoch::now().0);
            let entry = attempts
                .entry(error.room_id.to_string())
                .or_insert((0, now));
            if now.saturating_sub(entry.1) > CALM_AFTER_MS {
                entry.0 = 0;
            }
            entry.1 = now;
            let delay = (FIRST_DELAY_SECS << entry.0.min(5)).min(MAX_DELAY_SECS);
            entry.0 += 1;
            spawn(async move {
                sleep(Duration::from_secs(delay)).await;
                room.send_queue().set_enabled(true);
            });
        }
    });
}
