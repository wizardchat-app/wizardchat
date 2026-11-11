//! WizardChat's client core.
//!
//! Everything a WizardChat app needs that isn't UI: signing in, syncing, the room list and room
//! timelines, built on matrix-rust-sdk. Apps talk to it only through [`WizardClient`] and get
//! state pushed to them as [`ListDiff`]s of plain, serialisable view models, so the same core can
//! sit behind the web app (wasm), desktop (Tauri), iOS (SwiftUI) and Android (Compose).

// matrix-sdk's deeply nested futures need more than the default limit
#![recursion_limit = "256"]
// The SDK types aren't Send on wasm, but native builds need the Arcs
#![cfg_attr(target_arch = "wasm32", allow(clippy::arc_with_non_send_sync))]

mod account;
mod auth;
mod call_history;
mod call_log;
mod calls;
mod client;
mod content;
mod diff;
mod directory;
mod encryption;
mod error;
mod extras;
mod features;
mod profile;
mod push;
mod qr_login;
mod rich_text;
mod room_admin;
mod room_details;
mod rooms;
pub mod rpc;
mod sections;
mod session;
mod settings;
mod spaces;
mod timeline;
#[cfg(not(target_arch = "wasm32"))]
mod token_file;
mod trust;
mod widgets;

pub use account::{RegistrationInfo, ServerFeatures, ThirdPartyId};
pub use account::{UiaAuth, UiaOutcome};
pub use auth::{AppInfo, IdentityProvider, PendingLogin, ServerInfo, SessionEvent};
pub use call_history::{CallHistoryView, CallOutcome, CallParticipantView};
pub use calls::CallTimings;
pub use calls::{
    CallErrorKind, CallEvent, CallMember, CallSession, CallStatus, IncomingCall, IncomingCallEvent,
    MediaState, RingEnd, SfuConfig,
};
pub use client::{sniff_mime_type, LoadState};
pub use client::{SyncState, WizardClient};
pub use content::{EntryContent, MediaInfo, PollAnswerView, PollView, ReplyPreview};
pub use diff::ListDiff;
pub use directory::{PublicRoom, PublicRoomsPage, UserResult};
pub use encryption::{
    DeviceInfo, EncryptionStatus, VerificationEmoji, VerificationFlow, VerificationStatus,
};
pub use error::{Error, Result};
pub use extras::{ThreadInfo, ThreadPage, UrlPreview};
pub use features::{EmojiPack, Notification, PackImage, SearchHit};
pub use profile::{
    CustomStatus, MutualRoom, Presence, PresenceInfo, UserProfile, MAX_STATUS_LENGTH, STATUS_FIELD,
};
pub use push::PusherConfig;
pub use qr_login::{QrLoginControl, QrLoginStatus};
pub use rich_text::{RichBlock, RichSpan};
pub use room_admin::{
    EventSource, MemberEntry, MessageVersion, ResolvedAlias, RoomSettings, RoomTag,
    ServerCapabilities, StateChange, Tombstone,
};
pub use room_details::{Member, RoomDetails, RoomPermissions};
pub use rooms::UnreadMention;
pub use rooms::{CreateRoomOptions, InviteInfo, RoomFilter, RoomKind, RoomSummary};
pub use sections::RoomSection;
pub use session::{Session, StoreConfig};
pub use settings::{MentionRule, NotificationMode, NotificationPrefs};
pub use spaces::SpaceHierarchy;
pub use spaces::{SpaceChild, SpaceLink, SpaceNode, SpaceSummary};
pub use timeline::{
    Attachment, MentionsInput, MentionsView, MessageKind, Reaction, ReadReceiptView, RoomTimeline,
    SendState, ThreadSummaryView, TimelineEntry, TimelineKind, TypingUser,
};
pub use timeline::{UploadProgress, UploadedAttachment};
pub use trust::{IdentityChange, UserTrust};
pub use widgets::Widget;
