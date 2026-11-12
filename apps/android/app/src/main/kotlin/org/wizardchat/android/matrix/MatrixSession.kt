package org.wizardchat.android.matrix

import android.net.ConnectivityManager
import android.net.Network
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.push.Push
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.AppInfo
import org.wizardchat.core.CustomStatus
import org.wizardchat.core.EncryptionStatus
import org.wizardchat.core.IdentityProvider
import org.wizardchat.core.PendingLogin
import org.wizardchat.core.Presence
import org.wizardchat.core.ServerInfo
import org.wizardchat.core.SessionEvent
import org.wizardchat.core.StoreConfig
import org.wizardchat.core.Subscription
import org.wizardchat.core.SyncState
import org.wizardchat.core.WizardClient
import org.wizardchat.core.WizardError

class MatrixSession(private val scope: CoroutineScope = MainScope()) {
    sealed interface State {
        data object Restoring : State
        data object LoggedOut : State
        data object LoggedIn : State
        data class RestoreFailed(val message: String) : State
    }

    var state by mutableStateOf<State>(State.Restoring)
        private set
    var userId by mutableStateOf<String?>(null)
        private set
    var displayName by mutableStateOf<String?>(null)
        private set
    var avatarUrl by mutableStateOf<String?>(null)
        private set
    var customStatus by mutableStateOf<CustomStatus?>(null)
        private set
    private var presenceVisible = true
    private var statusExpiry: Job? = null
    var accounts by mutableStateOf<List<Account>>(emptyList())
        private set
    var isAddingAccount by mutableStateOf(false)
    var syncState by mutableStateOf(SyncState.idle)
        private set
    var connectionLost by mutableStateOf(false)
        private set
    private var networkAvailable = true
    private var lostTimer: Job? = null
    var encryption by mutableStateOf<EncryptionStatus?>(null)
        private set
    var needsEncryptionSetup by mutableStateOf(false)
        private set
    var needsVerification by mutableStateOf(false)
        private set

    var client: WizardClient? = null
        private set
    var roomList by mutableStateOf<RoomListModel?>(null)
        private set
    var media: MediaLoader? = null
        private set

    private var stored: StoredSession? = null
    private var isRestoring = false
    private var subscriptions = listOf<Subscription>()
    private var pendingLogin: Triple<PendingLogin, String, StoreConfig>? = null

    data class Account(val userId: String, val displayName: String?, val avatarUrl: String?)

    val requireClient: WizardClient
        get() = client ?: throw WizardError("notSignedIn", L10n.format("common.somethingWentWrong"))

    suspend fun restore() {
        // The screen and a background refresh can both ask; only restore once
        if (client != null || isRestoring) {
            while (isRestoring) delay(100)
            return
        }
        isRestoring = true
        try {
            reloadAccounts()
            while (true) {
                val stored = SessionStore.active() ?: break
                try {
                    val client = SessionClients.restore(stored)
                    SessionStore.setActive(stored.session.userId)
                    start(client, stored)
                    return
                } catch (error: WizardError) {
                    // Only forget the account when the server says it's gone; anything else (offline,
                    // a bug) keeps it so the user isn't signed out
                    if (error.errcode != "M_UNKNOWN_TOKEN") {
                        state = State.RestoreFailed(error.message)
                        return
                    }
                    SessionStore.remove(stored.session.userId)
                    MessageNotifier.shared.removeDelivered(stored.session.userId)
                    reloadAccounts()
                }
            }
            state = State.LoggedOut
        } finally {
            isRestoring = false
        }
    }

    private fun reloadAccounts() {
        accounts = SessionStore.all().map { Account(it.session.userId, it.displayName, it.avatarUrl) }
    }

    suspend fun switchAccount(userId: String) {
        if (userId == this.userId || isRestoring || accounts.none { it.userId == userId }) return
        close()
        SessionStore.setActive(userId)
        state = State.Restoring
        restore()
    }

    suspend fun refreshAccountProfiles() {
        val client = client ?: return
        for (account in accounts) {
            if (account.userId == userId) continue
            val profile = runCatching { client.userProfile(account.userId) }.getOrNull() ?: continue
            SessionStore.updateProfile(account.userId, profile.displayName, profile.avatarUrl)
        }
        reloadAccounts()
    }

    fun setProfile(displayName: String?, avatarUrl: String?) {
        this.displayName = displayName
        this.avatarUrl = avatarUrl
        val stored = stored ?: return
        if (stored.displayName == displayName && stored.avatarUrl == avatarUrl) return
        val updated = stored.copy(displayName = displayName, avatarUrl = avatarUrl)
        this.stored = updated
        SessionStore.save(updated)
        reloadAccounts()
    }

    val excludesInsecureDevices: Boolean get() = stored?.excludeInsecureDevices ?: false

    fun setExcludeInsecureDevices(exclude: Boolean) {
        val updated = stored?.copy(excludeInsecureDevices = exclude) ?: return
        stored = updated
        SessionStore.save(updated)
    }

    suspend fun restart() {
        val userId = stored?.session?.userId ?: return
        close()
        SessionClients.remove(userId)
        state = State.Restoring
        restore()
    }

    suspend fun retryRestore() {
        state = State.Restoring
        restore()
    }

    suspend fun discover(server: String): ServerInfo = WizardClient.discover(server)

    suspend fun login(server: String, username: String, password: String) {
        val (folder, store) = StoredSession.newStore()
        try {
            val client = WizardClient.loginPassword(server, username, password, DEVICE_NAME, store)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    suspend fun register(server: String, username: String, password: String) {
        val (folder, store) = StoredSession.newStore()
        try {
            val client = WizardClient.register(server, username, password, DEVICE_NAME, null, store)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    /** The server's sign-in page to open in a browser tab; it redirects back to `REDIRECT_URI` */
    suspend fun startBrowserLogin(server: String, sso: IdentityProvider? = null, createAccount: Boolean = false): String {
        cancelBrowserLogin()
        val (folder, store) = StoredSession.newStore()
        try {
            val login = if (sso != null) {
                WizardClient.startSsoLogin(server, store, REDIRECT_URI, sso.id)
            } else {
                WizardClient.startOAuthLogin(server, store, REDIRECT_URI, APP, createAccount)
            }
            pendingLogin = Triple(login, folder, store)
            return login.url
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    val hasPendingBrowserLogin get() = pendingLogin != null

    suspend fun finishBrowserLogin(callbackUrl: String) {
        val (login, folder, store) = pendingLogin
            ?: throw WizardError("expired", L10n.format("auth.popupClosed"))
        pendingLogin = null
        try {
            val client = login.finish(callbackUrl, DEVICE_NAME)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    suspend fun cancelBrowserLogin() {
        val (login, folder) = pendingLogin ?: return
        pendingLogin = null
        runCatching { login.abort() }
        SessionStore.removeStore(folder)
    }

    /** Leaving the app: stop syncing so coming back starts a fresh connection. Calls keep syncing. */
    suspend fun pauseSync(keepRunning: Boolean) {
        val client = client ?: return
        if (keepRunning || syncState != SyncState.running) return
        runCatching { client.stopSync() }
    }

    suspend fun resumeSync() {
        val client = client ?: return
        if (syncState == SyncState.running) return
        runCatching { client.startSync() }
    }

    init {
        val manager = WizardApplication.instance.getSystemService(ConnectivityManager::class.java)
        networkAvailable = manager?.activeNetwork != null
        manager?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                scope.launch { networkChanged(true) }
            }

            override fun onLost(network: Network) {
                scope.launch { networkChanged(false) }
            }
        })
    }

    private fun networkChanged(available: Boolean) {
        val regained = available && !networkAvailable
        networkAvailable = available
        updateConnection()
        val client = client ?: return
        if (regained && (syncState == SyncState.error || syncState == SyncState.offline)) {
            scope.launch { runCatching { client.startSync() } }
        }
    }

    private fun updateConnection() {
        val loggedIn = state == State.LoggedIn
        val lost = loggedIn && (!networkAvailable || syncState in listOf(SyncState.offline, SyncState.error, SyncState.terminated))
        if (lost) {
            if (connectionLost || lostTimer != null) return
            lostTimer = scope.launch {
                delay(2000)
                connectionLost = true
                lostTimer = null
            }
        } else if (syncState == SyncState.running || !loggedIn) {
            lostTimer?.cancel()
            lostTimer = null
            connectionLost = false
        }
    }

    /** Sync stops on network errors; try again after a moment */
    private fun syncStateChanged(state: SyncState) {
        syncState = state
        updateConnection()
        val client = client ?: return
        if (state != SyncState.error && state != SyncState.offline) return
        if (!ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return
        scope.launch {
            delay(3000)
            if (syncState == SyncState.error || syncState == SyncState.offline) runCatching { client.startSync() }
        }
    }

    suspend fun logout() {
        runCatching { client?.logout() }
        stored?.let { forget(it) }
    }

    private var settingsSave: Job? = null
    private var unconfirmedSettings: Map<String, JsonElement> = emptyMap()

    /** The synced settings, with this device's changes the server hasn't sent back yet on top */
    suspend fun loadSyncedSettings(): Map<String, JsonElement>? {
        settingsSave?.join()
        val stored = storedSyncedSettings()
        if (stored != null && unconfirmedSettings.all { (key, value) -> stored[key] == value }) unconfirmedSettings = emptyMap()
        return if (unconfirmedSettings.isEmpty()) stored else (stored ?: emptyMap()) + unconfirmedSettings
    }

    private suspend fun storedSyncedSettings(): Map<String, JsonElement>? =
        runCatching { client?.accountData(AppPreferences.SYNCED_ACCOUNT_DATA_TYPE) as? JsonObject }.getOrNull()

    // Runs in the session's scope: a language change recreates the activity, which would cancel it
    fun saveSyncedSettings(settings: Map<String, JsonElement>) {
        unconfirmedSettings = unconfirmedSettings + settings
        val previous = settingsSave
        settingsSave = scope.launch {
            previous?.join()
            val client = client ?: return@launch
            val content = (storedSyncedSettings() ?: emptyMap()) + settings
            runCatching { client.setAccountData(AppPreferences.SYNCED_ACCOUNT_DATA_TYPE, JsonObject(content)) }
        }
    }

    suspend fun applyPresence(visible: Boolean) {
        presenceVisible = visible
        runCatching { client?.setPresence(if (visible) Presence.online else Presence.offline, customStatus?.text) }
    }

    suspend fun setCustomStatus(text: String, expiresAt: Long?) {
        val trimmed = text.trim()
        val presence = if (presenceVisible) Presence.online else Presence.offline
        if (trimmed.isEmpty()) {
            requireClient.clearCustomStatus(presence)
            showCustomStatus(null)
        } else {
            requireClient.setCustomStatus(trimmed, expiresAt?.toDouble(), presence)
            showCustomStatus(CustomStatus(trimmed, expiresAt))
        }
    }

    private fun showCustomStatus(status: CustomStatus?) {
        statusExpiry?.cancel()
        val expiresAt = status?.expiresAt
        if (expiresAt != null && expiresAt <= System.currentTimeMillis()) {
            customStatus = null
            return
        }
        customStatus = status
        if (expiresAt == null) return
        statusExpiry = scope.launch {
            delay(expiresAt - System.currentTimeMillis())
            runCatching { setCustomStatus("", null) }
        }
    }

    suspend fun refreshProfile() {
        val client = client ?: return
        val profile = runCatching { client.ownProfile() }.getOrNull() ?: return
        if (this.client === client) {
            setProfile(profile.displayName, profile.avatarUrl)
            showCustomStatus(profile.customStatus)
        }
    }

    private suspend fun remember(client: WizardClient, folder: String, store: StoreConfig) {
        val stored = StoredSession(client.session, folder, store.passphrase ?: "")
        close()
        SessionStore.all().firstOrNull { it.session.userId == stored.session.userId }
            ?.takeIf { it.storeFolder != folder }
            ?.let { SessionStore.removeStore(it.storeFolder) }
        SessionStore.save(stored)
        SessionStore.setActive(stored.session.userId)
        SessionClients.add(client)
        reloadAccounts()
        isAddingAccount = false
        start(client, stored)
    }

    private suspend fun close() {
        CallManager.shared.signedOut()
        subscriptions.forEach { it.cancel() }
        subscriptions = emptyList()
        roomList?.stop()
        roomList = null
        media = null
        val client = client
        this.client = null
        stored = null
        userId = null
        displayName = null
        avatarUrl = null
        statusExpiry?.cancel()
        customStatus = null
        encryption = null
        needsEncryptionSetup = false
        needsVerification = false
        syncState = SyncState.idle
        runCatching { client?.stopSync() }
    }

    private fun start(client: WizardClient, stored: StoredSession) {
        this.client = client
        this.stored = stored
        userId = client.userId
        displayName = stored.displayName
        avatarUrl = stored.avatarUrl
        val roomList = RoomListModel(client, scope)
        this.roomList = roomList
        media = MediaLoader(client)
        subscriptions = listOf(
            client.watchSession { sessionChanged(it) },
            client.watchEncryptionStatus {
                encryption = it
                checkIdentity(client, it)
            },
        )
        scope.launch {
            // The sync state and room list come from the sync service, so start it first; offline
            // at launch, keep trying until it starts
            while (runCatching { client.startSync() }.isFailure) {
                if (this@MatrixSession.client !== client) return@launch
                syncState = SyncState.offline
                delay(3000)
            }
            if (this@MatrixSession.client !== client) return@launch
            subscriptions = subscriptions + client.watchSyncState { syncStateChanged(it) }
            roomList.start()
            encryption = runCatching { client.encryptionStatus() }.getOrNull()
            checkIdentity(client, encryption)
            refreshProfile()
            Push.register()
        }
        state = State.LoggedIn
    }

    fun checkIdentity(client: WizardClient? = this.client, status: EncryptionStatus? = encryption) {
        val userId = userId ?: return
        if (client == null || status == null || status.recovery == "unknown") return
        scope.launch {
            val hasIdentity = runCatching { client.userTrust(userId).hasIdentity }.getOrNull() ?: return@launch
            if (this@MatrixSession.client !== client) return@launch
            needsEncryptionSetup = !hasIdentity
            needsVerification = hasIdentity && encryption?.deviceVerified == false
        }
    }

    private fun sessionChanged(event: SessionEvent) {
        when (event) {
            is SessionEvent.Refreshed -> {
                val updated = stored?.copy(session = event.session) ?: return
                stored = updated
                scope.launch(Dispatchers.IO) { SessionStore.save(updated) }
            }
            is SessionEvent.Invalid -> stored?.let { scope.launch { forget(it) } }
        }
    }

    private suspend fun forget(stored: StoredSession) {
        close()
        SessionClients.remove(stored.session.userId)
        Push.forget(stored.session.userId)
        SessionStore.remove(stored.session.userId)
        MessageNotifier.shared.removeDelivered(stored.session.userId)
        reloadAccounts()
        state = State.Restoring
        restore()
    }

    companion object {
        const val DEVICE_NAME = "WizardChat Android"
        const val CALLBACK_SCHEME = "org.wizardchat"
        const val REDIRECT_URI = "$CALLBACK_SCHEME:/callback"
        val APP = AppInfo(name = "WizardChat", clientUri = "https://wizardchat.org")
    }
}
