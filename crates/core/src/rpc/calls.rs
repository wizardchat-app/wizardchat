//! `CallSession`: this device's membership in a room's call

use super::{Listener, Subscription};
use crate::{CallEvent, CallSession, MediaState, SfuConfig};

rpc_methods! {
    CallSession(this: CallSession) {
        prop fn roomId() -> String {
            Ok(this.room_id())
        }

        /// The LiveKit service this device publishes to
        prop fn serviceUrl() -> String {
            Ok(this.service_url().to_owned())
        }

        prop fn identity() -> String {
            Ok(this.identity().to_owned())
        }

        prop fn logId() -> String {
            Ok(this.log_id().to_owned())
        }

        /// Whether joining rang the others: show "calling..." until someone answers
        prop fn rang() -> bool {
            Ok(this.rang())
        }

        /// A token for a LiveKit service in this call; the publisher's hands the delayed leave to the call server.
        call fn sfuConfig(service_url: String, publisher: bool) -> SfuConfig {
            this.sfu_config(&service_url, publisher).await
        }

        /// Whether media must be end-to-end encrypted
        call fn encrypted() -> bool {
            Ok(this.encrypted().await)
        }

        /// Keeps the membership and media keys going, reporting to `listener` until left.
        watch fn run(listener: Listener<CallEvent>) -> Subscription {
            Ok(listener.clone().watch(async move { this.run(|event| listener.emit(&event)).await }))
        }

        call fn reportMedia(state: MediaState, reason: Option<String>) -> bool {
            Ok(this.report_media(state, reason))
        }

        call fn log(event: String, detail: String) -> () {
            this.log(&event, detail);
            Ok(())
        }

        call fn leave() -> () {
            this.leave().await
        }

        call fn sendReaction(emoji: String, name: String) -> () {
            this.send_reaction(&emoji, &name).await
        }

        /// Rings the others again; false when someone already joined.
        call fn ringAgain() -> bool {
            this.ring_again().await
        }

        call fn setHandRaised(raised: bool) -> () {
            this.set_hand_raised(raised).await
        }
    }
}
