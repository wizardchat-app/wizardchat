//! MatrixRTC calls: who is in a room's call, joining and leaving it, ringing, and the
//! media encryption keys. Media itself (LiveKit) is up to each platform; this provides
//! what it needs to connect: the SFU URL and token, and the keys per participant.

use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use futures_util::{
    future::{select, Either},
    stream, StreamExt,
};
use matrix_sdk::{
    config::RequestConfig,
    deserialized_responses::{EncryptionInfo, RawAnySyncOrStrippedState},
    event_handler::EventHandlerDropGuard,
    ruma::{
        api::{
            client::{
                account::request_openid_token,
                delayed_events::{
                    delayed_state_event,
                    update_delayed_event::{unstable_v1 as update_delayed, UpdateAction},
                    DelayParameters,
                },
                state::send_state_event,
            },
            error::{ErrorKind, RetryAfter},
        },
        events::{
            AnySyncStateEvent, AnySyncTimelineEvent, AnyToDeviceEvent, AnyToDeviceEventContent,
            StateEventType,
        },
        serde::Raw,
        MilliSecondsSinceUnixEpoch,
    },
    sleep::sleep,
    HttpError, Room,
};
use matrix_sdk_crypto::CollectStrategy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{rooms::parse_room_id, Error, Result, WizardClient};

pub(crate) const CALL_MEMBER_EVENT: &str = "org.matrix.msc3401.call.member";
pub(crate) const VOICE_ROOM_TYPE: &str = "org.matrix.msc3417.call";
const KEYS_EVENT: &str = "io.element.call.encryption_keys";
const NOTIFICATION_EVENT: &str = "org.matrix.msc4075.rtc.notification";
const NOTIFICATION_EVENT_STABLE: &str = "m.rtc.notification";
const DECLINE_EVENT: &str = "org.matrix.msc4310.rtc.decline";
const CALL_REACTION_EVENT: &str = "io.element.call.reaction";
const RAISED_HAND_KEY: &str = "🖐️";
const RTC_FOCI_WELL_KNOWN_KEY: &str = "org.matrix.msc4143.rtc_foci";

/// How often the delayed leave is pushed back
const DELAYED_LEAVE_RESTART_MS: u64 = 4_000;
/// A restart that takes longer counts as a network error
const DELAYED_LEAVE_RESTART_TIMEOUT_MS: u64 = 2_000;
const MEMBERSHIP_EXPIRES_MS: u64 = 4 * 60 * 60 * 1000;
const NO_DELAY_MEMBERSHIP_EXPIRES_MS: u64 = 15 * 60 * 1000;
/// Memberships are renewed at least this often, a little before they run out
const MEMBERSHIP_RENEW_MAX_MS: u64 = 60 * 60 * 1000;
const MEMBERSHIP_RENEW_HEADROOM_MAX_MS: u64 = 60_000;
const JOIN_MEMBERSHIP_TIMEOUT_MS: u64 = 30_000;
const SFU_TOKEN_TIMEOUT_MS: u64 = 15_000;
const MEDIA_CONNECT_TIMEOUT_MS: u64 = 30_000;
const JOINING_SLOW_MS: u64 = 8_000;
const RECONNECTING_SHOW_MS: u64 = 1_500;
const RECONNECTING_MIN_VISIBLE_MS: u64 = 1_000;
const MEMBERSHIP_GAP_SHOW_MS: u64 = 10_000;
const RECONNECT_GIVE_UP_MS: u64 = 120_000;
const TICK_MS: u64 = 500;
const NETWORK_RETRY_MS: u64 = 3_000;
const MAX_NETWORK_RETRIES: u32 = 40;
const MAX_RATE_LIMIT_RETRIES: u32 = 10;
const RING_LIFETIME_MS: u64 = 30_000;
/// A ring (or a caller's new membership) older than this doesn't ring anymore
const RING_TIMEOUT_MS: u64 = 45_000;
/// A key shared this recently is handed to new joiners instead of rotating
const KEY_ROTATION_GRACE_MS: u64 = 10_000;
/// Others need a moment to receive a new key before media is encrypted with it
const KEY_USE_DELAY_MS: u64 = 1_000;

/// One device in a room's call
#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CallMember {
    pub user_id: String,
    pub device_id: String,
    /// How the SFU and the media keys know this device: `@user:server:DEVICE`
    pub identity: String,
    /// The LiveKit service this device publishes to
    pub service_url: Option<String>,
    /// `audio` or `video`
    pub intent: Option<String>,
    pub joined_at: u64,
    pub is_own_device: bool,
    /// Reactions and raised hands refer to this event
    pub membership_event_id: Option<String>,
    /// The name to show, with the user ID added when others in the room share it
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// What a platform needs to connect to a LiveKit SFU
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SfuConfig {
    pub service_url: String,
    pub url: String,
    pub jwt: String,
    pub identity: String,
    /// The LiveKit room the token is for: services leading to the same SFU room share a connection
    pub alias: String,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CallEvent {
    /// Everyone in the call, oldest first
    Members {
        members: Vec<CallMember>,
    },
    /// A media key for a participant (the own one too); keep every index
    Key {
        identity: String,
        index: u32,
        /// Base64
        key: String,
    },
    /// Everyone rung declined (`user_id` is the last of them)
    Declined {
        user_id: String,
    },
    /// Nobody answered the ring
    Unanswered,
    /// An emoji someone sent into the call (show it briefly)
    Reaction {
        identity: String,
        emoji: String,
    },
    HandRaised {
        identity: String,
        raised: bool,
    },
    /// `fatal`: the call is over (and has been left, unless `kind` is `replaced`)
    Error {
        message: String,
        fatal: bool,
        kind: CallErrorKind,
    },
    Status {
        status: CallStatus,
    },
    Log {
        line: String,
    },
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum CallStatus {
    JoiningMedia,
    JoiningMembership,
    JoiningSlow,
    Connected,
    Reconnecting,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum CallErrorKind {
    Membership,
    Timeout,
    Disconnected,
    Replaced,
    Removed,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MediaState {
    Connecting,
    Connected,
    Reconnecting,
    Disconnected,
}

/// Someone calling: a ring (direct chats) or call notification (other rooms) whose sender is
/// in the call
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IncomingCall {
    pub room_id: String,
    pub room_name: Option<String>,
    /// The ring or notification event to decline
    pub event_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    /// Ring audibly (DMs and rooms up to 10 members), or just show a notification
    pub ring: bool,
    pub intent: Option<String>,
    /// Milliseconds since the Unix epoch
    pub expires_at: u64,
}

/// Why a ring stopped
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum RingEnd {
    /// One of the user's devices joined the call, this one included
    Answered,
    /// Declined on one of the user's devices, this one included
    Declined,
    /// The caller left before anyone answered: missed
    CallerLeft,
    /// Nobody answered in time: missed
    Expired,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum IncomingCallEvent {
    /// Someone is calling; a later ring in the same room replaces this one
    Ringing { call: IncomingCall },
    /// The ring in the call's room is over
    Ended { call: IncomingCall, reason: RingEnd },
}

/// Who is in a room's call, as the room list shows it
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct RoomCallState {
    /// Users in the call, oldest first, once each
    pub participants: Vec<String>,
    /// This device is in the call
    pub joined: bool,
    /// The user is in the call on another device only
    pub joined_elsewhere: bool,
}

pub(crate) async fn room_call_state(room: &Room) -> RoomCallState {
    let client = room.client();
    let own = (
        client
            .user_id()
            .map(ToString::to_string)
            .unwrap_or_default(),
        client
            .device_id()
            .map(ToString::to_string)
            .unwrap_or_default(),
    );
    let Ok(members) = call_members_of(room, own.clone(), false).await else {
        return RoomCallState::default();
    };
    let mut participants: Vec<String> = Vec::new();
    for member in &members {
        if !participants.contains(&member.user_id) {
            participants.push(member.user_id.clone());
        }
    }
    let joined = members.iter().any(|m| m.is_own_device);
    RoomCallState {
        participants,
        joined,
        joined_elsewhere: !joined && members.iter().any(|m| m.user_id == own.0),
    }
}

pub(crate) fn is_voice_room(room: &Room) -> bool {
    room.room_type()
        .is_some_and(|t| t.to_string() == VOICE_ROOM_TYPE)
}

fn is_direct(room: &Room) -> bool {
    room.direct_targets_length() > 0
}

/// Rooms up to this size ring everyone, like a DM (Discord's group DMs); larger rooms only get
/// a quiet notification
const RING_MAX_MEMBERS: u64 = 10;

/// Whether starting a call here rings the others, rather than just notifying them
fn rings(room: &Room) -> bool {
    !is_voice_room(room) && (is_direct(room) || room.joined_members_count() <= RING_MAX_MEMBERS)
}

/// Whether a call is already going: anyone but this device is in it, the user's other
/// devices included. Joining such a call never rings.
fn call_running(members: &[CallMember]) -> bool {
    members.iter().any(|m| !m.is_own_device)
}

/// How long memberships last and how fast a vanished client drops out. The defaults match
/// the original app; examples shorten them to watch renewals happen.
#[derive(Clone, Copy, Debug)]
pub struct CallTimings {
    pub membership_expiry: Duration,
    pub delayed_leave: Duration,
}

impl Default for CallTimings {
    fn default() -> Self {
        Self {
            membership_expiry: Duration::from_millis(MEMBERSHIP_EXPIRES_MS),
            delayed_leave: Duration::from_secs(18),
        }
    }
}

fn now_ms() -> u64 {
    u64::from(MilliSecondsSinceUnixEpoch::now().0)
}

fn call_error(error: impl std::fmt::Display) -> Error {
    Error::Sdk(error.to_string())
}

fn normalize_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_owned()
}

fn livekit_from(list: Option<&Value>) -> Option<String> {
    list?.as_array()?.iter().find_map(|t| {
        if t.get("type")?.as_str()? != "livekit" {
            return None;
        }
        t.get("livekit_service_url")?.as_str().map(normalize_url)
    })
}

/// Client well-knowns per account, kept for the session
static WELL_KNOWN: Mutex<Vec<(String, Value)>> = Mutex::new(Vec::new());
/// Accounts whose server is known to support calls
static RTC_SUPPORTED: Mutex<Vec<String>> = Mutex::new(Vec::new());
static NO_DELAYED_EVENTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn parse_member(event: &Value, own: (&str, &str), now: u64) -> Option<CallMember> {
    let content = event.get("content")?;
    if content.get("application")?.as_str()? != "m.call"
        || content.get("scope").and_then(Value::as_str) != Some("m.room")
        || content
            .get("call_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            != ""
    {
        return None;
    }
    let user_id = event.get("sender")?.as_str()?.to_owned();
    let device_id = content.get("device_id")?.as_str()?.to_owned();
    let joined_at = content
        .get("created_ts")
        .and_then(Value::as_u64)
        .or_else(|| event.get("origin_server_ts")?.as_u64())?;
    let expires = content
        .get("expires")
        .and_then(Value::as_u64)
        .unwrap_or(MEMBERSHIP_EXPIRES_MS);
    if joined_at + expires < now {
        return None;
    }
    let service_url = content
        .get("foci_preferred")
        .and_then(Value::as_array)
        .and_then(|foci| {
            foci.iter()
                .find(|f| f.get("type").and_then(Value::as_str) == Some("livekit"))
        })
        .and_then(|f| f.get("livekit_service_url")?.as_str())
        .map(normalize_url);
    Some(CallMember {
        identity: format!("{user_id}:{device_id}"),
        is_own_device: user_id == own.0 && device_id == own.1,
        membership_event_id: event
            .get("event_id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        intent: content
            .get("m.call.intent")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        user_id,
        device_id,
        service_url,
        joined_at,
        display_name: None,
        avatar_url: None,
    })
}

fn decode_jwt_claims(jwt: &str) -> Option<Value> {
    let payload = URL_SAFE_NO_PAD
        .decode(jwt.split('.').nth(1)?.trim_end_matches('='))
        .ok()?;
    serde_json::from_slice(&payload).ok()
}

fn random_key() -> Result<[u8; 16]> {
    let mut key = [0u8; 16];
    getrandom::fill(&mut key).map_err(call_error)?;
    Ok(key)
}

pub(crate) fn random_uuid() -> Result<String> {
    let mut b = random_key()?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex: String = b.iter().map(|x| format!("{x:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

/// Runs `future`, giving up after `ms`
async fn within<T>(ms: u64, future: impl Future<Output = T>) -> Option<T> {
    let future = std::pin::pin!(future);
    let timer = std::pin::pin!(sleep(Duration::from_millis(ms)));
    match select(future, timer).await {
        Either::Left((value, _)) => Some(value),
        Either::Right(_) => None,
    }
}

fn media_decision(
    media: MediaState,
    reason: &str,
) -> (bool, Option<(CallErrorKind, String, bool)>) {
    match (media, reason) {
        (MediaState::Disconnected, "CLIENT_INITIATED") => (false, None),
        (MediaState::Disconnected, "DUPLICATE_IDENTITY") => (
            false,
            Some((
                CallErrorKind::Replaced,
                "this device joined the call somewhere else".to_owned(),
                false,
            )),
        ),
        (MediaState::Disconnected, "PARTICIPANT_REMOVED" | "ROOM_DELETED" | "ROOM_CLOSED") => (
            false,
            Some((
                CallErrorKind::Removed,
                format!("the call server ended the call ({reason})"),
                true,
            )),
        ),
        (MediaState::Disconnected, _) => (true, None),
        _ => (false, None),
    }
}

/// How a failed membership request is handled, like matrix-js-sdk's MembershipManager
enum Failure {
    NotFound,
    /// The server has no delayed events
    Unsupported,
    RateLimited(u64),
    /// Connection problems, timeouts and server errors: retried
    Network,
    Other(String),
}

fn classify(error: &HttpError) -> Failure {
    if let Some(api) = error.as_client_api_error() {
        return match api.error_kind() {
            Some(ErrorKind::LimitExceeded(data)) => Failure::RateLimited(match data.retry_after {
                Some(RetryAfter::Delay(delay)) => delay.as_millis() as u64,
                Some(RetryAfter::DateTime(at)) => MilliSecondsSinceUnixEpoch::from_system_time(at)
                    .map(|at| u64::from(at.0).saturating_sub(now_ms()))
                    .unwrap_or(5_000),
                None => 5_000,
            }),
            Some(ErrorKind::NotFound) => Failure::NotFound,
            Some(ErrorKind::Unrecognized) => Failure::Unsupported,
            _ if api.status_code.is_server_error() => Failure::Network,
            _ => Failure::Other(error.to_string()),
        };
    }
    match error {
        HttpError::Reqwest(_) => Failure::Network,
        _ => Failure::Other(error.to_string()),
    }
}

/// Servers that turned delayed events off (matrix.org) answer with M_FORBIDDEN
fn classify_delayed(error: &HttpError) -> Failure {
    match error.client_api_error_kind() {
        Some(ErrorKind::Forbidden) => Failure::Unsupported,
        _ => classify(error),
    }
}

/// No automatic retries: failures are handled (and counted) here
fn once() -> RequestConfig {
    RequestConfig::new().disable_retry()
}

#[derive(Default)]
struct Retries {
    network: u32,
    rate: u32,
}

fn failure_text(failure: Failure) -> String {
    match failure {
        Failure::NotFound => "not found".into(),
        Failure::Unsupported => "unsupported".into(),
        Failure::RateLimited(ms) => format!("rate limited for {ms}ms"),
        Failure::Network => "network".into(),
        Failure::Other(message) => message,
    }
}

impl Retries {
    /// When to try again, or why to give up
    fn next(&mut self, failure: Failure, what: &str) -> std::result::Result<u64, String> {
        match failure {
            Failure::RateLimited(ms) if self.rate < MAX_RATE_LIMIT_RETRIES => {
                self.rate += 1;
                Ok(ms)
            }
            Failure::RateLimited(_) => Err(format!("rate limited too often ({what})")),
            Failure::Network if self.network < MAX_NETWORK_RETRIES => {
                self.network += 1;
                Ok(NETWORK_RETRY_MS)
            }
            Failure::Network => Err(format!("the server can't be reached ({what})")),
            Failure::NotFound => Err(format!("not found ({what})")),
            Failure::Unsupported => Err(format!("not supported by the server ({what})")),
            Failure::Other(message) => Err(format!("{what}: {message}")),
        }
    }
}

struct TokenRequest<'a> {
    service_url: &'a str,
    room_id: &'a str,
    user_id: &'a str,
    device_id: &'a str,
    member_id: &'a str,
    /// The publisher hands its delayed leave to the call server: (delay id, timeout, homeserver)
    delay: Option<(String, u64, String)>,
}

async fn openid_token(client: &matrix_sdk::Client) -> Result<Value> {
    let user = client.user_id().ok_or(Error::NotSignedIn)?.to_owned();
    let token = client
        .send(request_openid_token::v3::Request::new(user))
        .await?;
    Ok(json!({
        "access_token": token.access_token,
        "token_type": "Bearer",
        "matrix_server_name": token.matrix_server_name,
        "expires_in": token.expires_in.as_secs(),
    }))
}

fn delay_parts(body: &mut Value, delay: &Option<(String, u64, String)>) {
    if let Some((id, timeout, homeserver)) = delay {
        body["delay_id"] = json!(id);
        body["delay_timeout"] = json!(timeout);
        body["delay_cs_api_url"] = json!(homeserver);
    }
}

async fn post(url: String, body: &Value) -> Result<reqwest::Response> {
    reqwest::Client::new()
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| Error::Call(format!("the call server can't be reached: {e}")))
}

fn token_refused(status: reqwest::StatusCode) -> Error {
    Error::Call(format!("SFU token request failed ({})", status.as_u16()))
}

async fn legacy_token(request: &TokenRequest<'_>, openid: &Value) -> Result<Value> {
    let url = format!("{}/sfu/get", request.service_url);
    let base = json!({
        "room": request.room_id,
        "openid_token": openid,
        "device_id": request.device_id,
    });
    let mut body = base.clone();
    delay_parts(&mut body, &request.delay);
    let mut response = post(url.clone(), &body).await?;
    if response.status() == reqwest::StatusCode::BAD_REQUEST && request.delay.is_some() {
        let error: Value = response.json().await.unwrap_or_default();
        if error.get("errcode").and_then(Value::as_str) != Some("M_BAD_JSON") {
            return Err(token_refused(reqwest::StatusCode::BAD_REQUEST));
        }
        response = post(url, &base).await?;
    }
    if !response.status().is_success() {
        return Err(token_refused(response.status()));
    }
    response.json().await.map_err(call_error)
}

async fn matrix2_token(request: &TokenRequest<'_>, openid: &Value) -> Result<Value> {
    let mut body = json!({
        "room_id": request.room_id,
        "slot_id": "m.call#ROOM",
        "openid_token": openid,
        "member": {
            "id": request.member_id,
            "claimed_user_id": request.user_id,
            "claimed_device_id": request.device_id,
        },
    });
    delay_parts(&mut body, &request.delay);
    let response = post(format!("{}/get_token", request.service_url), &body).await?;
    if !response.status().is_success() {
        return Err(token_refused(response.status()));
    }
    response.json().await.map_err(call_error)
}

/// The publisher asks the legacy endpoint (it also takes the delayed leave); subscribers try
/// the newer endpoint first.
async fn request_sfu_config(
    client: &matrix_sdk::Client,
    request: TokenRequest<'_>,
    publisher: bool,
) -> Result<SfuConfig> {
    let mut body = None;
    if !publisher {
        if let Ok(openid) = openid_token(client).await {
            body = matrix2_token(&request, &openid).await.ok();
        }
    }
    let body = match body {
        Some(body) => body,
        None => legacy_token(&request, &openid_token(client).await?).await?,
    };
    let url = body
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| Error::Call("no SFU URL".into()))?;
    let jwt = body
        .get("jwt")
        .and_then(Value::as_str)
        .ok_or_else(|| Error::Call("no SFU token".into()))?;
    let claims = decode_jwt_claims(jwt).unwrap_or_default();
    Ok(SfuConfig {
        service_url: request.service_url.to_owned(),
        url: url.to_owned(),
        identity: claims
            .get("sub")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("{}:{}", request.user_id, request.device_id)),
        alias: claims
            .pointer("/video/room")
            .and_then(Value::as_str)
            .unwrap_or(request.room_id)
            .to_owned(),
        jwt: jwt.to_owned(),
    })
}

impl WizardClient {
    /// The LiveKit service the homeserver offers for calls, if any: the client well-known
    /// first, then the server's RTC transports.
    pub async fn rtc_service_url(&self) -> Option<String> {
        if let Some(url) = self
            .client_well_known()
            .await
            .and_then(|w| livekit_from(w.get(RTC_FOCI_WELL_KNOWN_KEY)))
        {
            return Some(url);
        }
        self.livekit_transport().await
    }

    /// Whether calls can work here. Lenient: only a readable well-known
    /// without call servers, and no LiveKit transport, count as unsupported. A yes is remembered.
    pub async fn rtc_supported(&self) -> bool {
        let Some(user_id) = self.sdk().user_id().map(ToString::to_string) else {
            return false;
        };
        if RTC_SUPPORTED.lock().unwrap().contains(&user_id) {
            return true;
        }
        let supported = self.livekit_transport().await.is_some()
            || match self.client_well_known().await {
                None => true,
                Some(well_known) => well_known
                    .get(RTC_FOCI_WELL_KNOWN_KEY)
                    .and_then(Value::as_array)
                    .is_some_and(|foci| !foci.is_empty()),
            };
        if supported {
            RTC_SUPPORTED.lock().unwrap().push(user_id);
        }
        supported
    }

    async fn livekit_transport(&self) -> Option<String> {
        let transports = self.sdk().discover_rtc_transports().await.ok().flatten()?;
        transports.into_iter().find_map(|t| {
            if t.transport_type() != "livekit" {
                return None;
            }
            t.data()
                .get("livekit_service_url")?
                .as_str()
                .map(normalize_url)
        })
    }

    /// The account server's `.well-known/matrix/client`, fetched once per session; `None`
    /// when it can't be read.
    async fn client_well_known(&self) -> Option<Value> {
        let user_id = self.sdk().user_id()?.to_owned();
        let cached = WELL_KNOWN
            .lock()
            .unwrap()
            .iter()
            .find(|(user, _)| *user == user_id.as_str())
            .map(|(_, content)| content.clone());
        if cached.is_some() {
            return cached;
        }
        let response = reqwest::Client::new()
            .get(format!(
                "https://{}/.well-known/matrix/client",
                user_id.server_name()
            ))
            .send()
            .await
            .ok()?;
        if !response.status().is_success() {
            return None;
        }
        let content: Value = response.json().await.ok()?;
        WELL_KNOWN
            .lock()
            .unwrap()
            .push((user_id.to_string(), content.clone()));
        Some(content)
    }

    pub async fn call_members(&self, room_id: &str) -> Result<Vec<CallMember>> {
        call_members_of(&self.room(room_id)?, self.own_device(), true).await
    }

    fn own_device(&self) -> (String, String) {
        (
            self.sdk()
                .user_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
            self.sdk()
                .device_id()
                .map(ToString::to_string)
                .unwrap_or_default(),
        )
    }

    /// Calls `on_members` with the room's call members now and whenever they change.
    pub async fn watch_call_members(
        &self,
        room_id: &str,
        mut on_members: impl FnMut(Vec<CallMember>),
    ) -> Result<()> {
        let room = self.room(room_id)?;
        let own = self.own_device();
        let mut info = room.subscribe_info();
        let mut last = None;
        // Memberships also expire with time, so look again now and then
        let changes = stream::select(
            (&mut info).map(|_| ()),
            stream::unfold((), |_| async {
                sleep(Duration::from_secs(10)).await;
                Some(((), ()))
            }),
        );
        futures_util::pin_mut!(changes);
        loop {
            let members = call_members_of(&room, own.clone(), true).await?;
            if last.as_ref() != Some(&members) {
                on_members(members.clone());
                last = Some(members);
            }
            if changes.next().await.is_none() {
                return Ok(());
            }
        }
    }

    /// A token for a LiveKit service, for this device in this room's call. Prefer
    /// `CallSession::sfu_config` while in the call.
    pub async fn sfu_config(&self, room_id: &str, service_url: &str) -> Result<SfuConfig> {
        let room_id = parse_room_id(room_id)?;
        let (user_id, device_id) = self.own_device();
        let service_url = normalize_url(service_url);
        let member_id = format!("{user_id}:{device_id}");
        let request = TokenRequest {
            service_url: &service_url,
            room_id: room_id.as_str(),
            user_id: &user_id,
            device_id: &device_id,
            member_id: &member_id,
            delay: None,
        };
        match request_sfu_config(self.sdk(), request, true).await {
            Ok(config) => Ok(config),
            Err(_) => {
                let request = TokenRequest {
                    service_url: &service_url,
                    room_id: room_id.as_str(),
                    user_id: &user_id,
                    device_id: &device_id,
                    member_id: &member_id,
                    delay: None,
                };
                request_sfu_config(self.sdk(), request, false).await
            }
        }
    }

    /// Joins the room's call. Run the session to stay in it; `ring` notifies the others
    /// (ringing in direct chats) when nobody is in the call yet.
    pub async fn join_call(&self, room_id: &str, video: bool, ring: bool) -> Result<CallSession> {
        let service_url = self
            .rtc_service_url()
            .await
            .ok_or_else(|| Error::Call("this homeserver has no call server".into()))?;
        self.join_call_via(room_id, &service_url, video, ring).await
    }

    /// Like `join_call`, publishing to a chosen LiveKit service.
    pub async fn join_call_via(
        &self,
        room_id: &str,
        service_url: &str,
        video: bool,
        ring: bool,
    ) -> Result<CallSession> {
        self.join_call_with(room_id, service_url, video, ring, CallTimings::default())
            .await
    }

    /// Like `join_call_via`, with other membership timings.
    pub async fn join_call_with(
        &self,
        room_id: &str,
        service_url: &str,
        video: bool,
        ring: bool,
        timings: CallTimings,
    ) -> Result<CallSession> {
        let room = self.room(room_id)?;
        let service_url = normalize_url(service_url);
        let (user_id, device_id) = self.own_device();
        let running = call_running(
            &call_members_of(&room, (user_id.clone(), device_id.clone()), false).await?,
        );
        let member_id = random_uuid()?;
        let session = CallSession {
            client: self.sdk().clone(),
            state_key: format!("_{user_id}_{device_id}_m.call"),
            identity: format!("{user_id}:{device_id}"),
            log_id: member_id[..8].to_owned(),
            created_at: now_ms(),
            member_id,
            user_id,
            device_id,
            service_url,
            intent: if video { "video" } else { "audio" }.to_owned(),
            timings,
            state: Arc::new(Mutex::new(SessionState::default())),
            room,
        };
        session.log(
            "join.start",
            format!(
                "room={} device={} service={} intent={} ring={ring} others_in_call={running}",
                session.room.room_id(),
                session.device_id,
                session.service_url,
                session.intent
            ),
        );
        match within(JOIN_MEMBERSHIP_TIMEOUT_MS, session.join()).await {
            Some(Ok(())) => {}
            Some(Err(error)) => {
                session.log("join.failed", error.to_string());
                return Err(error);
            }
            None => {
                session.log("join.failed", "the homeserver didn't answer in time");
                let _ = within(5_000, session.leave()).await;
                return Err(Error::Call(
                    "can't join the call: the homeserver didn't answer in time".into(),
                ));
            }
        }
        if ring && !running && !is_voice_room(&session.room) {
            let membership = session.state.lock().unwrap().membership_event_id.clone();
            if let Some(membership) = membership {
                session.notify(&membership).await?;
            }
        }
        Ok(session)
    }

    pub fn call_log(&self) -> String {
        crate::call_log::text()
    }

    /// Every timeline and state event as JSON, with the guards that keep the handlers alive
    fn room_events(
        &self,
    ) -> (
        futures_channel::mpsc::UnboundedReceiver<(Value, Room)>,
        [EventHandlerDropGuard; 2],
    ) {
        let (sender, receiver) = futures_channel::mpsc::unbounded::<(Value, Room)>();
        let timeline = self.sdk().add_event_handler({
            let sender = sender.clone();
            move |raw: Raw<AnySyncTimelineEvent>, room: Room| {
                let sender = sender.clone();
                async move {
                    if let Ok(event) = raw.deserialize_as_unchecked::<Value>() {
                        let _ = sender.unbounded_send((event, room));
                    }
                }
            }
        });
        let state = self
            .sdk()
            .add_event_handler(move |raw: Raw<AnySyncStateEvent>, room: Room| {
                let sender = sender.clone();
                async move {
                    if let Ok(event) = raw.deserialize_as_unchecked::<Value>() {
                        let _ = sender.unbounded_send((event, room));
                    }
                }
            });
        let guards = [
            self.sdk().event_handler_drop_guard(timeline),
            self.sdk().event_handler_drop_guard(state),
        ];
        (receiver, guards)
    }

    /// Reports rings as they start and end. A ring ends when one of the user's devices answers
    /// or declines, the caller leaves, or it expires.
    pub async fn watch_incoming_calls(&self, mut on_event: impl FnMut(IncomingCallEvent)) {
        enum Input {
            Event(Value, Room),
            Tick,
        }
        let (receiver, _guards) = self.room_events();
        let ticks = stream::unfold((), |_| async {
            sleep(Duration::from_secs(1)).await;
            Some((Input::Tick, ()))
        });
        let inputs = stream::select(receiver.map(|(e, r)| Input::Event(e, r)), ticks);
        futures_util::pin_mut!(inputs);
        let own = self.own_device();
        let mut seen: VecDeque<String> = VecDeque::new();
        let mut ringing: HashMap<String, IncomingCall> = HashMap::new();
        while let Some(input) = inputs.next().await {
            let (event, room) = match input {
                Input::Tick => {
                    let now = now_ms();
                    let expired: Vec<String> = ringing
                        .iter()
                        .filter(|(_, call)| call.expires_at <= now)
                        .map(|(room_id, _)| room_id.clone())
                        .collect();
                    for room_id in expired {
                        if let Some(call) = ringing.remove(&room_id) {
                            on_event(IncomingCallEvent::Ended {
                                call,
                                reason: RingEnd::Expired,
                            });
                        }
                    }
                    continue;
                }
                Input::Event(event, room) => (event, room),
            };
            // State events arrive through both handlers
            let id = event
                .get("event_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            if seen.contains(&id) {
                continue;
            }
            seen.push_back(id);
            if seen.len() > 256 {
                seen.pop_front();
            }
            let room_id = room.room_id().to_string();
            if let Some(call) = incoming_call(&event, &room, &own).await {
                ringing.insert(room_id, call.clone());
                on_event(IncomingCallEvent::Ringing { call });
                continue;
            }
            let Some(call) = ringing.get(&room_id) else {
                continue;
            };
            if let Some(reason) = ring_end(&event, &room, call, &own).await {
                if let Some(call) = ringing.remove(&room_id) {
                    on_event(IncomingCallEvent::Ended { call, reason });
                }
            }
        }
    }

    /// Tells the caller this device won't answer.
    pub async fn decline_call(&self, room_id: &str, notification_event_id: &str) -> Result<()> {
        let content = json!({
            "m.relates_to": { "rel_type": "m.reference", "event_id": notification_event_id },
        });
        self.room(room_id)?.send_raw(DECLINE_EVENT, content).await?;
        Ok(())
    }
}

async fn ring_end(
    event: &Value,
    room: &Room,
    call: &IncomingCall,
    own: &(String, String),
) -> Option<RingEnd> {
    match event.get("type").and_then(Value::as_str)? {
        // Any of the user's declines in the room counts: another device may have declined an
        // earlier ring of the same call
        DECLINE_EVENT => (event.get("sender").and_then(Value::as_str) == Some(own.0.as_str()))
            .then_some(RingEnd::Declined),
        CALL_MEMBER_EVENT => {
            let members = call_members_of(room, own.clone(), false).await.ok()?;
            if members.iter().any(|m| m.user_id == own.0) {
                Some(RingEnd::Answered)
            } else if !members.iter().any(|m| m.user_id == call.sender) {
                Some(RingEnd::CallerLeft)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// A ring or call notification worth showing. Only these ring: a caller's membership alone
/// (a second device joining, a rejoin) never does (MSC4075).
async fn incoming_call(event: &Value, room: &Room, own: &(String, String)) -> Option<IncomingCall> {
    let kind = event.get("type")?.as_str()?;
    if (kind != NOTIFICATION_EVENT && kind != NOTIFICATION_EVENT_STABLE) || is_voice_room(room) {
        return None;
    }
    let from = event.get("sender")?.as_str()?;
    if from == own.0 {
        return None;
    }
    let now = now_ms();
    let content = event.get("content")?;
    let sent = content
        .get("sender_ts")
        .and_then(Value::as_u64)
        .or_else(|| event.get("origin_server_ts")?.as_u64())
        .unwrap_or(now);
    let lifetime = content
        .get("lifetime")
        .and_then(Value::as_u64)
        .unwrap_or(RING_LIFETIME_MS)
        .min(RING_TIMEOUT_MS);
    if now.saturating_sub(sent) > lifetime {
        return None;
    }
    // Rings from large rooms are only shown as a notification
    let ring =
        content.get("notification_type").and_then(Value::as_str) == Some("ring") && rings(room);
    let members = call_members_of(room, own.clone(), false).await.ok()?;
    let already_in = members.iter().any(|m| m.user_id == own.0);
    if already_in || !members.iter().any(|m| m.user_id == from) {
        return None;
    }
    let user = <&matrix_sdk::ruma::UserId>::try_from(from).ok()?;
    let sender_name = match room.get_member_no_sync(user).await {
        Ok(Some(member)) => Some(member_name(&member)),
        _ => None,
    };
    Some(IncomingCall {
        room_id: room.room_id().to_string(),
        room_name: room.cached_display_name().map(|n| n.to_string()),
        event_id: event.get("event_id")?.as_str()?.to_owned(),
        sender: from.to_owned(),
        sender_name,
        ring,
        intent: content
            .get("m.call.intent")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        expires_at: sent + lifetime,
    })
}

/// The member's name as other clients show it: the user ID added when the name is ambiguous
fn member_name(member: &matrix_sdk::room::RoomMember) -> String {
    match member.display_name() {
        Some(name) if member.name_ambiguous() => format!("{name} ({})", member.user_id()),
        Some(name) => name.to_owned(),
        None => member.user_id().to_string(),
    }
}

pub(crate) async fn call_members_of(
    room: &Room,
    own: (String, String),
    with_profiles: bool,
) -> Result<Vec<CallMember>> {
    let now = now_ms();
    let events = room
        .get_state_events(StateEventType::from(CALL_MEMBER_EVENT))
        .await?;
    let mut members: Vec<CallMember> = events
        .into_iter()
        .filter_map(|raw| match raw {
            RawAnySyncOrStrippedState::Sync(raw) => raw.deserialize_as_unchecked::<Value>().ok(),
            RawAnySyncOrStrippedState::Stripped(_) => None,
        })
        .filter_map(|event| parse_member(&event, (&own.0, &own.1), now))
        .collect();
    for member in members.iter_mut().filter(|_| with_profiles) {
        let Ok(user) = <&matrix_sdk::ruma::UserId>::try_from(member.user_id.as_str()) else {
            continue;
        };
        if let Ok(Some(info)) = room.get_member_no_sync(user).await {
            member.display_name = Some(member_name(&info));
            member.avatar_url = info.avatar_url().map(ToString::to_string);
        }
    }
    members.sort_by_key(|m| m.joined_at);
    Ok(members)
}

/// Steps to get the membership back after it vanished (the server's delayed leave fired, or
/// someone removed it)
#[derive(Clone, Copy, Debug, PartialEq)]
enum Rejoin {
    CancelOldLeave,
    ScheduleLeave,
    Join,
}

#[derive(Default)]
struct SessionState {
    delay_id: Option<String>,
    /// The server has no delayed events: memberships only expire
    no_delayed_events: bool,
    /// When the server will send the delayed leave unless it's restarted
    leave_expected_at: u64,
    left: bool,
    notification_event_id: Option<String>,
    membership_event_id: Option<String>,
    own_hand_event_id: Option<String>,
    rung_at: Option<u64>,
    rang: bool,
    outbound: Option<OutboundKey>,
    /// When the current membership was first sent; renewals count from here
    started_at: u64,
    expiry_iteration: u64,
    created_ts: Option<u64>,
    own_seen: bool,
    restart_due: Option<u64>,
    renew_due: Option<u64>,
    rejoin: Option<(Rejoin, u64)>,
    restart_retries: Retries,
    renew_retries: Retries,
    rejoin_retries: Retries,
    expiry_ms: u64,
    own_event_ids: VecDeque<String>,
    own_missing_since: Option<u64>,
    media: Option<MediaState>,
    media_since: u64,
    run_started_at: u64,
    joined: bool,
    shown: Option<(CallStatus, u64)>,
    fatal: Option<(CallErrorKind, String, bool)>,
    replaced: bool,
    wake: Option<futures_channel::mpsc::UnboundedSender<Input>>,
    unsent_log: Vec<String>,
}

#[derive(Clone)]
struct OutboundKey {
    index: u32,
    key: [u8; 16],
    created_at: u64,
    /// (user, device, joined at)
    shared_with: Vec<(String, String, u64)>,
}

enum Input {
    Tick,
    Wake,
    MembersChanged,
    Key(CallEvent),
    Declined(String),
    Timeline(Value),
}

/// This device's membership in a room's call
#[derive(Clone)]
pub struct CallSession {
    client: matrix_sdk::Client,
    room: Room,
    state_key: String,
    identity: String,
    /// Identifies this session to the newer token endpoint
    member_id: String,
    log_id: String,
    created_at: u64,
    user_id: String,
    device_id: String,
    service_url: String,
    intent: String,
    timings: CallTimings,
    state: Arc<Mutex<SessionState>>,
}

impl CallSession {
    pub fn room_id(&self) -> String {
        self.room.room_id().to_string()
    }

    /// The LiveKit service this device publishes to
    pub fn service_url(&self) -> &str {
        &self.service_url
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn log_id(&self) -> &str {
        &self.log_id
    }

    pub fn log(&self, event: &str, detail: impl AsRef<str>) {
        let line = crate::call_log::record(
            &self.log_id,
            self.created_at,
            now_ms(),
            event,
            detail.as_ref(),
        );
        let mut state = self.state.lock().unwrap();
        if state.unsent_log.len() < 200 {
            state.unsent_log.push(line);
        }
        if let Some(wake) = &state.wake {
            let _ = wake.unbounded_send(Input::Wake);
        }
    }

    pub fn report_media(&self, media: MediaState, reason: Option<String>) -> bool {
        let reason = reason.unwrap_or_default();
        let (reconnect, fatal) = media_decision(media, &reason);
        let changed = {
            let mut state = self.state.lock().unwrap();
            let changed = state.media != Some(media);
            let was_up = state.media == Some(MediaState::Connected);
            if was_up != (media == MediaState::Connected) {
                state.media_since = now_ms();
            }
            state.media = Some(media);
            if let Some(fatal) = fatal {
                if fatal.0 == CallErrorKind::Replaced {
                    state.replaced = true;
                }
                state.fatal.get_or_insert(fatal);
            }
            if let Some(wake) = &state.wake {
                let _ = wake.unbounded_send(Input::Wake);
            }
            changed
        };
        if changed || !reason.is_empty() {
            let mut detail = format!("{media:?}").to_lowercase();
            if !reason.is_empty() {
                detail.push_str(&format!(" reason={reason}"));
            }
            if media == MediaState::Disconnected {
                detail.push_str(if reconnect {
                    " -> reconnect"
                } else {
                    " -> stop"
                });
            }
            self.log("media", detail);
        }
        reconnect
    }

    /// Whether joining rang the others (a DM or small room nobody was in): show "calling..."
    pub fn rang(&self) -> bool {
        self.state.lock().unwrap().rang
    }

    /// The scheduled leave the server sends if this device stops confirming it's there
    pub fn delay_id(&self) -> Option<String> {
        self.state.lock().unwrap().delay_id.clone()
    }

    /// Whether media is end-to-end encrypted (the room is)
    pub async fn encrypted(&self) -> bool {
        self.room
            .latest_encryption_state()
            .await
            .map(|s| s.is_encrypted())
            .unwrap_or(false)
    }

    /// A token for a LiveKit service in this call. The publisher's token hands the delayed
    /// leave to the call server, so others see a crashed client leave right away.
    pub async fn sfu_config(&self, service_url: &str, publisher: bool) -> Result<SfuConfig> {
        let service_url = normalize_url(service_url);
        let delay = if publisher {
            self.delay_id().map(|id| {
                (
                    id,
                    self.state.lock().unwrap().delayed_leave_ms(&self.timings),
                    self.client
                        .homeserver()
                        .to_string()
                        .trim_end_matches('/')
                        .to_owned(),
                )
            })
        } else {
            None
        };
        let delayed = delay.is_some();
        let request = TokenRequest {
            service_url: &service_url,
            room_id: self.room.room_id().as_str(),
            user_id: &self.user_id,
            device_id: &self.device_id,
            member_id: &self.member_id,
            delay,
        };
        let started = now_ms();
        let result = within(
            SFU_TOKEN_TIMEOUT_MS,
            request_sfu_config(&self.client, request, publisher),
        )
        .await
        .unwrap_or_else(|| Err(Error::Call("the call server didn't answer in time".into())));
        let ms = now_ms() - started;
        match &result {
            Ok(config) => self.log(
                "token",
                format!(
                    "ok publisher={publisher} delayed_leave={delayed} service={service_url} sfu={} alias={} {ms}ms",
                    config.url, config.alias
                ),
            ),
            Err(error) => self.log(
                "token",
                format!("failed publisher={publisher} service={service_url} {ms}ms: {error}"),
            ),
        }
        result
    }

    fn membership_content(&self, expires: u64, created_ts: Option<u64>) -> Value {
        let mut content = json!({
            "application": "m.call",
            "call_id": "",
            "scope": "m.room",
            "device_id": self.device_id,
            "membershipID": self.identity,
            "expires": expires,
            "m.call.intent": self.intent,
            "focus_active": { "type": "livekit", "focus_selection": "multi_sfu" },
            "foci_preferred": [{
                "type": "livekit",
                "livekit_service_url": self.service_url,
                "livekit_alias": self.room.room_id(),
            }],
        });
        if let Some(ts) = created_ts {
            content["created_ts"] = json!(ts);
        }
        content
    }

    async fn send_member_state(&self, content: Value) -> std::result::Result<String, HttpError> {
        let request = send_state_event::v3::Request::new_raw(
            self.room.room_id().to_owned(),
            StateEventType::from(CALL_MEMBER_EVENT),
            self.state_key.clone(),
            Raw::new(&content)
                .map_err(|e| HttpError::IntoHttp(e.into()))?
                .cast_unchecked(),
        );
        let response = self
            .client
            .send(request)
            .with_request_config(once())
            .await?;
        Ok(response.event_id.to_string())
    }

    async fn send_delayed_leave(&self) -> std::result::Result<String, HttpError> {
        let delay = self.state.lock().unwrap().delayed_leave_ms(&self.timings);
        let request = delayed_state_event::unstable::Request::new_raw(
            self.room.room_id().to_owned(),
            self.state_key.clone(),
            StateEventType::from(CALL_MEMBER_EVENT),
            DelayParameters::Timeout {
                timeout: Duration::from_millis(delay),
            },
            Raw::new(&json!({}))
                .map_err(|e| HttpError::IntoHttp(e.into()))?
                .cast_unchecked(),
        );
        let response = self
            .client
            .send(request)
            .with_request_config(once())
            .await?;
        let mut state = self.state.lock().unwrap();
        state.delay_id = Some(response.delay_id.clone());
        state.leave_expected_at = now_ms() + delay;
        Ok(response.delay_id)
    }

    async fn update_delayed(
        &self,
        delay_id: String,
        action: UpdateAction,
    ) -> std::result::Result<(), HttpError> {
        let request = update_delayed::Request::new(delay_id, action);
        self.client
            .send(request)
            .with_request_config(once())
            .await?;
        Ok(())
    }

    /// Schedules the leave (so a vanished client drops out), then announces the membership.
    async fn join(&self) -> Result<()> {
        let started = now_ms();
        let known_unsupported = NO_DELAYED_EVENTS.lock().unwrap().contains(&self.user_id);
        let delayed = if known_unsupported {
            self.state.lock().unwrap().no_delayed_events = true;
            "unsupported (known)".to_owned()
        } else {
            let mut retries = Retries::default();
            loop {
                match self.send_delayed_leave().await {
                    Ok(_) => break "yes".to_owned(),
                    Err(error) => match classify_delayed(&error) {
                        failure @ (Failure::RateLimited(_) | Failure::Network) => {
                            match retries.next(failure, "scheduling the leave") {
                                Ok(wait) => sleep(Duration::from_millis(wait)).await,
                                Err(why) => break format!("failed ({why})"),
                            }
                        }
                        Failure::Unsupported => {
                            self.state.lock().unwrap().no_delayed_events = true;
                            NO_DELAYED_EVENTS.lock().unwrap().push(self.user_id.clone());
                            break format!(
                                "unsupported by the homeserver, the membership expires instead \
                                 (expected on matrix.org: {error})"
                            );
                        }
                        // Without delayed events the membership just expires
                        failure => break format!("failed ({})", failure_text(failure)),
                    },
                }
            }
        };
        let mut retries = Retries::default();
        loop {
            match self.send_join_once().await {
                Ok(()) => break,
                Err(error) => {
                    let wait = retries
                        .next(classify(&error), "sending the membership")
                        .map_err(|e| Error::Call(format!("can't join the call: {e}")))?;
                    self.log("join.membership", format!("retry in {wait}ms: {error}"));
                    sleep(Duration::from_millis(wait)).await;
                }
            }
        }
        let (event_id, expiry) = {
            let state = self.state.lock().unwrap();
            (state.membership_event_id.clone(), state.expiry_ms)
        };
        self.log(
            "join.membership",
            format!(
                "ok event={} expires={}s delayed_leave={delayed} {}ms",
                event_id.unwrap_or_default(),
                expiry / 1000,
                now_ms() - started
            ),
        );
        Ok(())
    }

    fn membership_expiry_ms(&self) -> u64 {
        let full = self.timings.membership_expiry.as_millis() as u64;
        if self.state.lock().unwrap().no_delayed_events {
            full.min(NO_DELAY_MEMBERSHIP_EXPIRES_MS)
        } else {
            full
        }
    }

    async fn send_join_once(&self) -> std::result::Result<(), HttpError> {
        let expires = self.membership_expiry_ms();
        let event_id = self
            .send_member_state(self.membership_content(expires, None))
            .await?;
        let now = now_ms();
        let mut state = self.state.lock().unwrap();
        state.remember_own_event(&event_id);
        state.membership_event_id = Some(event_id);
        state.started_at = now;
        state.expiry_ms = expires;
        state.expiry_iteration = 1;
        state.created_ts = None;
        state.own_seen = false;
        // Check right away whether sending the membership cancelled the delayed leave
        state.restart_due = (!state.no_delayed_events).then_some(now);
        state.renew_due = Some(state.renew_at(&self.timings));
        Ok(())
    }

    async fn notify(&self, membership_event_id: &str) -> Result<()> {
        let ring = rings(&self.room);
        let content = json!({
            "m.mentions": { "user_ids": [], "room": true },
            "notification_type": if ring { "ring" } else { "notification" },
            "sender_ts": now_ms(),
            "lifetime": RING_LIFETIME_MS,
            "m.call.intent": self.intent,
            "m.relates_to": { "rel_type": "m.reference", "event_id": membership_event_id },
        });
        let response = self.room.send_raw(NOTIFICATION_EVENT, content).await?;
        let mut state = self.state.lock().unwrap();
        state.notification_event_id = Some(response.response.event_id.to_string());
        state.rung_at = ring.then(now_ms);
        state.rang = ring;
        drop(state);
        self.log("notify", if ring { "rang" } else { "notified" });
        Ok(())
    }

    /// Keeps the membership alive and the media keys flowing until `leave`.
    pub async fn run(&self, mut on_event: impl FnMut(CallEvent)) {
        let encrypted = self.encrypted().await;
        let (key_sender, key_receiver) = futures_channel::mpsc::unbounded();
        let key_sender_for_wake = key_sender.clone();
        let room_id = self.room.room_id().to_owned();
        let key_handle = self.client.add_event_handler({
            let key_sender = key_sender.clone();
            move |raw: Raw<AnyToDeviceEvent>, encryption_info: Option<EncryptionInfo>| {
                let key_sender = key_sender.clone();
                let room_id = room_id.clone();
                async move {
                    // Keys only count when they arrived encrypted from the device they claim
                    let Some(info) = encryption_info else { return };
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    if event.get("type").and_then(Value::as_str) != Some(KEYS_EVENT) {
                        return;
                    }
                    let content = event.get("content").cloned().unwrap_or_default();
                    if content.get("room_id").and_then(Value::as_str) != Some(room_id.as_str()) {
                        return;
                    }
                    let claimed = content
                        .pointer("/member/claimed_device_id")
                        .and_then(Value::as_str);
                    if claimed.is_none()
                        || claimed != info.sender_device.as_ref().map(|d| d.as_str())
                    {
                        return;
                    }
                    let (Some(index), Some(key)) = (
                        content.pointer("/keys/index").and_then(Value::as_u64),
                        content.pointer("/keys/key").and_then(Value::as_str),
                    ) else {
                        return;
                    };
                    let _ = key_sender.unbounded_send(Input::Key(CallEvent::Key {
                        identity: format!("{}:{}", info.sender, claimed.unwrap_or_default()),
                        index: index as u32,
                        key: key.to_owned(),
                    }));
                }
            }
        });
        let own_user = self.user_id.clone();
        let decline_handle = self.client.add_room_event_handler(self.room.room_id(), {
            let state = self.state.clone();
            move |raw: Raw<AnySyncTimelineEvent>| {
                let key_sender = key_sender.clone();
                let state = state.clone();
                let own_user = own_user.clone();
                async move {
                    let Ok(event) = raw.deserialize_as_unchecked::<Value>() else {
                        return;
                    };
                    let kind = event
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if matches!(
                        kind,
                        CALL_REACTION_EVENT | "m.reaction" | "m.room.redaction"
                    ) {
                        let _ = key_sender.unbounded_send(Input::Timeline(event));
                        return;
                    }
                    if kind != DECLINE_EVENT {
                        return;
                    }
                    let relates = event
                        .pointer("/content/m.relates_to/event_id")
                        .and_then(Value::as_str);
                    let user = event
                        .get("sender")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let ours = state.lock().unwrap().notification_event_id.clone();
                    if relates.is_some()
                        && relates.map(ToOwned::to_owned) == ours
                        && user != own_user
                    {
                        let _ = key_sender.unbounded_send(Input::Declined(user.to_owned()));
                    }
                }
            }
        });
        let _guards = (
            self.client.event_handler_drop_guard(key_handle),
            self.client.event_handler_drop_guard(decline_handle),
        );

        {
            let now = now_ms();
            let mut state = self.state.lock().unwrap();
            state.wake = Some(key_sender_for_wake);
            state.run_started_at = now;
            state.media_since = now;
        }
        self.log("run", format!("encrypted={encrypted}"));

        let mut info = self.room.subscribe_info();
        let ticks = stream::unfold((), |_| async {
            sleep(Duration::from_millis(TICK_MS)).await;
            Some((Input::Tick, ()))
        });
        let inputs = stream::select(
            stream::select((&mut info).map(|_| Input::MembersChanged), key_receiver),
            ticks,
        );
        futures_util::pin_mut!(inputs);

        let upkeep = async {
            loop {
                sleep(Duration::from_millis(TICK_MS)).await;
                if self.state.lock().unwrap().left {
                    break;
                }
                if let Err(message) = self.maintain().await {
                    let mut state = self.state.lock().unwrap();
                    state
                        .fatal
                        .get_or_insert((CallErrorKind::Membership, message, true));
                    if let Some(wake) = &state.wake {
                        let _ = wake.unbounded_send(Input::Wake);
                    }
                    break;
                }
            }
            std::future::pending::<()>().await;
        };

        let events = async {
            let mut last_members: Option<Vec<CallMember>> = None;
            let mut pending_own_key: Option<(u64, CallEvent)> = None;
            let mut others_seen = false;
            let mut declined: std::collections::HashSet<String> = std::collections::HashSet::new();
            // Raised hand reaction event id -> who raised it
            let mut hands: HashMap<String, String> = HashMap::new();
            let mut input = Some(Input::MembersChanged);
            while let Some(next) = input.take() {
                if self.state.lock().unwrap().left {
                    break;
                }
                match next {
                    Input::Tick => {
                        if pending_own_key
                            .as_ref()
                            .is_some_and(|(due, _)| *due <= now_ms())
                        {
                            on_event(pending_own_key.take().unwrap().1);
                        }
                        let rung_at = self.state.lock().unwrap().rung_at;
                        if let Some(rung_at) = rung_at {
                            if others_seen {
                                self.state.lock().unwrap().rung_at = None;
                            } else if now_ms() > rung_at + RING_LIFETIME_MS {
                                self.state.lock().unwrap().rung_at = None;
                                on_event(CallEvent::Unanswered);
                            }
                        }
                    }
                    Input::Wake => {}
                    Input::MembersChanged => {
                        match call_members_of(
                            &self.room,
                            (self.user_id.clone(), self.device_id.clone()),
                            true,
                        )
                        .await
                        {
                            Ok(members) => {
                                self.observe_own_membership(&members);
                                if last_members.as_ref() != Some(&members) {
                                    self.log_members(last_members.as_deref(), &members);
                                    others_seen |=
                                        members.iter().any(|m| m.user_id != self.user_id);
                                    on_event(CallEvent::Members {
                                        members: members.clone(),
                                    });
                                    if encrypted {
                                        match self.share_key(&members).await {
                                            Ok(Some((event, delay))) => {
                                                if delay {
                                                    pending_own_key =
                                                        Some((now_ms() + KEY_USE_DELAY_MS, event));
                                                } else {
                                                    on_event(event);
                                                }
                                            }
                                            Ok(None) => {}
                                            Err(e) => self.log("key.failed", e.to_string()),
                                        }
                                    }
                                    last_members = Some(members);
                                }
                            }
                            Err(e) => self.log("members.failed", e.to_string()),
                        }
                    }
                    Input::Key(event) => on_event(event),
                    Input::Declined(user_id) => {
                        declined.insert(user_id.clone());
                        // In a group the ring goes on until everyone rung has declined
                        let others = self.room.joined_members_count().saturating_sub(1).max(1);
                        if declined.len() as u64 >= others {
                            self.state.lock().unwrap().rung_at = None;
                            on_event(CallEvent::Declined { user_id });
                        }
                    }
                    Input::Timeline(event) => {
                        let members = last_members.as_deref().unwrap_or_default();
                        if let Some(event) = call_timeline_event(&event, members, &mut hands) {
                            on_event(event);
                        }
                    }
                }
                let status = self.evaluate_status(now_ms());
                let fatal = self.state.lock().unwrap().fatal.take();
                if let Some((kind, message, leave)) = fatal {
                    self.log(
                        "fatal",
                        format!("{}: {message}", format!("{kind:?}").to_lowercase()),
                    );
                    if leave {
                        let _ = self.leave().await;
                    } else {
                        self.state.lock().unwrap().left = true;
                    }
                    self.flush_log(&mut on_event);
                    on_event(CallEvent::Error {
                        message,
                        fatal: true,
                        kind,
                    });
                    break;
                }
                if let Some(status) = status {
                    self.log("status", format!("{status:?}"));
                    on_event(CallEvent::Status { status });
                }
                self.flush_log(&mut on_event);
                input = inputs.next().await;
            }
        };
        futures_util::pin_mut!(upkeep, events);
        select(upkeep, events).await;
        self.state.lock().unwrap().wake = None;
    }

    fn flush_log(&self, on_event: &mut impl FnMut(CallEvent)) {
        let lines = std::mem::take(&mut self.state.lock().unwrap().unsent_log);
        for line in lines {
            on_event(CallEvent::Log { line });
        }
    }

    fn log_members(&self, before: Option<&[CallMember]>, members: &[CallMember]) {
        let before = before.unwrap_or_default();
        let mut changes = Vec::new();
        for m in members {
            if !before.iter().any(|b| b.identity == m.identity) {
                changes.push(format!("+{}", m.identity));
            }
        }
        for b in before {
            if !members.iter().any(|m| m.identity == b.identity) {
                changes.push(format!("-{}", b.identity));
            }
        }
        if changes.is_empty() {
            return;
        }
        let own = members.iter().any(|m| m.is_own_device);
        self.log(
            "members",
            format!("n={} own={own} {}", members.len(), changes.join(" ")),
        );
    }

    fn evaluate_status(&self, now: u64) -> Option<CallStatus> {
        self.state.lock().unwrap().next_status(now)
    }

    /// Notices the own membership vanishing (the server sent the delayed leave, or someone
    /// removed it) and joins again.
    fn observe_own_membership(&self, members: &[CallMember]) {
        let vanished = {
            let mut state = self.state.lock().unwrap();
            if state.left {
                return;
            }
            let own = members.iter().find(|m| m.is_own_device);
            match own {
                Some(own)
                    if own
                        .membership_event_id
                        .as_ref()
                        .is_some_and(|id| state.own_event_ids.contains(id)) =>
                {
                    state.own_seen = true;
                    state.own_missing_since = None;
                    state.created_ts = Some(own.joined_at);
                    state.membership_event_id = own.membership_event_id.clone();
                    None
                }
                _ if state.own_seen && state.rejoin.is_none() => {
                    state.own_seen = false;
                    state.own_missing_since = Some(now_ms());
                    state.restart_due = None;
                    state.renew_due = None;
                    state.rejoin_retries = Retries::default();
                    let first = if state.delay_id.is_some() {
                        Rejoin::CancelOldLeave
                    } else {
                        Rejoin::ScheduleLeave
                    };
                    state.rejoin = Some((first, now_ms()));
                    Some(format!(
                        "expected={} found={}",
                        state.membership_event_id.as_deref().unwrap_or("-"),
                        match own {
                            Some(own) => own.membership_event_id.as_deref().unwrap_or("?"),
                            None => "none",
                        }
                    ))
                }
                _ => None,
            }
        };
        if let Some(detail) = vanished {
            tracing::warn!("own call membership vanished, joining again ({detail})");
            self.log("membership.vanished", format!("{detail} -> rejoin"));
        }
    }

    /// Runs whatever keeps the membership up that is due: rejoining, restarting the delayed
    /// leave, renewing the membership before it expires. Errs when the call can't continue.
    async fn maintain(&self) -> std::result::Result<(), String> {
        let now = now_ms();
        let (rejoin, restart_due, renew_due) = {
            let state = self.state.lock().unwrap();
            (state.rejoin, state.restart_due, state.renew_due)
        };
        if let Some((step, due)) = rejoin {
            if due <= now {
                self.rejoin_step(step).await?;
            }
            return Ok(());
        }
        if restart_due.is_some_and(|due| due <= now) {
            self.restart_delayed_leave().await?;
        }
        if renew_due.is_some_and(|due| due <= now) {
            self.renew_membership().await?;
        }
        Ok(())
    }

    async fn rejoin_step(&self, step: Rejoin) -> std::result::Result<(), String> {
        let next = match step {
            Rejoin::CancelOldLeave => {
                let delay_id = self.state.lock().unwrap().delay_id.clone();
                let result = match delay_id {
                    Some(id) => self.update_delayed(id, UpdateAction::Cancel).await,
                    None => Ok(()),
                };
                match result.map_err(|e| classify_delayed(&e)) {
                    Ok(()) | Err(Failure::NotFound) => {
                        self.state.lock().unwrap().delay_id = None;
                        Some(Rejoin::ScheduleLeave)
                    }
                    Err(Failure::Unsupported) => {
                        self.state.lock().unwrap().delay_id = None;
                        Some(Rejoin::Join)
                    }
                    Err(failure) => {
                        return self.retry_rejoin(step, failure, "cancelling the old leave")
                    }
                }
            }
            Rejoin::ScheduleLeave => {
                if self.state.lock().unwrap().no_delayed_events {
                    Some(Rejoin::Join)
                } else {
                    match self
                        .send_delayed_leave()
                        .await
                        .map_err(|e| classify_delayed(&e))
                    {
                        Ok(_) => Some(Rejoin::Join),
                        Err(failure @ (Failure::RateLimited(_) | Failure::Network)) => {
                            return self.retry_rejoin(step, failure, "scheduling the leave")
                        }
                        Err(failure) => {
                            if matches!(failure, Failure::Unsupported) {
                                self.state.lock().unwrap().no_delayed_events = true;
                            }
                            Some(Rejoin::Join)
                        }
                    }
                }
            }
            Rejoin::Join => match self.send_join_once().await {
                Ok(()) => None,
                Err(error) => {
                    return self.retry_rejoin(step, classify(&error), "sending the membership")
                }
            },
        };
        {
            let mut state = self.state.lock().unwrap();
            state.rejoin_retries = Retries::default();
            state.rejoin = next.map(|step| (step, now_ms()));
        }
        self.log(
            "membership.rejoin",
            match next {
                Some(next) => format!("{step:?} ok, next {next:?}"),
                None => "membership sent".into(),
            },
        );
        Ok(())
    }

    fn retry_rejoin(
        &self,
        step: Rejoin,
        failure: Failure,
        what: &str,
    ) -> std::result::Result<(), String> {
        let wait = {
            let mut state = self.state.lock().unwrap();
            let wait = state.rejoin_retries.next(failure, what);
            if let Ok(wait) = wait {
                state.rejoin = Some((step, now_ms() + wait));
            }
            wait
        };
        match wait {
            Ok(wait) => {
                self.log(
                    "membership.rejoin",
                    format!("{what} failed, retry in {wait}ms"),
                );
                Ok(())
            }
            Err(why) => {
                self.log("membership.rejoin", format!("giving up: {why}"));
                Err(why)
            }
        }
    }

    /// Pushes the delayed leave back. A failed request never stops this: network errors are
    /// retried, and a leave the server lost is replaced by a new one.
    async fn restart_delayed_leave(&self) -> std::result::Result<(), String> {
        let (delay_id, leave_expected_at) = {
            let state = self.state.lock().unwrap();
            (state.delay_id.clone(), state.leave_expected_at)
        };
        let now = now_ms();
        let Some(delay_id) = delay_id else {
            return match self
                .send_delayed_leave()
                .await
                .map_err(|e| classify_delayed(&e))
            {
                Ok(_) => {
                    let mut state = self.state.lock().unwrap();
                    state.restart_retries = Retries::default();
                    state.restart_due = Some(now_ms() + DELAYED_LEAVE_RESTART_MS);
                    Ok(())
                }
                Err(Failure::Unsupported) => {
                    let mut state = self.state.lock().unwrap();
                    state.no_delayed_events = true;
                    state.restart_due = None;
                    Ok(())
                }
                Err(failure) => self.retry_restart(failure, "scheduling the leave"),
            };
        };
        let timeout = match leave_expected_at.checked_sub(now) {
            Some(left) if left > 0 => left.min(DELAYED_LEAVE_RESTART_TIMEOUT_MS),
            _ => DELAYED_LEAVE_RESTART_TIMEOUT_MS,
        };
        let result = within(
            timeout,
            self.update_delayed(delay_id.clone(), UpdateAction::Restart),
        )
        .await;
        let mut state = self.state.lock().unwrap();
        match result {
            Some(Ok(())) => {
                state.leave_expected_at = now_ms() + state.delayed_leave_ms(&self.timings);
                state.restart_retries = Retries::default();
                state.restart_due = Some(now_ms() + DELAYED_LEAVE_RESTART_MS);
                Ok(())
            }
            // A local timeout: try again right away
            None => {
                state
                    .restart_retries
                    .next(Failure::Network, "restarting the delayed leave")?;
                state.restart_due = Some(now_ms());
                Ok(())
            }
            Some(Err(error)) => match classify_delayed(&error) {
                Failure::NotFound => {
                    // The server lost it (or sending the membership cancelled it): schedule a new one
                    if state.delay_id.as_deref() == Some(delay_id.as_str()) {
                        state.delay_id = None;
                    }
                    state.restart_due = Some(now_ms());
                    Ok(())
                }
                Failure::Unsupported => {
                    state.no_delayed_events = true;
                    state.restart_due = None;
                    Ok(())
                }
                failure => {
                    drop(state);
                    self.retry_restart(failure, "restarting the delayed leave")
                }
            },
        }
    }

    fn retry_restart(&self, failure: Failure, what: &str) -> std::result::Result<(), String> {
        let wait = {
            let mut state = self.state.lock().unwrap();
            let wait = state.restart_retries.next(failure, what);
            if let Ok(wait) = wait {
                state.restart_due = Some(now_ms() + wait);
            }
            wait
        };
        match &wait {
            Ok(wait) => self.log("delayed_leave", format!("{what} failed, retry in {wait}ms")),
            Err(why) => self.log("delayed_leave", format!("giving up: {why}")),
        }
        wait.map(|_| ())
    }

    /// Sends the membership again with a later `expires`, a little before it runs out.
    async fn renew_membership(&self) -> std::result::Result<(), String> {
        let (iteration, created_ts, started_at) = {
            let state = self.state.lock().unwrap();
            (state.expiry_iteration, state.created_ts, state.started_at)
        };
        let next = iteration + 1;
        let expiry = self.state.lock().unwrap().expiry_ms;
        let expires = expiry * next;
        let content = self.membership_content(expires, Some(created_ts.unwrap_or(started_at)));
        let result = self.send_member_state(content).await;
        let outcome = {
            let mut state = self.state.lock().unwrap();
            match result {
                Ok(event_id) => {
                    state.remember_own_event(&event_id);
                    state.expiry_iteration = next;
                    state.renew_retries = Retries::default();
                    state.renew_due = Some(state.renew_at(&self.timings));
                    Ok(format!("ok event={event_id} iteration={next}"))
                }
                Err(error) => {
                    match state
                        .renew_retries
                        .next(classify(&error), "renewing the membership")
                    {
                        Ok(wait) => {
                            state.renew_due = Some(now_ms() + wait);
                            Ok(format!("failed, retry in {wait}ms: {error}"))
                        }
                        Err(why) => Err(why),
                    }
                }
            }
        };
        match outcome {
            Ok(detail) => {
                self.log("membership.renew", detail);
                Ok(())
            }
            Err(why) => {
                self.log("membership.renew", format!("giving up: {why}"));
                Err(why)
            }
        }
    }

    /// Cancels the scheduled leave on the server, as if the server had lost it. For tests.
    #[doc(hidden)]
    pub async fn cancel_delayed_leave(&self) -> Result<()> {
        if let Some(id) = self.delay_id() {
            self.update_delayed(id, UpdateAction::Cancel).await?;
        }
        Ok(())
    }

    /// Gives the media key to devices that lack it, rotating it when someone left. Returns the
    /// own key event when it changed, and whether to wait before using it.
    async fn share_key(&self, members: &[CallMember]) -> Result<Option<(CallEvent, bool)>> {
        let targets: Vec<(String, String, u64)> = members
            .iter()
            .filter(|m| !m.is_own_device)
            .map(|m| (m.user_id.clone(), m.device_id.clone(), m.joined_at))
            .collect();
        let current = self.state.lock().unwrap().outbound.clone();
        let now = now_ms();
        let (key, recipients, changed) = match current {
            None => {
                let key = OutboundKey {
                    index: 0,
                    key: random_key()?,
                    created_at: now,
                    shared_with: Vec::new(),
                };
                (key, targets.clone(), true)
            }
            Some(current) => {
                let left = current.shared_with.iter().any(|s| !targets.contains(s));
                let joined: Vec<_> = targets
                    .iter()
                    .filter(|t| !current.shared_with.contains(t))
                    .cloned()
                    .collect();
                if left || (!joined.is_empty() && now - current.created_at >= KEY_ROTATION_GRACE_MS)
                {
                    let key = OutboundKey {
                        index: (current.index + 1) % 256,
                        key: random_key()?,
                        created_at: now,
                        shared_with: Vec::new(),
                    };
                    (key, targets.clone(), true)
                } else if !joined.is_empty() {
                    (current, joined, false)
                } else {
                    return Ok(None);
                }
            }
        };
        let encoded = STANDARD.encode(key.key);
        if !recipients.is_empty() {
            let content = json!({
                "keys": { "index": key.index, "key": encoded },
                "room_id": self.room.room_id(),
                "member": { "claimed_device_id": self.device_id, "id": self.identity },
                "session": { "application": "m.call", "call_id": "", "scope": "m.room" },
                "sent_ts": now,
            });
            let raw: Raw<AnyToDeviceEventContent> =
                Raw::new(&content).map_err(call_error)?.cast_unchecked();
            let encryption = self.client.encryption();
            let mut devices = Vec::new();
            for (user, device, _) in &recipients {
                let (Ok(user), device) = (
                    <&matrix_sdk::ruma::UserId>::try_from(user.as_str()),
                    device.as_str(),
                ) else {
                    continue;
                };
                if let Ok(Some(device)) = encryption.get_device(user, device.into()).await {
                    devices.push(device);
                }
            }
            encryption
                .encrypt_and_send_raw_to_device(
                    devices.iter().collect(),
                    KEYS_EVENT,
                    raw,
                    CollectStrategy::AllDevices,
                )
                .await
                .map_err(call_error)?;
        }
        let mut shared = key.clone();
        shared.shared_with.extend(recipients);
        let delay = changed && !shared.shared_with.is_empty();
        let recipients = shared.shared_with.len();
        self.state.lock().unwrap().outbound = Some(shared);
        if changed {
            self.log(
                "key",
                format!("new index={} recipients={recipients}", key.index),
            );
        }
        Ok(changed.then(|| {
            (
                CallEvent::Key {
                    identity: self.identity.clone(),
                    index: key.index,
                    key: encoded,
                },
                delay,
            )
        }))
    }

    /// Rings the others again (when nobody answered); returns false when someone is in the call.
    pub async fn ring_again(&self) -> Result<bool> {
        let members = call_members_of(
            &self.room,
            (self.user_id.clone(), self.device_id.clone()),
            false,
        )
        .await?;
        let membership = self.state.lock().unwrap().membership_event_id.clone();
        match membership {
            Some(id) if !call_running(&members) && !is_voice_room(&self.room) => {
                self.notify(&id).await?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// Sends an emoji into the call; everyone sees it on this device's tile.
    pub async fn send_reaction(&self, emoji: &str, name: &str) -> Result<()> {
        let Some(membership) = self.state.lock().unwrap().membership_event_id.clone() else {
            return Ok(());
        };
        let content = json!({
            "m.relates_to": { "rel_type": "m.reference", "event_id": membership },
            "emoji": emoji,
            "name": name,
        });
        self.room.send_raw(CALL_REACTION_EVENT, content).await?;
        Ok(())
    }

    /// Raises or lowers this device's hand (a 🖐️ reaction to the membership).
    pub async fn set_hand_raised(&self, raised: bool) -> Result<()> {
        let (membership, current) = {
            let state = self.state.lock().unwrap();
            (
                state.membership_event_id.clone(),
                state.own_hand_event_id.clone(),
            )
        };
        let Some(membership) = membership else {
            return Ok(());
        };
        match (raised, current) {
            (true, None) => {
                let content = json!({
                    "m.relates_to": { "rel_type": "m.annotation", "event_id": membership, "key": RAISED_HAND_KEY },
                });
                let response = self.room.send_raw("m.reaction", content).await?;
                self.state.lock().unwrap().own_hand_event_id =
                    Some(response.response.event_id.to_string());
            }
            (false, Some(event_id)) => {
                self.state.lock().unwrap().own_hand_event_id = None;
                let event_id =
                    matrix_sdk::ruma::OwnedEventId::try_from(event_id).map_err(call_error)?;
                self.room.redact(&event_id, None, None).await?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Leaves the call (the delayed leave goes out right away).
    pub async fn leave(&self) -> Result<()> {
        let (delay_id, replaced, already) = {
            let mut state = self.state.lock().unwrap();
            let already = state.left;
            state.left = true;
            state.rejoin = None;
            (state.delay_id.take(), state.replaced, already)
        };
        if replaced {
            if !already {
                self.log("leave", "skipped: the call goes on in another window");
            }
            return Ok(());
        }
        if let Some(delay_id) = delay_id {
            if self
                .update_delayed(delay_id, UpdateAction::Send)
                .await
                .is_ok()
            {
                self.log("leave", "ok (sent the delayed leave)");
                return Ok(());
            }
        }
        let result = self
            .room
            .send_state_event_raw(CALL_MEMBER_EVENT, &self.state_key, json!({}))
            .await;
        match &result {
            Ok(_) => self.log("leave", "ok (empty membership)"),
            Err(error) => self.log("leave", format!("failed: {error}")),
        }
        result?;
        Ok(())
    }
}

impl SessionState {
    fn next_status(&mut self, now: u64) -> Option<CallStatus> {
        let state = self;
        if state.left || state.fatal.is_some() {
            return None;
        }
        let media_up = state.media == Some(MediaState::Connected);
        let next = if !state.joined {
            let waited = now.saturating_sub(state.run_started_at);
            if media_up && state.own_seen {
                state.joined = true;
                CallStatus::Connected
            } else if !media_up && waited > MEDIA_CONNECT_TIMEOUT_MS {
                state.fatal = Some((
                    CallErrorKind::Timeout,
                    "the call server didn't connect in time".into(),
                    true,
                ));
                return None;
            } else if waited > JOINING_SLOW_MS {
                CallStatus::JoiningSlow
            } else if media_up {
                CallStatus::JoiningMembership
            } else {
                CallStatus::JoiningMedia
            }
        } else {
            let down_for = (!media_up).then(|| now.saturating_sub(state.media_since));
            if down_for.is_some_and(|d| d > RECONNECT_GIVE_UP_MS) {
                state.fatal = Some((
                    CallErrorKind::Disconnected,
                    "lost the connection to the call server".into(),
                    true,
                ));
                return None;
            }
            let media_problem = down_for.is_some_and(|d| d >= RECONNECTING_SHOW_MS);
            let membership_problem = state
                .own_missing_since
                .is_some_and(|since| now.saturating_sub(since) >= MEMBERSHIP_GAP_SHOW_MS);
            match state.shown {
                _ if media_problem || membership_problem => CallStatus::Reconnecting,
                Some((CallStatus::Reconnecting, since))
                    if now.saturating_sub(since) < RECONNECTING_MIN_VISIBLE_MS =>
                {
                    CallStatus::Reconnecting
                }
                _ => CallStatus::Connected,
            }
        };
        if state.shown.map(|(status, _)| status) == Some(next) {
            return None;
        }
        state.shown = Some((next, now));
        Some(next)
    }

    fn delayed_leave_ms(&self, timings: &CallTimings) -> u64 {
        timings.delayed_leave.as_millis() as u64
    }

    /// When to renew next: before the current `expires` runs out, and at least hourly
    fn renew_at(&self, timings: &CallTimings) -> u64 {
        let expiry = if self.expiry_ms > 0 {
            self.expiry_ms
        } else {
            timings.membership_expiry.as_millis() as u64
        };
        let period = expiry.min(MEMBERSHIP_RENEW_MAX_MS);
        let headroom = (period / 4).min(MEMBERSHIP_RENEW_HEADROOM_MAX_MS);
        (self.started_at + period * self.expiry_iteration).saturating_sub(headroom)
    }

    fn remember_own_event(&mut self, event_id: &str) {
        if self.own_event_ids.len() == 16 {
            self.own_event_ids.pop_front();
        }
        self.own_event_ids.push_back(event_id.to_owned());
    }
}

/// Reactions and raised hands relate to someone's membership event
fn call_timeline_event(
    event: &Value,
    members: &[CallMember],
    hands: &mut HashMap<String, String>,
) -> Option<CallEvent> {
    let kind = event.get("type")?.as_str()?;
    if kind == "m.room.redaction" {
        let redacts = event
            .get("redacts")
            .or_else(|| event.pointer("/content/redacts"))?
            .as_str()?;
        let identity = hands.remove(redacts)?;
        return Some(CallEvent::HandRaised {
            identity,
            raised: false,
        });
    }
    let relates = event.pointer("/content/m.relates_to/event_id")?.as_str()?;
    let sender = event.get("sender")?.as_str()?;
    let member = members
        .iter()
        .find(|m| m.membership_event_id.as_deref() == Some(relates) && m.user_id == sender)?;
    if kind == CALL_REACTION_EVENT {
        let emoji = event.pointer("/content/emoji")?.as_str()?;
        return Some(CallEvent::Reaction {
            identity: member.identity.clone(),
            emoji: emoji.to_owned(),
        });
    }
    let key = event.pointer("/content/m.relates_to/key")?.as_str()?;
    if kind == "m.reaction" && key.starts_with('🖐') {
        hands.insert(
            event.get("event_id")?.as_str()?.to_owned(),
            member.identity.clone(),
        );
        return Some(CallEvent::HandRaised {
            identity: member.identity.clone(),
            raised: true,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_session_memberships() {
        let event = json!({
            "sender": "@a:x", "origin_server_ts": 1000, "state_key": "_@a:x_DEV_m.call",
            "content": {
                "application": "m.call", "call_id": "", "scope": "m.room", "device_id": "DEV",
                "expires": 10_000, "m.call.intent": "audio",
                "foci_preferred": [{ "type": "livekit", "livekit_service_url": "https://sfu.x/", "livekit_alias": "!r:x" }],
                "focus_active": { "type": "livekit", "focus_selection": "multi_sfu" },
            },
        });
        let member = parse_member(&event, ("@a:x", "DEV"), 2000).unwrap();
        assert_eq!(member.identity, "@a:x:DEV");
        assert_eq!(member.service_url.as_deref(), Some("https://sfu.x"));
        assert!(member.is_own_device);
        assert_eq!(member.intent.as_deref(), Some("audio"));
        assert!(
            parse_member(&event, ("@b:x", "D"), 20_000).is_none(),
            "expired"
        );
        let left = json!({ "sender": "@a:x", "origin_server_ts": 1000, "content": {} });
        assert!(parse_member(&left, ("@a:x", "DEV"), 2000).is_none());
    }

    #[test]
    fn reads_the_jwt_claims() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"sub":"@a:x:DEV","video":{"room":"r"}}"#);
        let claims = decode_jwt_claims(&format!("h.{payload}.s")).unwrap();
        assert_eq!(claims["sub"], "@a:x:DEV");
        assert_eq!(claims["video"]["room"], "r");
    }

    #[test]
    fn finds_livekit_foci_leniently() {
        let foci = json!([{ "type": "other" }, { "type": "livekit", "livekit_service_url": " https://sfu.x// " }]);
        assert_eq!(livekit_from(Some(&foci)).as_deref(), Some("https://sfu.x"));
        assert_eq!(livekit_from(Some(&json!({}))), None);
    }

    fn joined_state() -> SessionState {
        let mut state = SessionState {
            run_started_at: 0,
            media: Some(MediaState::Connected),
            own_seen: true,
            ..Default::default()
        };
        assert_eq!(state.next_status(100), Some(CallStatus::Connected));
        state
    }

    #[test]
    fn joining_shows_steps_and_times_out() {
        let mut state = SessionState::default();
        assert_eq!(state.next_status(0), Some(CallStatus::JoiningMedia));
        assert_eq!(state.next_status(1_000), None);
        state.media = Some(MediaState::Connected);
        assert_eq!(
            state.next_status(2_000),
            Some(CallStatus::JoiningMembership)
        );
        state.media = Some(MediaState::Reconnecting);
        assert_eq!(state.next_status(9_000), Some(CallStatus::JoiningSlow));
        assert_eq!(state.next_status(MEDIA_CONNECT_TIMEOUT_MS + 1), None);
        assert_eq!(state.fatal.as_ref().unwrap().0, CallErrorKind::Timeout);
    }

    #[test]
    fn short_blips_never_show_as_reconnecting() {
        let mut state = joined_state();
        state.media = Some(MediaState::Reconnecting);
        state.media_since = 1_000;
        assert_eq!(state.next_status(1_500), None);
        state.media = Some(MediaState::Connected);
        assert_eq!(state.next_status(2_000), None);
    }

    #[test]
    fn reconnecting_shows_after_a_while_and_stays_briefly() {
        let mut state = joined_state();
        state.media = Some(MediaState::Reconnecting);
        state.media_since = 1_000;
        assert_eq!(state.next_status(3_000), Some(CallStatus::Reconnecting));
        state.media = Some(MediaState::Connected);
        assert_eq!(state.next_status(3_200), None);
        assert_eq!(state.next_status(4_100), Some(CallStatus::Connected));
        state.media = Some(MediaState::Disconnected);
        state.media_since = 5_000;
        assert_eq!(state.next_status(7_000), Some(CallStatus::Reconnecting));
        assert_eq!(state.next_status(5_000 + RECONNECT_GIVE_UP_MS + 1), None);
        assert_eq!(state.fatal.as_ref().unwrap().0, CallErrorKind::Disconnected);
    }

    #[test]
    fn a_missing_membership_shows_only_when_it_lasts() {
        let mut state = joined_state();
        state.own_seen = false;
        state.own_missing_since = Some(1_000);
        assert_eq!(state.next_status(5_000), None);
        assert_eq!(
            state.next_status(1_000 + MEMBERSHIP_GAP_SHOW_MS),
            Some(CallStatus::Reconnecting)
        );
    }

    #[test]
    fn disconnect_reasons_decide_what_happens() {
        assert!(media_decision(MediaState::Disconnected, "SIGNAL_CLOSE").0);
        assert!(media_decision(MediaState::Disconnected, "").0);
        assert_eq!(
            media_decision(MediaState::Disconnected, "CLIENT_INITIATED"),
            (false, None)
        );
        let (reconnect, fatal) = media_decision(MediaState::Disconnected, "DUPLICATE_IDENTITY");
        assert!(!reconnect);
        assert_eq!(
            fatal.map(|f| (f.0, f.2)),
            Some((CallErrorKind::Replaced, false))
        );
        let (_, fatal) = media_decision(MediaState::Disconnected, "PARTICIPANT_REMOVED");
        assert_eq!(
            fatal.map(|f| (f.0, f.2)),
            Some((CallErrorKind::Removed, true))
        );
        assert!(!media_decision(MediaState::Reconnecting, "").0);
    }

    #[test]
    fn renews_short_memberships_with_room_to_spare() {
        let state = SessionState {
            started_at: 0,
            expiry_iteration: 1,
            expiry_ms: NO_DELAY_MEMBERSHIP_EXPIRES_MS,
            ..Default::default()
        };
        assert_eq!(
            state.renew_at(&CallTimings::default()),
            NO_DELAY_MEMBERSHIP_EXPIRES_MS - 60_000
        );
    }

    #[test]
    fn renews_before_expiry() {
        let timings = CallTimings {
            membership_expiry: Duration::from_secs(20),
            delayed_leave: Duration::from_secs(18),
        };
        let state = SessionState {
            started_at: 1_000_000,
            expiry_iteration: 1,
            ..Default::default()
        };
        assert_eq!(state.renew_at(&timings), 1_015_000);
        assert_eq!(
            SessionState {
                started_at: 0,
                expiry_iteration: 2,
                ..Default::default()
            }
            .renew_at(&CallTimings::default()),
            2 * 60 * 60 * 1000 - 60_000
        );
    }
}
