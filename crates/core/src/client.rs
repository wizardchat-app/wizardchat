use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use matrix_sdk::{
    authentication::{
        matrix::MatrixSession,
        oauth::{ClientId, OAuthSession, UserSession},
        SessionTokens,
    },
    encryption::{BackupDownloadStrategy, EncryptionSettings},
    media::{MediaFormat, MediaRequestParameters, MediaThumbnailSettings},
    ruma::{
        api::client::media::get_content_thumbnail::v3::Method,
        events::{
            push_rules::PushRulesEventContent, room::MediaSource, GlobalAccountDataEventType,
        },
        OwnedDeviceId, OwnedMxcUri, OwnedUserId, TransactionId, UInt,
    },
    Client, ClientBuilder, SessionMeta,
};
use matrix_sdk_ui::{
    room_list_service,
    spaces::SpaceService,
    sync_service::{self, SyncService},
};
use serde::Serialize;
use serde_json::Value;

use crate::{Error, Result, Session, StoreConfig};

/// The state of the background sync, as shown to the user.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum SyncState {
    Idle,
    Running,
    Offline,
    Error,
    Terminated,
}

impl From<&sync_service::State> for SyncState {
    fn from(state: &sync_service::State) -> Self {
        match state {
            sync_service::State::Idle => SyncState::Idle,
            sync_service::State::Running => SyncState::Running,
            sync_service::State::Offline => SyncState::Offline,
            sync_service::State::Error(_) => SyncState::Error,
            sync_service::State::Terminated => SyncState::Terminated,
        }
    }
}

/// How far the account's data has loaded, for the loading screen and for anything that must
/// not act on an empty state (like pushing local settings over the account's)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum LoadState {
    /// Nothing to show yet
    Loading,
    /// What this device stored from earlier syncs is there; the server hasn't answered yet
    Cached,
    /// The server answered the first sync
    Synced,
}

fn has_synced(state: &room_list_service::State) -> bool {
    use room_list_service::State::*;
    match state {
        SettingUp | Recovering | Running => true,
        Error { from } | Terminated { from } => matches!(**from, Recovering | Running),
        Init => false,
    }
}

/// A signed-in Matrix account. One per account; apps with several accounts create several.
pub struct WizardClient {
    client: Client,
    restored: bool,
    /// The newest tokens another instance on the same store refreshed (another browser tab)
    shared_tokens: Arc<Mutex<Option<SessionTokens>>>,
    sync: Mutex<Option<Arc<SyncService>>>,
    pub(crate) identity_reset_cancel: Mutex<Option<futures_channel::oneshot::Sender<()>>>,
    pub(crate) spaces: Mutex<Option<Arc<SpaceService>>>,
    pub(crate) notifications:
        Mutex<Option<matrix_sdk::notification_settings::NotificationSettings>>,
}

impl WizardClient {
    /// The SDK client every sign-in path uses: persistent stores, refresh-token handling, and
    /// cross-signing plus key backup set up automatically.
    pub(crate) async fn build_client(server: &str, store: &StoreConfig) -> Result<Client> {
        Self::finish_build(
            Client::builder().server_name_or_homeserver_url(server),
            store,
        )
        .await
    }

    async fn build_restored_client(homeserver_url: &str, store: &StoreConfig) -> Result<Client> {
        Self::finish_build(Client::builder().homeserver_url(homeserver_url), store).await
    }

    async fn finish_build(builder: ClientBuilder, store: &StoreConfig) -> Result<Client> {
        let builder =
            builder
                .handle_refresh_tokens()
                .with_encryption_settings(EncryptionSettings {
                    auto_enable_cross_signing: !store.manual_encryption_setup,
                    backup_download_strategy: BackupDownloadStrategy::AfterDecryptionFailure,
                    auto_enable_backups: !store.manual_encryption_setup,
                });
        let builder = if store.exclude_insecure_devices {
            builder
                .with_decryption_settings(matrix_sdk_crypto::DecryptionSettings {
                    sender_device_trust_requirement:
                        matrix_sdk_crypto::TrustRequirement::CrossSignedOrLegacy,
                })
                .with_room_key_recipient_strategy(
                    matrix_sdk_crypto::CollectStrategy::IdentityBasedStrategy,
                )
        } else {
            builder
        };
        let builder = match &store.process_name {
            Some(name) => builder.cross_process_store_config(
                matrix_sdk::cross_process_lock::CrossProcessLockConfig::multi_process(name.clone()),
            ),
            None => builder,
        };
        #[cfg(target_arch = "wasm32")]
        let builder = builder.indexeddb_store(&store.location, store.passphrase.as_deref());
        #[cfg(not(target_arch = "wasm32"))]
        let builder =
            builder.sqlite_store_with_config_and_cache_path(sqlite_config(store), None::<&str>);
        builder.build().await.map_err(Error::from)
    }

    pub(crate) fn from_sdk(client: Client) -> Self {
        Self {
            client,
            restored: false,
            shared_tokens: Arc::new(Mutex::new(None)),
            sync: Mutex::new(None),
            identity_reset_cancel: Mutex::new(None),
            spaces: Mutex::new(None),
            notifications: Mutex::new(None),
        }
    }

    /// Signs in with a username (or full Matrix ID) and password.
    ///
    /// `server` may be a server name (`matrix.org`, resolved via .well-known) or a URL.
    pub async fn login_password(
        server: &str,
        username: &str,
        password: &str,
        device_name: &str,
        store: StoreConfig,
    ) -> Result<(Self, Session)> {
        let client = Self::build_client(server, &store).await?;
        client
            .matrix_auth()
            .login_username(username, password)
            .initial_device_display_name(device_name)
            .request_refresh_token()
            .await
            .map_err(Error::from_login)?;
        let this = Self::from_sdk(client);
        let session = this.session()?;
        Ok((this, session))
    }

    /// Restores a session saved from [`Self::session`], without signing in again.
    pub async fn restore(session: Session, store: StoreConfig) -> Result<Self> {
        let client = Self::build_restored_client(&session.homeserver_url, &store).await?;
        let user_id = OwnedUserId::try_from(session.user_id.as_str())
            .map_err(|e| Error::InvalidId(e.to_string()))?;
        let device_id: OwnedDeviceId = session.device_id.as_str().into();
        let meta = SessionMeta { user_id, device_id };
        #[cfg_attr(target_arch = "wasm32", allow(unused_mut))]
        let mut tokens = SessionTokens {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
        };
        #[cfg(not(target_arch = "wasm32"))]
        let token_file = crate::token_file::TokenFile::new(&store).map(Arc::new);
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(newer) = token_file.as_ref().and_then(|file| file.read()) {
            tokens = newer;
        }
        let shared_tokens = Arc::new(Mutex::new(Some(tokens.clone())));
        let newest = shared_tokens.clone();
        #[cfg(not(target_arch = "wasm32"))]
        let reader = token_file.clone();
        let reload = Box::new(move |_: Client| {
            #[cfg(not(target_arch = "wasm32"))]
            if let Some(tokens) = reader.as_ref().and_then(|file| file.read()) {
                return Ok(tokens);
            }
            newest
                .lock()
                .unwrap()
                .clone()
                .ok_or_else(|| "no session to reload".into())
        });
        #[cfg(not(target_arch = "wasm32"))]
        let writer = token_file.clone();
        let save = Box::new(move |_client: Client| {
            #[cfg(not(target_arch = "wasm32"))]
            if let (Some(file), Some(tokens)) = (writer.as_ref(), _client.session_tokens()) {
                file.write(&tokens)?;
            }
            Ok(())
        });
        client.set_session_callbacks(reload, save)?;
        match session.oauth_client_id {
            Some(client_id) => {
                // Processes and tabs sharing this store take turns refreshing the rotating tokens
                client
                    .oauth()
                    .enable_cross_process_refresh_lock(TransactionId::new().to_string())
                    .await
                    .map_err(|e| Error::Sdk(e.to_string()))?;
                client
                    .restore_session(OAuthSession {
                        client_id: ClientId::new(client_id),
                        user: UserSession { meta, tokens },
                    })
                    .await?
            }
            None => {
                client
                    .restore_session(MatrixSession { meta, tokens })
                    .await?
            }
        }
        Ok(Self {
            restored: true,
            shared_tokens,
            ..Self::from_sdk(client)
        })
    }

    /// Takes over a session another instance on the same store stored after refreshing its
    /// tokens, so this one doesn't refresh with tokens the server already rotated out.
    pub fn adopt_session(&self, session: &Session) {
        if self.user_id().as_deref() == Some(session.user_id.as_str()) {
            *self.shared_tokens.lock().unwrap() = Some(SessionTokens {
                access_token: session.access_token.clone(),
                refresh_token: session.refresh_token.clone(),
            });
        }
    }

    /// The current session, to be stored by the app. Changes when tokens are refreshed.
    pub fn session(&self) -> Result<Session> {
        Self::session_of(&self.client)
    }

    pub fn user_id(&self) -> Option<String> {
        self.client.user_id().map(ToString::to_string)
    }

    pub(crate) fn sdk(&self) -> &Client {
        &self.client
    }

    pub(crate) fn sync_service(&self) -> Result<Arc<SyncService>> {
        self.sync
            .lock()
            .unwrap()
            .clone()
            .ok_or(Error::SyncNotStarted)
    }

    /// Starts (or resumes) the background sync. Room list and timelines need it running.
    pub async fn start_sync(&self) -> Result<()> {
        self.built_sync_service().await?.start().await;
        Ok(())
    }

    /// The sync service, created (but not started) when there's none yet
    pub(crate) async fn built_sync_service(&self) -> Result<Arc<SyncService>> {
        if let Some(service) = self.sync.lock().unwrap().clone() {
            return Ok(service);
        }
        let service = Arc::new(
            SyncService::builder(self.client.clone())
                .with_offline_mode()
                .build()
                .await?,
        );
        let mut sync = self.sync.lock().unwrap();
        Ok(sync.get_or_insert(service).clone())
    }

    /// Pauses the background sync, e.g. while the app is in the background.
    pub(crate) fn is_syncing(&self) -> bool {
        self.sync.lock().unwrap().is_some()
    }

    pub async fn stop_sync(&self) {
        let service = self.sync.lock().unwrap().clone();
        if let Some(service) = service {
            service.stop().await;
        }
    }

    /// Reports the sync state now and on every change, until the sync service goes away.
    pub async fn watch_sync_state(&self, mut on_change: impl FnMut(SyncState)) -> Result<()> {
        let service = self.sync_service()?;
        let mut states = service.state();
        on_change(SyncState::from(&states.get()));
        while let Some(state) = states.next().await {
            on_change(SyncState::from(&state));
        }
        Ok(())
    }

    /// Reports how far the account's data has loaded, until the first sync is done.
    pub async fn watch_load_state(&self, mut on_change: impl FnMut(LoadState)) -> Result<()> {
        let service = self.sync_service()?;
        let mut states = service.room_list_service().state();
        if has_synced(&states.get()) {
            on_change(LoadState::Synced);
            return Ok(());
        }
        // The push rules come with every first sync, so a stored copy means an earlier one finished
        let cached = self.restored
            && self
                .client
                .account()
                .account_data::<PushRulesEventContent>()
                .await
                .is_ok_and(|rules| rules.is_some());
        on_change(if cached {
            LoadState::Cached
        } else {
            LoadState::Loading
        });
        while let Some(state) = states.next().await {
            if has_synced(&state) {
                on_change(LoadState::Synced);
                break;
            }
        }
        Ok(())
    }

    /// Account data as stored on this device by the last sync, without asking the server.
    pub async fn cached_account_data(&self, event_type: &str) -> Result<Option<Value>> {
        let raw = self
            .client
            .account()
            .account_data_raw(GlobalAccountDataEventType::from(event_type))
            .await?;
        raw.map(|raw| {
            raw.deserialize_as::<Value>()
                .map_err(|e| Error::Sdk(e.to_string()))
        })
        .transpose()
    }

    /// Signs out and invalidates the session on the server. The stores should be deleted after.
    pub async fn logout(&self) -> Result<()> {
        self.stop_sync().await;
        self.client.logout().await?;
        Ok(())
    }

    /// Ends a stored session on the server without restoring it (when restoring failed).
    pub async fn logout_session(session: Session) -> Result<()> {
        let client = Client::builder()
            .homeserver_url(&session.homeserver_url)
            .build()
            .await?;
        let user_id = OwnedUserId::try_from(session.user_id.as_str())
            .map_err(|e| Error::InvalidId(e.to_string()))?;
        let meta = SessionMeta {
            user_id,
            device_id: session.device_id.as_str().into(),
        };
        let tokens = SessionTokens {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
        };
        match session.oauth_client_id {
            Some(client_id) => {
                client
                    .oauth()
                    .restore_session(
                        OAuthSession {
                            client_id: ClientId::new(client_id),
                            user: UserSession { meta, tokens },
                        },
                        Default::default(),
                    )
                    .await?
            }
            None => {
                client
                    .matrix_auth()
                    .restore_session(MatrixSession { meta, tokens }, Default::default())
                    .await?
            }
        }
        let logout = client.logout();
        let timeout = matrix_sdk::sleep::sleep(LOGOUT_TIMEOUT);
        futures_util::pin_mut!(logout, timeout);
        match futures_util::future::select(logout, timeout).await {
            futures_util::future::Either::Left((result, _)) => Ok(result?),
            futures_util::future::Either::Right(_) => Ok(()),
        }
    }

    /// Downloads a message's media (decrypting it if needed). `source` is the opaque
    /// `MediaInfo::source` or `thumbnail_source`; a size asks the server for a thumbnail of
    /// unencrypted media instead of the full file.
    pub async fn media(
        &self,
        source: serde_json::Value,
        thumbnail: Option<(u32, u32)>,
    ) -> Result<Vec<u8>> {
        let source: MediaSource = serde_json::from_value(source)
            .map_err(|e| Error::InvalidId(format!("media source: {e}")))?;
        let format = match (&source, thumbnail) {
            (MediaSource::Plain(_), Some((width, height))) => MediaFormat::Thumbnail(
                MediaThumbnailSettings::new(UInt::from(width), UInt::from(height)),
            ),
            _ => MediaFormat::File,
        };
        let request = MediaRequestParameters { source, format };
        Ok(self
            .client
            .media()
            .get_media_content(&request, true)
            .await?)
    }

    /// Downloads a thumbnail of an `mxc://` URI (avatars, previews) with the account's
    /// credentials, as authenticated media requires. Cropped to the size, or scaled to fit.
    pub async fn thumbnail(
        &self,
        mxc: &str,
        width: u32,
        height: u32,
        crop: bool,
    ) -> Result<Vec<u8>> {
        let uri: OwnedMxcUri = mxc.into();
        let method = if crop { Method::Crop } else { Method::Scale };
        let request = MediaRequestParameters {
            source: MediaSource::Plain(uri),
            format: MediaFormat::Thumbnail(MediaThumbnailSettings::with_method(
                method,
                UInt::from(width),
                UInt::from(height),
            )),
        };
        Ok(self
            .client
            .media()
            .get_media_content(&request, true)
            .await?)
    }
}

const LOGOUT_TIMEOUT: Duration = Duration::from_secs(10);

/// The type of media bytes, recognised by their first bytes, for the types clients display or
/// play. Servers don't hand the uploaded type through the SDK.
pub fn sniff_mime_type(bytes: &[u8]) -> Option<&'static str> {
    let starts = |prefix: &[u8]| bytes.starts_with(prefix);
    let at = |offset: usize, tag: &[u8]| bytes.get(offset..offset + tag.len()) == Some(tag);
    Some(if starts(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if starts(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if starts(b"GIF87a") || starts(b"GIF89a") {
        "image/gif"
    } else if starts(b"RIFF") && at(8, b"WEBP") {
        "image/webp"
    } else if starts(b"RIFF") && at(8, b"WAVE") {
        "audio/wav"
    } else if at(4, b"ftyp") {
        match bytes.get(8..12) {
            Some(b"avif" | b"avis") => "image/avif",
            Some(b"heic" | b"heix" | b"mif1" | b"msf1") => "image/heic",
            Some(b"M4A " | b"M4B ") => "audio/mp4",
            Some(b"qt  ") => "video/quicktime",
            _ => "video/mp4",
        }
    } else if starts(b"\x1a\x45\xdf\xa3") {
        "video/webm"
    } else if starts(b"OggS") {
        "audio/ogg"
    } else if starts(b"ID3") || starts(b"\xff\xfb") || starts(b"\xff\xf3") || starts(b"\xff\xf2") {
        "audio/mpeg"
    } else if starts(b"fLaC") {
        "audio/flac"
    } else if starts(b"BM") {
        "image/bmp"
    } else if starts(b"\x00\x00\x01\x00") {
        "image/x-icon"
    } else if starts(b"%PDF-") {
        "application/pdf"
    } else {
        return None;
    })
}

#[cfg(not(target_arch = "wasm32"))]
fn sqlite_config(store: &StoreConfig) -> matrix_sdk::SqliteStoreConfig {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let config = matrix_sdk::SqliteStoreConfig::new(&store.location);
    let Some(passphrase) = store.passphrase.as_deref() else {
        return config;
    };
    match STANDARD.decode(passphrase) {
        Ok(key) if key.len() == 32 && STANDARD.encode(&key) == passphrase => {
            config.high_entropy_passphrase(Some(&key), matrix_sdk_sqlite::Base64Variant::Padded)
        }
        _ => config.passphrase(Some(passphrase)),
    }
}
