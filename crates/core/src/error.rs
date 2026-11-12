use matrix_sdk::ruma::api::error::ErrorKind;
use serde::Serialize;

/// Errors the core reports to apps. `code` is stable so UIs can show translated messages.
#[derive(Debug, thiserror::Error, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "code", content = "message", rename_all = "camelCase")]
pub enum Error {
    #[error("couldn't reach a homeserver: {0}")]
    Homeserver(String),
    /// The server's `.well-known/matrix/client` is broken or names an unreachable homeserver
    #[error("the server's .well-known configuration is invalid")]
    WellKnownInvalid,
    #[error("wrong username or password")]
    InvalidCredentials,
    #[error("not signed in")]
    NotSignedIn,
    #[error("sync hasn't been started")]
    SyncNotStarted,
    #[error("unknown room {0}")]
    UnknownRoom(String),
    #[error("invalid identifier: {0}")]
    InvalidId(String),
    #[error("the server needs the account password to confirm this")]
    PasswordRequired,
    #[error("call failed: {0}")]
    Call(String),
    /// The homeserver refused, with a Matrix error code like `M_FORBIDDEN` or `M_LIMIT_EXCEEDED`
    #[error("{message}")]
    Matrix { errcode: String, message: String },
    #[error("{0}")]
    InvalidSound(String),
    #[error("the recovery key or passphrase is wrong")]
    WrongRecoveryKey,
    #[error("{0}")]
    Sdk(String),
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// The homeserver's own explanation (its `error` field), as other clients show it
fn matrix_error(api: Option<&matrix_sdk::ruma::api::error::Error>, fallback: String) -> Error {
    use matrix_sdk::ruma::api::error::{ErrorBody, StandardErrorBody};
    match api.map(|e| &e.body) {
        Some(ErrorBody::Standard(StandardErrorBody { kind, message, .. })) => {
            let errcode = kind.errcode().to_string();
            Error::Matrix {
                message: if message.trim().is_empty() {
                    errcode.clone()
                } else {
                    message.clone()
                },
                errcode,
            }
        }
        _ => Error::Sdk(fallback),
    }
}

impl From<matrix_sdk::Error> for Error {
    fn from(error: matrix_sdk::Error) -> Self {
        matrix_error(error.as_client_api_error(), error.to_string())
    }
}

impl Error {
    /// A refused sign-in means wrong credentials
    pub(crate) fn from_login(error: matrix_sdk::Error) -> Self {
        if matches!(error.client_api_error_kind(), Some(ErrorKind::Forbidden)) {
            Error::InvalidCredentials
        } else {
            error.into()
        }
    }
}

impl From<matrix_sdk::ClientBuildError> for Error {
    fn from(error: matrix_sdk::ClientBuildError) -> Self {
        Error::Homeserver(error.to_string())
    }
}

impl From<matrix_sdk::HttpError> for Error {
    fn from(error: matrix_sdk::HttpError) -> Self {
        matrix_error(error.as_client_api_error(), error.to_string())
    }
}

impl From<matrix_sdk_ui::timeline::Error> for Error {
    fn from(error: matrix_sdk_ui::timeline::Error) -> Self {
        Error::Sdk(error.to_string())
    }
}

impl From<matrix_sdk_ui::room_list_service::Error> for Error {
    fn from(error: matrix_sdk_ui::room_list_service::Error) -> Self {
        Error::Sdk(error.to_string())
    }
}

impl From<matrix_sdk_ui::sync_service::Error> for Error {
    fn from(error: matrix_sdk_ui::sync_service::Error) -> Self {
        Error::Sdk(error.to_string())
    }
}

impl From<matrix_sdk::encryption::recovery::RecoveryError> for Error {
    fn from(error: matrix_sdk::encryption::recovery::RecoveryError) -> Self {
        use matrix_sdk::encryption::{recovery::RecoveryError, secret_storage::SecretStorageError};
        match error {
            RecoveryError::SecretStorage(SecretStorageError::SecretStorageKey(_)) => {
                Error::WrongRecoveryKey
            }
            RecoveryError::Sdk(error) => error.into(),
            other => Error::Sdk(other.to_string()),
        }
    }
}
