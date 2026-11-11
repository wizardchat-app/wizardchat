//! The newest OAuth tokens, kept next to the store so every process using it (the app and its
//! notification extension) can read what another one just refreshed to. The server rotates the
//! refresh token on every refresh and ends the session when an old one is used again.

use std::{fs, path::PathBuf};

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use matrix_sdk::authentication::SessionTokens;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::StoreConfig;

const FILE_NAME: &str = "session-tokens.bin";
const NONCE_LEN: usize = 12;

#[derive(Serialize, Deserialize)]
struct Stored {
    access_token: String,
    refresh_token: Option<String>,
}

pub(crate) struct TokenFile {
    path: PathBuf,
    cipher: ChaCha20Poly1305,
}

impl TokenFile {
    pub(crate) fn new(store: &StoreConfig) -> Option<Self> {
        let passphrase = store.passphrase.as_deref()?;
        let key = Sha256::digest(passphrase.as_bytes());
        let cipher = ChaCha20Poly1305::new_from_slice(&key).ok()?;
        Some(Self {
            path: PathBuf::from(&store.location).join(FILE_NAME),
            cipher,
        })
    }

    pub(crate) fn read(&self) -> Option<SessionTokens> {
        let bytes = fs::read(&self.path).ok()?;
        if bytes.len() <= NONCE_LEN {
            return None;
        }
        let (nonce, ciphertext) = bytes.split_at(NONCE_LEN);
        let plain = self
            .cipher
            .decrypt(&Nonce::try_from(nonce).ok()?, ciphertext)
            .ok()?;
        let stored: Stored = serde_json::from_slice(&plain).ok()?;
        Some(SessionTokens {
            access_token: stored.access_token,
            refresh_token: stored.refresh_token,
        })
    }

    pub(crate) fn write(&self, tokens: &SessionTokens) -> std::io::Result<()> {
        let plain = serde_json::to_vec(&Stored {
            access_token: tokens.access_token.clone(),
            refresh_token: tokens.refresh_token.clone(),
        })?;
        let mut nonce = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce).map_err(std::io::Error::other)?;
        let ciphertext = self
            .cipher
            .encrypt(&Nonce::from(nonce), plain.as_slice())
            .map_err(|_| std::io::Error::other("couldn't encrypt the tokens"))?;
        let mut bytes = nonce.to_vec();
        bytes.extend_from_slice(&ciphertext);
        let temp = self.path.with_extension("tmp");
        fs::write(&temp, bytes)?;
        fs::rename(&temp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(dir: &std::path::Path, passphrase: &str) -> StoreConfig {
        StoreConfig {
            location: dir.to_string_lossy().into_owned(),
            passphrase: Some(passphrase.to_owned()),
            exclude_insecure_devices: false,
            manual_encryption_setup: false,
            process_name: None,
        }
    }

    #[test]
    fn round_trips_and_needs_the_passphrase() {
        let dir = std::env::temp_dir().join(format!("wz-token-file-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = TokenFile::new(&store(&dir, "secret")).unwrap();
        assert!(file.read().is_none());
        file.write(&SessionTokens {
            access_token: "access".into(),
            refresh_token: Some("refresh".into()),
        })
        .unwrap();
        let read = file.read().unwrap();
        assert_eq!(read.access_token, "access");
        assert_eq!(read.refresh_token.as_deref(), Some("refresh"));
        assert!(TokenFile::new(&store(&dir, "other"))
            .unwrap()
            .read()
            .is_none());
        fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(test)]
mod live {
    use super::*;
    use crate::WizardClient;

    fn test_store(dir: &std::path::Path) -> StoreConfig {
        StoreConfig {
            location: dir.to_string_lossy().into_owned(),
            passphrase: Some("test-passphrase".to_owned()),
            exclude_insecure_devices: false,
            manual_encryption_setup: true,
            process_name: None,
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn stale_session_picks_up_the_newest_tokens() {
        let server =
            std::env::var("WZ_TEST_SERVER").unwrap_or_else(|_| "http://localhost:8008".into());
        let user = std::env::var("WZ_TEST_USER").expect("WZ_TEST_USER");
        let pass = std::env::var("WZ_TEST_PASS").expect("WZ_TEST_PASS");
        let dir = std::env::temp_dir().join(format!("wz-stale-session-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();

        let (first, saved) =
            WizardClient::login_password(&server, &user, &pass, "stale-test", test_store(&dir))
                .await
                .unwrap();
        assert!(
            saved.refresh_token.is_some(),
            "the server didn't hand out a refresh token"
        );
        drop(first);

        let app = WizardClient::restore(saved.clone(), test_store(&dir))
            .await
            .unwrap();
        app.sdk().refresh_access_token().await.unwrap();
        app.sdk().whoami().await.unwrap();
        app.sdk().refresh_access_token().await.unwrap();
        app.sdk().whoami().await.unwrap();
        drop(app);

        let restarted = WizardClient::restore(saved.clone(), test_store(&dir))
            .await
            .unwrap();
        restarted
            .sdk()
            .whoami()
            .await
            .expect("the restored session should still work");
        restarted
            .sdk()
            .refresh_access_token()
            .await
            .expect("refreshing should still work");
        restarted.sdk().whoami().await.unwrap();
        drop(restarted);

        fs::remove_file(dir.join(FILE_NAME)).unwrap();
        let without = WizardClient::restore(saved, test_store(&dir))
            .await
            .unwrap();
        assert!(
            without.sdk().refresh_access_token().await.is_err(),
            "the rotated-out refresh token should have been rejected"
        );
        fs::remove_dir_all(&dir).ok();
    }
}
