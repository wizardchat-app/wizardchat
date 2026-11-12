use matrix_sdk::{
    media::{MediaFormat, MediaRequestParameters},
    ruma::{events::room::MediaSource, OwnedMxcUri},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{Error, Result, WizardClient};

const DEFAULTS_EVENT: &str = "org.wizardchat.soundboard_defaults";
const HASH_KEY: &str = "org.wizardchat.hash";
pub(crate) const MAX_SOUND_BYTES: usize = 1024 * 1024;

struct BuiltIn {
    shortcode: &'static str,
    body: &'static str,
    duration_ms: u32,
    data: &'static [u8],
    source: (&'static str, &'static str, &'static str),
}

macro_rules! built_in {
    ($shortcode:literal, $body:literal, $duration_ms:literal, $source:expr) => {
        BuiltIn {
            shortcode: $shortcode,
            body: $body,
            duration_ms: $duration_ms,
            source: $source,
            data: include_bytes!(concat!(
                "../../../packages/sounds/soundboard/",
                $shortcode,
                ".mp3"
            )),
        }
    };
}

const BUILT_IN: [BuiltIn; 8] = [
    built_in!(
        "applause",
        "Applause",
        3400,
        (
            "Crowd.Yay.Applause.25ppl.Short.wav",
            "jessepash",
            "https://freesound.org/people/jessepash/sounds/139972/"
        )
    ),
    built_in!(
        "laugh",
        "Laughter",
        3600,
        (
            "Sitcom Laughter with Applause, Small Audience",
            "Kinoton",
            "https://freesound.org/people/Kinoton/sounds/371562/"
        )
    ),
    built_in!(
        "rimshot",
        "Ba-dum-tss",
        3000,
        (
            "Baddum Tish - Comedy Rimshots",
            "OverlookHotelRecords",
            "https://freesound.org/people/OverlookHotelRecords/sounds/271208/"
        )
    ),
    built_in!(
        "drumroll",
        "Drum roll",
        1710,
        (
            "drum roll",
            "owowowwo",
            "https://freesound.org/people/owowowwo/sounds/197763/"
        )
    ),
    built_in!(
        "tada",
        "Ta-da",
        1720,
        (
            "Tada Fanfare A",
            "plasterbrain",
            "https://freesound.org/people/plasterbrain/sounds/397355/"
        )
    ),
    built_in!(
        "airhorn",
        "Air horn",
        1610,
        (
            "Airhorn",
            "jacksonacademyashmore",
            "https://freesound.org/people/jacksonacademyashmore/sounds/414208/"
        )
    ),
    built_in!(
        "crickets",
        "Crickets",
        3200,
        (
            "crickets",
            "FreethinkerAnon",
            "https://freesound.org/people/FreethinkerAnon/sounds/129678/"
        )
    ),
    built_in!(
        "sad_trombone",
        "Sad trombone",
        5060,
        (
            "wah wah sad trombone.wav",
            "kirbydx",
            "https://freesound.org/people/kirbydx/sounds/175409/"
        )
    ),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SoundboardSound {
    pub shortcode: String,
    pub url: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub emoji: Option<String>,
    #[serde(default)]
    pub mimetype: Option<String>,
    #[serde(default)]
    pub size: Option<u32>,
    #[serde(default)]
    pub duration_ms: Option<u32>,
}

fn built_in_emoji(shortcode: &str) -> &'static str {
    match shortcode {
        "applause" => "👏",
        "laugh" => "😂",
        "rimshot" => "🥁",
        "drumroll" => "🪘",
        "tada" => "🎉",
        "airhorn" => "📯",
        "crickets" => "🦗",
        _ => "🎺",
    }
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SoundCredit {
    pub title: String,
    pub author: String,
    pub url: String,
}

pub fn soundboard_credits() -> Vec<SoundCredit> {
    BUILT_IN
        .iter()
        .map(|sound| SoundCredit {
            title: sound.source.0.to_owned(),
            author: sound.source.1.to_owned(),
            url: sound.source.2.to_owned(),
        })
        .collect()
}

fn hash(data: &[u8]) -> String {
    let value = data.iter().fold(0xcbf29ce484222325u64, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x100000001b3)
    });
    format!("{value:016x}")
}

fn stored_url<'a>(sounds: &'a Map<String, Value>, sound: &BuiltIn) -> Option<&'a str> {
    let entry = sounds.get(sound.shortcode)?;
    if entry.get(HASH_KEY)?.as_str()? != hash(sound.data) {
        return None;
    }
    entry
        .get("url")?
        .as_str()
        .filter(|url| url.starts_with("mxc://"))
}

impl WizardClient {
    pub async fn soundboard_sounds(&self) -> Result<Vec<SoundboardSound>> {
        let mut content = match self.cached_account_data(DEFAULTS_EVENT).await? {
            Some(content) => Some(content),
            None => self.account_data(DEFAULTS_EVENT).await?,
        }
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
        let sounds = content
            .as_object_mut()
            .expect("checked above")
            .entry("sounds")
            .or_insert_with(|| json!({}));
        if !sounds.is_object() {
            *sounds = json!({});
        }
        let sounds = sounds.as_object_mut().expect("checked above");
        let mut changed = false;
        let mut result = Vec::with_capacity(BUILT_IN.len());
        for sound in &BUILT_IN {
            let url = match stored_url(sounds, sound) {
                Some(url) => url.to_owned(),
                None => {
                    let url = self.upload_media(sound.data.to_vec(), "audio/mpeg").await?;
                    sounds.insert(
                        sound.shortcode.to_owned(),
                        json!({
                            "url": url,
                            "body": sound.body,
                            "info": {
                                "mimetype": "audio/mpeg",
                                "size": sound.data.len(),
                                "duration": sound.duration_ms,
                            },
                            HASH_KEY: hash(sound.data),
                        }),
                    );
                    changed = true;
                    url
                }
            };
            result.push(SoundboardSound {
                shortcode: sound.shortcode.to_owned(),
                url,
                body: None,
                emoji: Some(built_in_emoji(sound.shortcode).to_owned()),
                mimetype: Some("audio/mpeg".to_owned()),
                size: u32::try_from(sound.data.len()).ok(),
                duration_ms: Some(sound.duration_ms),
            });
        }
        if changed {
            self.set_account_data(DEFAULTS_EVENT, content).await?;
        }
        Ok(result)
    }

    pub async fn soundboard_sound(&self, url: &str) -> Result<Vec<u8>> {
        if !url.starts_with("mxc://") {
            return Err(Error::InvalidId(format!("not an mxc URI: {url}")));
        }
        let uri: OwnedMxcUri = url.into();
        uri.validate()
            .map_err(|e| Error::InvalidId(format!("{url}: {e}")))?;
        if let Some(Value::Object(content)) = self.cached_account_data(DEFAULTS_EVENT).await? {
            if let Some(Value::Object(sounds)) = content.get("sounds") {
                let own = BUILT_IN
                    .iter()
                    .find(|sound| stored_url(sounds, sound) == Some(url));
                if let Some(sound) = own {
                    return Ok(sound.data.to_vec());
                }
            }
        }
        let request = MediaRequestParameters {
            source: MediaSource::Plain(uri),
            format: MediaFormat::File,
        };
        let data = self.sdk().media().get_media_content(&request, true).await?;
        if data.len() > MAX_SOUND_BYTES {
            return Err(Error::Call(format!(
                "sound too large: {} bytes",
                data.len()
            )));
        }
        Ok(data)
    }
}
