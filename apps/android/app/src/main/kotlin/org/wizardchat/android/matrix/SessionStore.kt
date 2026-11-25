package org.wizardchat.android.matrix

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.CoreJson
import org.wizardchat.core.Session
import org.wizardchat.core.StoreConfig

@Serializable
data class StoredSession(
    val session: Session,
    val storeFolder: String,
    val passphrase: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val excludeInsecureDevices: Boolean = false,
) {
    val store: StoreConfig
        get() = StoreConfig(
            location = SessionStore.storePath(storeFolder).path,
            passphrase = passphrase,
            excludeInsecureDevices = excludeInsecureDevices,
            manualEncryptionSetup = true,
        )

    companion object {
        fun newStore(): Pair<String, StoreConfig> {
            val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val folder = UUID.randomUUID().toString()
            val path = SessionStore.storePath(folder).apply { mkdirs() }
            return folder to StoreConfig(location = path.path, passphrase = Base64.encodeToString(bytes, Base64.NO_WRAP), manualEncryptionSetup = true)
        }
    }
}

@Serializable
private data class StoredAccounts(
    val active: String? = null,
    val accounts: List<StoredSession> = emptyList(),
)

/** The signed-in accounts, encrypted with a key that never leaves the Android keystore */
object SessionStore {
    private const val KEY_ALIAS = "org.wizardchat.session"
    private val file: File get() = File(WizardApplication.instance.filesDir, "accounts.bin")

    fun all(): List<StoredSession> = read().accounts

    fun active(): StoredSession? {
        val state = read()
        return state.accounts.firstOrNull { it.session.userId == state.active } ?: state.accounts.firstOrNull()
    }

    @Synchronized
    fun save(stored: StoredSession) {
        val state = read()
        val others = state.accounts.filter { it.session.userId != stored.session.userId }
        val accounts = if (others.size == state.accounts.size) {
            state.accounts + stored
        } else {
            state.accounts.map { if (it.session.userId == stored.session.userId) stored else it }
        }
        write(StoredAccounts(state.active ?: stored.session.userId, accounts))
    }

    @Synchronized
    fun updateProfile(userId: String, displayName: String?, avatarUrl: String?) {
        val stored = all().firstOrNull { it.session.userId == userId } ?: return
        if (stored.displayName == displayName && stored.avatarUrl == avatarUrl) return
        save(stored.copy(displayName = displayName, avatarUrl = avatarUrl))
    }

    private fun avatarFile(userId: String): java.io.File? =
        all().firstOrNull { it.session.userId == userId }?.let { File(storePath(it.storeFolder), "account-avatar.png") }

    fun savedAvatar(userId: String): android.graphics.Bitmap? =
        avatarFile(userId)?.takeIf { it.exists() }?.let { android.graphics.BitmapFactory.decodeFile(it.path) }

    fun saveAvatar(image: android.graphics.Bitmap?, userId: String) {
        val file = avatarFile(userId) ?: return
        if (image == null) {
            file.delete()
            return
        }
        runCatching {
            file.parentFile?.mkdirs()
            file.outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Synchronized
    fun setActive(userId: String) {
        val state = read()
        if (state.accounts.any { it.session.userId == userId }) write(state.copy(active = userId))
    }

    @Synchronized
    fun remove(userId: String) {
        val state = read()
        state.accounts.filter { it.session.userId == userId }.forEach { removeStore(it.storeFolder) }
        val accounts = state.accounts.filter { it.session.userId != userId }
        val active = if (state.active == userId) accounts.firstOrNull()?.session?.userId else state.active
        write(StoredAccounts(active, accounts))
    }

    private fun read(): StoredAccounts =
        decrypt(file)
            ?.let { runCatching { CoreJson.decodeFromString(StoredAccounts.serializer(), it) }.getOrNull() }
            ?: StoredAccounts()

    private fun write(state: StoredAccounts) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.doFinal(CoreJson.encodeToString(StoredAccounts.serializer(), state).encodeToByteArray())
        val tmp = File(file.path + ".tmp")
        tmp.writeBytes(cipher.iv + sealed)
        tmp.renameTo(file)
    }

    private fun decrypt(file: File): String? = runCatching {
        val bytes = file.takeIf { it.exists() }?.readBytes() ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        cipher.doFinal(bytes, 12, bytes.size - 12).decodeToString()
    }.getOrNull()

    fun storePath(folder: String): File = File(WizardApplication.instance.filesDir, "accounts/$folder")

    fun removeStore(folder: String) {
        storePath(folder).deleteRecursively()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
