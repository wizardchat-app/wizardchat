//! Shared by the examples: throwaway accounts and stores, so they only need a local homeserver
//! with open registration (`WZ_SERVER`, default http://localhost:8008).

#![allow(dead_code)]

use std::time::{SystemTime, UNIX_EPOCH};

use wizardchat_core::{Session, StoreConfig, WizardClient};

pub type BoxError = Box<dyn std::error::Error>;

pub fn server() -> String {
    std::env::var("WZ_SERVER").unwrap_or_else(|_| "http://localhost:8008".into())
}

/// A fresh store directory for one device of an example
pub fn store(example: &str, device: &str) -> StoreConfig {
    let dir = std::env::temp_dir().join(format!(
        "wizardchat-{example}-{}-{device}",
        std::process::id()
    ));
    StoreConfig {
        location: dir.to_string_lossy().into_owned(),
        passphrase: Some(format!("{example}-test")),
        exclude_insecure_devices: false,
        manual_encryption_setup: false,
        process_name: None,
    }
}

/// A throwaway account; the password only lives in memory for signing in more devices
pub struct Account {
    pub username: String,
    pub password: String,
}

/// Registers a new account and returns its first device
pub async fn register(
    example: &str,
    device: &str,
) -> Result<(WizardClient, Session, Account), BoxError> {
    register_in(example, device, store(example, device)).await
}

/// Like `register`, with a store of the caller's choosing
pub async fn register_in(
    example: &str,
    device: &str,
    store: StoreConfig,
) -> Result<(WizardClient, Session, Account), BoxError> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let account = Account {
        username: format!("wz{example}{device}{stamp}").to_lowercase(),
        password: format!("pw-{stamp:x}-{}", std::process::id()),
    };
    let (client, session) = WizardClient::register(
        &server(),
        &account.username,
        &account.password,
        &format!("{example} test {device}"),
        None,
        store,
    )
    .await?;
    Ok((client, session, account))
}

/// Signs another device in to an account from `register`
pub async fn sign_in(
    example: &str,
    device: &str,
    account: &Account,
) -> Result<(WizardClient, Session), BoxError> {
    Ok(WizardClient::login_password(
        &server(),
        &account.username,
        &account.password,
        &format!("{example} test {device}"),
        store(example, device),
    )
    .await?)
}
