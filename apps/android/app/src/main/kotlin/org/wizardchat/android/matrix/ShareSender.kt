package org.wizardchat.android.matrix

import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.AttachmentOptions

/** A file shared into the app, copied to the cache until it's sent */
data class SharedFile(
    val file: File,
    val name: String,
    val mimetype: String,
    val width: Long? = null,
    val height: Long? = null,
)

/** Sends what another app shared into WizardChat; the share screen runs in the app's own process */
object ShareSender {
    private val scope = MainScope()

    fun send(roomId: String, text: String?, files: List<SharedFile>) {
        scope.launch {
            val session = WizardApplication.instance.session
            runCatching { session.restore() }
            var room = session.roomList?.room(roomId)
            repeat(40) {
                if (room != null) return@repeat
                delay(250)
                room = session.roomList?.room(roomId)
            }
            val summary = room ?: return@launch
            val client = session.roomList?.client ?: return@launch
            val timeline = runCatching { client.timeline(roomId) }.getOrNull() ?: return@launch
            for (shared in files) {
                val bytes = withContext(Dispatchers.IO) { runCatching { shared.file.readBytes() }.getOrNull() } ?: continue
                val blurhash = if (shared.mimetype.startsWith("image/")) MediaMetadata.blurhash(bytes) else null
                runCatching {
                    timeline.sendFile(
                        bytes,
                        AttachmentOptions(
                            filename = shared.name,
                            mimetype = shared.mimetype,
                            width = shared.width,
                            height = shared.height,
                            blurhash = blurhash,
                        ),
                    )
                }
                withContext(Dispatchers.IO) { shared.file.delete() }
            }
            if (text != null) runCatching { timeline.sendText(text) }
            CopyToast.show(L10n.format("share.sentTo", summary.displayName))
        }
    }
}
