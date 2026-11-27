//! Types that only exist to give the generated APIs a precise name

/// A newtype that reads and writes as its inner value. In TypeScript it's a named type `$ts`,
/// in Swift a typealias of `$swift`.
macro_rules! ts_type {
    ($(#[doc = $doc:literal])* $name:ident($inner:ty) = $ts:literal, $swift:literal) => {
        $(#[doc = $doc])*
        #[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub $inner);

        #[cfg(feature = "typegen")]
        impl specta::Type for $name {
            fn definition(_: &mut specta::Types) -> specta::datatype::DataType {
                super::typegen::Native::Alias {
                    name: stringify!($name),
                    docs: concat!($($doc, "\n"),*),
                    ts: $ts,
                    swift: $swift,
                }
                .into()
            }
        }
    };
}

ts_type!(
    /// Who may join a room
    JoinRule(String) = "'invite' | 'public' | 'knock' | 'restricted' | 'knock_restricted'",
    "String"
);

ts_type!(
    /// Who may read a room's history
    HistoryVisibility(String) = "'world_readable' | 'shared' | 'invited' | 'joined'",
    "String"
);

ts_type!(
    /// Why a message couldn't be decrypted
    UtdReason(String) = "'unknown' | 'sentBeforeWeJoined' | 'verificationViolation' | 'unsignedDevice' | 'unknownDevice' | 'historicalMessageAndBackupIsDisabled' | 'withheldForUnverifiedOrInsecureDevice' | 'withheldBySender' | 'historicalMessageAndDeviceIsUnverified'", "String"
);

ts_type!(
    /// Where media lives: a plain `mxc://` URL, or an encrypted file
    MediaSource(serde_json::Value) = "{ url: string } | { file: unknown }",
    "JSONValue"
);
