//! The call log: what each call did, from the core and the platform's media side, in one
//! place to copy into a bug report.

use std::{collections::VecDeque, sync::Mutex};

const MAX_LINES: usize = 400;

static LINES: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

fn clock(ms: u64) -> String {
    let day = ms % 86_400_000;
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        day / 3_600_000,
        day / 60_000 % 60,
        day / 1000 % 60,
        day % 1000
    )
}

pub(crate) fn record(id: &str, started_at: u64, now: u64, event: &str, detail: &str) -> String {
    let mut line = format!(
        "{} [call {id} +{}ms] {event}",
        clock(now),
        now.saturating_sub(started_at)
    );
    if !detail.is_empty() {
        line.push(' ');
        line.push_str(detail);
    }
    tracing::info!(target: "wizardchat::call", "{line}");
    let mut lines = LINES.lock().unwrap();
    if lines.len() == MAX_LINES {
        lines.pop_front();
    }
    lines.push_back(line.clone());
    line
}

pub(crate) fn text() -> String {
    LINES
        .lock()
        .unwrap()
        .iter()
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_lines() {
        let line = record("ab12cd34", 1_000, 3_723_456, "join.start", "room=!r:x");
        assert_eq!(
            line,
            "01:02:03.456 [call ab12cd34 +3722456ms] join.start room=!r:x"
        );
        assert!(text().contains("join.start room=!r:x"));
    }
}
