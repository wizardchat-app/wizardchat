//! The one way apps talk to the core: `Rpc::call("Class.method", this, args, blobs)` plus a single
//! event sink. Every transport (wasm, Tauri, native mobile) only carries these calls, and the
//! TypeScript API is generated from the same method declarations (`rpc_methods!`).
//!
//! - Objects apps hold (clients, timelines, verification flows, ...) live here and are referred to
//!   by handle; results that contain one register it ([`Handle`]).
//! - Listeners are ids the app picks; events for them go through the sink ([`Listener`]).
//! - Binary data travels beside the JSON as blobs, referenced as `{"$bytes": index}` ([`Bytes`]).

#[macro_use]
mod macros;
mod objects;
#[cfg(feature = "typegen")]
pub mod typegen;
pub mod types;

mod calls;
mod client;
mod client_account;
mod client_extras;
mod client_rooms;
mod client_security;
mod login;
mod timeline;
mod verification;

use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    future::Future,
    marker::PhantomData,
    ops::Deref,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use futures_util::future::{abortable, AbortHandle};
use matrix_sdk::{executor::spawn, SendOutsideWasm};
use serde::{de::DeserializeOwned, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{json, Value};

pub use objects::{PendingLoginCell, RoomList};

use crate::Error;

/// Shared between threads on native targets; wasm is single-threaded
#[cfg(not(target_arch = "wasm32"))]
pub trait Shared: std::any::Any + Send + Sync {}
#[cfg(not(target_arch = "wasm32"))]
impl<T: std::any::Any + Send + Sync> Shared for T {}
#[cfg(target_arch = "wasm32")]
pub trait Shared: std::any::Any {}
#[cfg(target_arch = "wasm32")]
impl<T: std::any::Any> Shared for T {}

#[cfg(not(target_arch = "wasm32"))]
type AnyObject = Arc<dyn std::any::Any + Send + Sync>;
#[cfg(target_arch = "wasm32")]
type AnyObject = Arc<dyn std::any::Any>;

#[cfg(not(target_arch = "wasm32"))]
fn downcast<T: Shared>(object: AnyObject) -> Option<Arc<T>> {
    object.downcast::<T>().ok()
}

// std only downcasts `Arc<dyn Any + Send + Sync>`
#[cfg(target_arch = "wasm32")]
fn downcast<T: Shared>(object: AnyObject) -> Option<Arc<T>> {
    if !(*object).is::<T>() {
        return None;
    }
    // SAFETY: the object is a `T`, so the allocation is an `ArcInner<T>`
    Some(unsafe { Arc::from_raw(Arc::into_raw(object).cast::<T>()) })
}

#[cfg(not(target_arch = "wasm32"))]
type Sink = Box<dyn Fn(u64, String) + Send + Sync>;
#[cfg(target_arch = "wasm32")]
type Sink = Box<dyn Fn(u64, String)>;

/// An object apps hold by handle. `props` are the values of its synchronous getters, sent along
/// with the handle so the app can answer them without a round trip.
pub trait RpcObject: Shared {
    const CLASS: &'static str;
    fn props(&self) -> Value {
        json!({})
    }
}

/// What a failed call rejects with: the same `{ code, message, errcode? }` everywhere
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errcode: Option<String>,
}

impl RpcError {
    pub fn invalid(message: impl Into<String>) -> Self {
        RpcError {
            code: "sdk",
            message: message.into(),
            errcode: None,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"code":"sdk","message":"?"}"#.into())
    }
}

impl From<Error> for RpcError {
    fn from(error: Error) -> Self {
        let code = match &error {
            Error::Homeserver(_) => "homeserver",
            Error::WellKnownInvalid => "wellKnownInvalid",
            Error::InvalidCredentials => "invalidCredentials",
            Error::NotSignedIn => "notSignedIn",
            Error::SyncNotStarted => "syncNotStarted",
            Error::UnknownRoom(_) => "unknownRoom",
            Error::InvalidId(_) => "invalidId",
            Error::PasswordRequired => "passwordRequired",
            Error::Call(_) => "call",
            Error::InvalidSound(_) => "invalidSound",
            Error::Matrix { .. } => "matrix",
            Error::WrongRecoveryKey => "wrongRecoveryKey",
            Error::Sdk(_) => "sdk",
        };
        let errcode = match &error {
            Error::Matrix { errcode, .. } => Some(errcode.clone()),
            _ => None,
        };
        RpcError {
            code,
            message: error.to_string(),
            errcode,
        }
    }
}

/// A call's result: JSON, with any binary data beside it
#[derive(Debug, Default)]
pub struct Reply {
    pub json: String,
    pub blobs: Vec<Vec<u8>>,
}

struct Task {
    abort: AbortHandle,
    control: Option<AnyObject>,
}

struct Inner {
    objects: Mutex<HashMap<u64, AnyObject>>,
    tasks: Mutex<HashMap<u64, Task>>,
    cancelled: Mutex<HashSet<u64>>,
    next: AtomicU64,
    sink: Sink,
}

/// The core as one RPC endpoint. Cheap to clone.
#[derive(Clone)]
pub struct Rpc(Arc<Inner>);

impl Rpc {
    /// `sink(listener, json)` receives every event
    #[cfg(not(target_arch = "wasm32"))]
    pub fn new(sink: impl Fn(u64, String) + Send + Sync + 'static) -> Self {
        Self::with_sink(Box::new(sink))
    }

    /// `sink(listener, json)` receives every event
    #[cfg(target_arch = "wasm32")]
    pub fn new(sink: impl Fn(u64, String) + 'static) -> Self {
        Self::with_sink(Box::new(sink))
    }

    fn with_sink(sink: Sink) -> Self {
        Rpc(Arc::new(Inner {
            objects: Mutex::default(),
            tasks: Mutex::default(),
            cancelled: Mutex::default(),
            next: AtomicU64::new(1),
            sink,
        }))
    }

    /// Runs `"Class.method"` on `this` (a handle; none for static methods) with positional `args`.
    pub async fn call(
        &self,
        method: &str,
        this: Option<u64>,
        args: Vec<Value>,
        blobs: Vec<Vec<u8>>,
    ) -> Result<Reply, RpcError> {
        let Some((class, name)) = method.split_once('.') else {
            return Err(RpcError::invalid(format!("unknown method {method}")));
        };
        let mut call = Call {
            rpc: self.clone(),
            this,
            args,
            blobs: blobs.into_iter().map(Some).collect(),
        };
        route(&mut call, class, name)
            .await
            .unwrap_or_else(|| Err(RpcError::invalid(format!("unknown method {method}"))))
    }

    /// The app dropped its handle to an object
    pub fn release(&self, handle: u64) {
        self.0.objects.lock().unwrap().remove(&handle);
    }

    /// Stops a subscription (or remembers to, if it hasn't started yet)
    pub fn cancel(&self, listener: u64) {
        match self.0.tasks.lock().unwrap().remove(&listener) {
            Some(task) => task.abort.abort(),
            None => {
                self.0.cancelled.lock().unwrap().insert(listener);
            }
        }
    }

    /// Drops every object and subscription (the app reloaded)
    pub fn reset(&self) {
        let objects: Vec<AnyObject> = self
            .0
            .objects
            .lock()
            .unwrap()
            .drain()
            .map(|(_, o)| o)
            .collect();
        for task in self.0.tasks.lock().unwrap().drain().map(|(_, t)| t) {
            task.abort.abort();
        }
        self.0.cancelled.lock().unwrap().clear();
        for object in objects {
            if let Some(client) = downcast::<crate::WizardClient>(object) {
                spawn(async move { client.stop_sync().await });
            }
        }
    }

    fn register(&self, object: AnyObject) -> u64 {
        let handle = self.0.next.fetch_add(1, Ordering::Relaxed);
        self.0.objects.lock().unwrap().insert(handle, object);
        handle
    }

    fn object<T: RpcObject>(&self, handle: u64) -> Result<Arc<T>, RpcError> {
        let object = self.0.objects.lock().unwrap().get(&handle).cloned();
        object
            .and_then(downcast::<T>)
            .ok_or_else(|| RpcError::invalid(format!("this {} was released", T::CLASS)))
    }

    fn start(
        &self,
        listener: u64,
        future: impl Future<Output = ()> + SendOutsideWasm + 'static,
        control: Option<AnyObject>,
    ) {
        let (future, abort) = abortable(future);
        if self.0.cancelled.lock().unwrap().remove(&listener) {
            return;
        }
        self.0
            .tasks
            .lock()
            .unwrap()
            .insert(listener, Task { abort, control });
        let rpc = self.clone();
        spawn(async move {
            if future.await.is_ok() {
                rpc.0.tasks.lock().unwrap().remove(&listener);
            }
        });
    }

    fn control<T: Shared>(&self, listener: u64) -> Option<Arc<T>> {
        let control = self
            .0
            .tasks
            .lock()
            .unwrap()
            .get(&listener)?
            .control
            .clone()?;
        downcast::<T>(control)
    }

    fn emit(&self, listener: u64, value: &impl Serialize) {
        match encode(self, value) {
            Ok(reply) => (self.0.sink)(listener, reply.json),
            Err(error) => {
                tracing::error!("event for listener {listener} didn't serialize: {error:?}")
            }
        }
    }
}

// Deserializing arguments and serializing results needs the call's Rpc (handles, listeners)
// and blobs; serde has no way to pass them, so they sit here for the duration.
struct Context {
    rpc: Rpc,
    incoming: Vec<Option<Vec<u8>>>,
    outgoing: Vec<Vec<u8>>,
}

thread_local! {
    static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) };
}

fn with_context<R>(context: Context, f: impl FnOnce() -> R) -> (R, Context) {
    let previous = CONTEXT.with(|c| c.borrow_mut().replace(context));
    let result = f();
    let context = CONTEXT
        .with(|c| std::mem::replace(&mut *c.borrow_mut(), previous))
        .expect("context");
    (result, context)
}

fn in_context<R>(f: impl FnOnce(&mut Context) -> R) -> Option<R> {
    CONTEXT.with(|c| c.borrow_mut().as_mut().map(f))
}

fn encode(rpc: &Rpc, value: &impl Serialize) -> Result<Reply, RpcError> {
    let context = Context {
        rpc: rpc.clone(),
        incoming: Vec::new(),
        outgoing: Vec::new(),
    };
    let (json, context) = with_context(context, || serde_json::to_string(value));
    Ok(Reply {
        json: json.map_err(|e| RpcError::invalid(format!("result didn't serialize: {e}")))?,
        blobs: context.outgoing,
    })
}

/// One call in progress, as the generated method arms see it
pub struct Call {
    rpc: Rpc,
    this: Option<u64>,
    args: Vec<Value>,
    blobs: Vec<Option<Vec<u8>>>,
}

/// Positional arguments being decoded
pub struct Args<'a> {
    args: &'a mut Vec<Value>,
    index: usize,
}

impl Args<'_> {
    pub fn take<T: DeserializeOwned>(&mut self) -> Result<T, RpcError> {
        let index = self.index;
        self.index += 1;
        let value = self
            .args
            .get_mut(index)
            .map(Value::take)
            .unwrap_or(Value::Null);
        serde_json::from_value(value)
            .map_err(|e| RpcError::invalid(format!("invalid argument {}: {e}", index + 1)))
    }
}

impl Call {
    pub fn this<T: RpcObject>(&self) -> Result<Arc<T>, RpcError> {
        let handle = self
            .this
            .ok_or_else(|| RpcError::invalid(format!("no {} given", T::CLASS)))?;
        self.rpc.object(handle)
    }

    pub fn args<R>(
        &mut self,
        decode: impl FnOnce(&mut Args) -> Result<R, RpcError>,
    ) -> Result<R, RpcError> {
        let context = Context {
            rpc: self.rpc.clone(),
            incoming: std::mem::take(&mut self.blobs),
            outgoing: Vec::new(),
        };
        let mut args = std::mem::take(&mut self.args);
        let (result, _) = with_context(context, || {
            decode(&mut Args {
                args: &mut args,
                index: 0,
            })
        });
        result
    }

    pub fn reply(&self, value: crate::Result<impl Serialize>) -> Result<Reply, RpcError> {
        encode(&self.rpc, &value?)
    }
}

/// Pins down a method body's result type for `?`
pub fn typed<T, F: Future<Output = crate::Result<T>>>(future: F) -> F {
    future
}

pub fn typed_sync<T>(f: impl FnOnce() -> crate::Result<T>) -> crate::Result<T> {
    f()
}

/// A callback in the app: events for it go through the sink with its id
pub struct Listener<T> {
    rpc: Rpc,
    id: u64,
    _payload: PhantomData<fn(T)>,
}

impl<T> Clone for Listener<T> {
    fn clone(&self) -> Self {
        Listener {
            rpc: self.rpc.clone(),
            id: self.id,
            _payload: PhantomData,
        }
    }
}

impl<T: Serialize> Listener<T> {
    pub fn emit(&self, value: &T) {
        self.rpc.emit(self.id, value);
    }

    /// Runs `future` until it ends or the app cancels the subscription
    pub fn watch(
        self,
        future: impl Future<Output = ()> + SendOutsideWasm + 'static,
    ) -> Subscription {
        self.rpc.start(self.id, future, None);
        Subscription
    }

    /// Like `watch`, for the room list: `RoomListSubscription.setFilter` sends to `filters`
    pub fn watch_room_list(
        self,
        future: impl Future<Output = ()> + SendOutsideWasm + 'static,
        filters: RoomList,
    ) -> RoomListSubscription {
        self.rpc.start(self.id, future, Some(Arc::new(filters)));
        RoomListSubscription
    }

    pub fn id(&self) -> u64 {
        self.id
    }
}

impl<'de, T> Deserialize<'de> for Listener<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let id = u64::deserialize(deserializer)?;
        let rpc = in_context(|c| c.rpc.clone())
            .ok_or_else(|| serde::de::Error::custom("listener outside a call"))?;
        Ok(Listener {
            rpc,
            id,
            _payload: PhantomData,
        })
    }
}

/// What a `watch` method returns; the app's object for it is keyed by the listener
#[derive(Serialize)]
pub struct Subscription;

/// A subscription that also takes room filters (`RoomListSubscription.setFilter`)
#[derive(Serialize)]
pub struct RoomListSubscription;

/// Binary data, carried beside the JSON
#[derive(Debug, Clone, Default)]
pub struct Bytes(pub Vec<u8>);

impl Deref for Bytes {
    type Target = Vec<u8>;
    fn deref(&self) -> &Vec<u8> {
        &self.0
    }
}

impl From<Bytes> for Vec<u8> {
    fn from(bytes: Bytes) -> Self {
        bytes.0
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Wire {
            Blob {
                #[serde(rename = "$bytes")]
                index: usize,
            },
            Inline(Vec<u8>),
        }
        match Wire::deserialize(deserializer)? {
            Wire::Inline(bytes) => Ok(Bytes(bytes)),
            Wire::Blob { index } => {
                in_context(|c| c.incoming.get_mut(index).and_then(Option::take))
                    .flatten()
                    .map(Bytes)
                    .ok_or_else(|| serde::de::Error::custom(format!("missing blob {index}")))
            }
        }
    }
}

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match in_context(|c| {
            c.outgoing.push(self.0.clone());
            c.outgoing.len() - 1
        }) {
            Some(index) => json!({ "$bytes": index }).serialize(serializer),
            None => self.0.serialize(serializer),
        }
    }
}

/// An object passed in by handle
pub struct Obj<T>(Arc<T>);

impl<T> Deref for Obj<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.0
    }
}

impl<'de, T: RpcObject> Deserialize<'de> for Obj<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Wire {
            #[serde(rename = "$handle")]
            handle: u64,
        }
        let handle = Wire::deserialize(deserializer)?.handle;
        in_context(|c| c.rpc.object::<T>(handle))
            .ok_or_else(|| serde::de::Error::custom("object outside a call"))?
            .map(Obj)
            .map_err(|e| serde::de::Error::custom(e.message))
    }
}

/// An object handed to the app; serializing it registers it
pub struct Handle<T>(Arc<T>);

impl<T: RpcObject> Handle<T> {
    pub fn new(object: T) -> Self {
        Handle(Arc::new(object))
    }

    pub fn shared(object: Arc<T>) -> Self {
        Handle(object)
    }
}

impl<T: RpcObject> Serialize for Handle<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let object: AnyObject = self.0.clone();
        let handle = in_context(|c| c.rpc.register(object))
            .ok_or_else(|| serde::ser::Error::custom("handle outside a call"))?;
        json!({ "$handle": handle, "$class": T::CLASS, "props": self.0.props() })
            .serialize(serializer)
    }
}

/// The filters of a room list subscription, by listener
fn set_room_filter(rpc: &Rpc, listener: u64, filter: crate::RoomFilter) -> crate::Result<()> {
    let list = rpc
        .control::<RoomList>(listener)
        .ok_or_else(|| Error::Sdk("this room list was cancelled".into()))?;
    list.set_filter(filter);
    Ok(())
}

async fn route(call: &mut Call, class: &str, method: &str) -> Option<Result<Reply, RpcError>> {
    if class == "RoomListSubscription" && method == "setFilter" {
        let rpc = call.rpc.clone();
        return Some(
            call.args(|a| Ok((a.take::<u64>()?, a.take::<crate::RoomFilter>()?)))
                .and_then(|(listener, filter)| {
                    encode(&rpc, &set_room_filter(&rpc, listener, filter)?)
                }),
        );
    }
    macro_rules! modules {
        ($($($module:ident)::+),*) => {
            $(if let Some(reply) = $($module)::+::call(call, class, method).await {
                return Some(reply);
            })*
        };
    }
    modules!(
        client,
        client_account,
        client_rooms,
        client_extras,
        client_security,
        login,
        login::pending,
        login::qr,
        timeline,
        timeline::client,
        verification,
        calls
    );
    None
}

/// Every method, for the TypeScript generator
#[cfg(feature = "typegen")]
pub fn routes(types: &mut typegen::Types) -> Vec<typegen::Route> {
    [
        client::routes(types),
        client_account::routes(types),
        client_rooms::routes(types),
        client_extras::routes(types),
        client_security::routes(types),
        login::routes(types),
        login::pending::routes(types),
        login::qr::routes(types),
        timeline::routes(types),
        timeline::client::routes(types),
        verification::routes(types),
        calls::routes(types),
    ]
    .into_iter()
    .flatten()
    .collect()
}
