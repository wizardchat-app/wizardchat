package org.wizardchat.android.matrix

import java.util.Locale
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** MSC4247 pronouns: the stable key, and the unstable one clients use until it is merged */
object Pronouns {
    const val KEY = "m.pronouns"
    const val UNSTABLE_KEY = "io.fsky.nyx.pronouns"
    const val MAX_LENGTH = 40

    fun parse(value: JsonElement?): String? {
        val entries = value as? JsonArray ?: return null
        return entries
            .mapNotNull { (it as? JsonObject)?.get("summary")?.jsonPrimitive?.contentOrNull?.trim() }
            .filter { it.isNotEmpty() }
            .map { it.take(MAX_LENGTH) }
            .takeIf { it.isNotEmpty() }
            ?.joinToString(", ")
    }
}

suspend fun MatrixSession.pronouns(userId: String): String? {
    val client = client ?: return null
    for (key in listOf(Pronouns.UNSTABLE_KEY, Pronouns.KEY)) {
        Pronouns.parse(runCatching { client.profileField(userId, key) }.getOrNull())?.let { return it }
    }
    return null
}

suspend fun MatrixSession.canSetPronouns(): Boolean =
    runCatching { client?.canSetProfileField(Pronouns.UNSTABLE_KEY) }.getOrNull() ?: false

suspend fun MatrixSession.setPronouns(text: String) {
    val summary = text.trim().take(Pronouns.MAX_LENGTH)
    if (summary.isEmpty()) {
        requireClient.deleteProfileField(Pronouns.UNSTABLE_KEY)
    } else {
        val entry = JsonObject(
            mapOf("language" to JsonPrimitive(Locale.getDefault().language.ifEmpty { "en" }), "summary" to JsonPrimitive(summary)),
        )
        requireClient.setProfileField(Pronouns.UNSTABLE_KEY, JsonArray(listOf(entry)))
    }
}
