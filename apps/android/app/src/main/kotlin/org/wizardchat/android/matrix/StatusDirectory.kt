package org.wizardchat.android.matrix

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.wizardchat.core.CustomStatus
import org.wizardchat.core.WizardClient

object StatusDirectory {
    private const val MAX_AGE_MS = 5 * 60 * 1000L
    private val requests = Semaphore(6)
    private val entries = mutableMapOf<String, Pair<CustomStatus?, Long>>()
    private val pending = mutableMapOf<String, CompletableDeferred<CustomStatus?>>()

    suspend fun status(userId: String, client: WizardClient): CustomStatus? {
        val now = System.currentTimeMillis()
        entries[userId]?.let { (status, at) -> if (now - at < MAX_AGE_MS) return live(status) }
        pending[userId]?.let { return live(it.await()) }
        val deferred = CompletableDeferred<CustomStatus?>()
        pending[userId] = deferred
        val status = requests.withPermit { runCatching { client.customStatus(userId) }.getOrNull() }
        entries[userId] = status to System.currentTimeMillis()
        pending.remove(userId)
        deferred.complete(status)
        return live(status)
    }

    private fun live(status: CustomStatus?): CustomStatus? =
        status?.takeIf { (it.expiresAt ?: Long.MAX_VALUE) > System.currentTimeMillis() }
}
