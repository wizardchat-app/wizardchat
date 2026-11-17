//! The core for the native apps: carries `Rpc` calls and events over UniFFI. The API itself is
//! generated from crates/core/src/rpc (`Api.gen.swift` on iOS, `Api.gen.kt` on Android).
#![recursion_limit = "256"]

use std::sync::{Arc, LazyLock};

use wizardchat_core::rpc::{Rpc, RpcError};

pub use wizardchat_denoise::{wz_denoise_free, wz_denoise_new, wz_denoise_process};

uniffi::setup_scaffolding!();

// The SDK spawns its sync and streams onto Tokio, which the app's threads don't run
static RUNTIME: LazyLock<tokio::runtime::Runtime> = LazyLock::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("wizardchat-core")
        .build()
        .expect("a Tokio runtime")
});

/// Debug builds log the SDK to stderr (the Xcode console); `WIZARDCHAT_LOG` takes a tracing filter
fn init_logging() {
    if cfg!(debug_assertions) {
        let filter = std::env::var("WIZARDCHAT_LOG")
            .unwrap_or_else(|_| "warn,matrix_sdk_crypto::verification=debug".into());
        let _ = tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::new(filter))
            .with_writer(std::io::stderr)
            .with_ansi(false)
            .try_init();
    }
}

#[uniffi::export(with_foreign)]
pub trait EventSink: Send + Sync {
    fn event(&self, listener: u64, json: String);
}

#[derive(uniffi::Record)]
pub struct Reply {
    pub json: String,
    pub blobs: Vec<Vec<u8>>,
}

/// A failed call: `json` is the core's `{ code, message, errcode? }`
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("{json}")]
    Call { json: String },
}

impl From<RpcError> for CoreError {
    fn from(error: RpcError) -> Self {
        CoreError::Call {
            json: error.to_json(),
        }
    }
}

#[derive(uniffi::Object)]
pub struct Core {
    rpc: Rpc,
}

#[uniffi::export]
impl Core {
    #[uniffi::constructor]
    pub fn new(sink: Arc<dyn EventSink>) -> Arc<Self> {
        init_logging();
        let _runtime = RUNTIME.enter();
        Arc::new(Core {
            rpc: Rpc::new(move |listener, json| sink.event(listener, json)),
        })
    }

    pub async fn call(
        &self,
        method: String,
        this: Option<u64>,
        args: String,
        blobs: Vec<Vec<u8>>,
    ) -> Result<Reply, CoreError> {
        let rpc = self.rpc.clone();
        RUNTIME
            .spawn(async move {
                let args = serde_json::from_str(&args)
                    .map_err(|e| RpcError::invalid(format!("arguments: {e}")))?;
                let reply = rpc.call(&method, this, args, blobs).await?;
                Ok(Reply {
                    json: reply.json,
                    blobs: reply.blobs,
                })
            })
            .await
            .map_err(|e| CoreError::from(RpcError::invalid(e.to_string())))?
    }

    pub fn release(&self, handle: u64) {
        self.rpc.release(handle);
    }

    pub fn cancel(&self, listener: u64) {
        self.rpc.cancel(listener);
    }

    pub fn reset(&self) {
        let _runtime = RUNTIME.enter();
        self.rpc.reset();
    }
}

/// Android: `CoreInit.init(context)` runs this once, before the first network request
#[cfg(target_os = "android")]
#[jni::jni_mangle("org.wizardchat.core.CoreInit")]
pub fn init<'caller>(
    mut env: jni::EnvUnowned<'caller>,
    _class: jni::objects::JClass<'caller>,
    context: jni::objects::JObject<'caller>,
) {
    env.with_env(|env| rustls_platform_verifier::android::init_with_env(env, context))
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>();
}
