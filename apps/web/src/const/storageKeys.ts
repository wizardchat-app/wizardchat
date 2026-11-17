// Auth / session
export const STORAGE_KEY_CREDENTIALS = 'mx_credentials';
export const STORAGE_KEY_ACCOUNTS = 'wz_accounts';
export const STORAGE_KEY_ACTIVE_ACCOUNT = 'wz_active_account';
export const STORAGE_KEY_DEVICE_ID_PREFIX = 'wz_device_id_';
export const STORAGE_KEY_ACCOUNT_PROFILE = 'wz_account_profile';

export const STORAGE_KEY_SSO_HOMESERVER_URL = 'wz_sso_hs_url';
export const STORAGE_KEY_SSO_STATE = 'wz_sso_state';
export const STORAGE_KEY_SSO_IDP_ID = 'wz_sso_idp_id';
export const STORAGE_KEY_SSO_ACTION = 'wz_sso_action';

export const STORAGE_KEY_OIDC_CLIENT_ID_PREFIX = 'wz_oidc_client_id_';
export const STORAGE_KEY_OIDC_PENDING = 'wz_oidc_pending';

// Settings
export const STORAGE_KEY_THEME = 'wz_theme';
export const STORAGE_KEY_MESSAGE_LAYOUT = 'wz_message_layout';
export const STORAGE_KEY_PREFERENCES = 'wz_preferences';
export const STORAGE_KEY_KEYBINDS = 'wz_keybinds';
export const STORAGE_KEY_LANGUAGE = 'wz_language';

// Audio / video
export const STORAGE_KEY_MIC_MUTED = 'wz_mic_muted';
export const STORAGE_KEY_DEAFENED = 'wz_deafened';

// UI state
export const STORAGE_KEY_SIDEBAR_VIEW = 'wz_sidebar_view';
export const STORAGE_KEY_CURRENT_SPACE = 'wz_current_space';
export const STORAGE_KEY_LAST_ROOMS = 'wz_last_rooms';
export const STORAGE_KEY_MEMBERS_PANEL = 'wz_members_panel';
export const STORAGE_KEY_CLOSED_NAV_CATEGORIES = 'wz_closed_nav_categories';
export const STORAGE_KEY_OPEN_LOBBY_CATEGORIES = 'wz_open_lobby_categories';
export const STORAGE_KEY_PINNED_SUBSPACES = 'wz_pinned_subspaces';

// Features
export const STORAGE_KEY_RECENT_INVITES = 'wz_recent_invites';
export const STORAGE_KEY_EMOJI_FREQUENCY = 'wz_emoji_frequency';
export const STORAGE_KEY_THREAD_LAST_SEEN = 'wz_thread_last_seen';
export const STORAGE_KEY_HIDDEN_MEDIA = 'wz_hidden_media';
export const STORAGE_KEY_THREAD_PANEL_WIDTH = 'wz_thread_panel_width';
export const STORAGE_KEY_GIF_FAVOURITES = 'wz_gif_favourites';
export const STORAGE_KEY_GIF_SEARCH_CONSENT = 'wz_gif_search_consent';
export const STORAGE_KEY_YOUTUBE_CONSENT = 'wz_youtube_consent';
export const STORAGE_KEY_CALL_RTC_OVERRIDE = 'wz_call_rtc_override';

// Developer
export const STORAGE_KEY_DEVELOPER_MODE = 'wz_developer_mode';
export const STORAGE_KEY_CALL_USER_AUDIO = 'wz_call_user_audio';

// Chosen microphone / speaker / camera
export const STORAGE_KEY_CALL_DEVICES = 'wz_call_devices';
export const STORAGE_KEY_CALL_VOLUMES = 'wz_call_volumes';
export const STORAGE_KEY_NOISE_FILTER = 'wz_noise_filter';
export const STORAGE_KEY_SHARE_SCREEN_AUDIO = 'wz_share_screen_audio';

// Device ID whose session verification was skipped on purpose
export const STORAGE_KEY_VERIFY_SKIPPED_DEVICE = 'wz_verify_skipped_device';

// Newest What's new version this account has seen on this device
export const STORAGE_KEY_WHATS_NEW_SEEN = 'wz_whats_new_seen';

// matrix.to target opened via /to#/..., kept across sign-in until the client is ready
export const STORAGE_KEY_PENDING_LINK = 'wz_pending_link';
