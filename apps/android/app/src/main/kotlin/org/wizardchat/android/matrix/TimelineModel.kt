package org.wizardchat.android.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File
import java.net.URLDecoder
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToLong
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.AttachmentOptions
import org.wizardchat.core.CallHistoryView
import org.wizardchat.core.EntryContent
import org.wizardchat.core.ListDiff
import org.wizardchat.core.MediaInfo
import org.wizardchat.core.MediaSource
import org.wizardchat.core.Member
import org.wizardchat.core.Mentions
import org.wizardchat.core.MessageKind
import org.wizardchat.core.ReadReceiptView
import org.wizardchat.core.ReplyPreview
import org.wizardchat.core.RichBlock
import org.wizardchat.core.RoomTimeline
import org.wizardchat.core.SendState
import org.wizardchat.core.Subscription
import org.wizardchat.core.ThreadSummaryView
import org.wizardchat.core.TimelineEntry
import org.wizardchat.core.TimelineKind
import org.wizardchat.core.UploadedFile
import org.wizardchat.core.UploadedThumbnail
import org.wizardchat.core.WizardClient

/** A row of the timeline. Immutable: changes make copies. */
data class PendingUpload(
    val preview: Bitmap?,
    val isVideo: Boolean,
    val filename: String,
    val progress: Float? = null,
    val id: Long = nextId++,
) {
    private companion object {
        var nextId = 0L
    }
}

data class MessageMention(val label: String, val userId: String, val isOwn: Boolean)

@Immutable
data class ChatEntry(
    val id: String,
    val kind: Kind,
    val sender: String,
    val senderName: String,
    val senderAvatarUrl: String?,
    val isOwn: Boolean,
    val timestamp: Instant,
    val isSending: Boolean,
    val isEdited: Boolean,
    val itemKey: String? = null,
    val eventId: String? = null,
    val contentType: ContentType? = null,
    val reactions: List<ReactionGroup> = emptyList(),
    val readBy: List<String> = emptyList(),
    val readAt: Map<String, Instant> = emptyMap(),
    val sendFailed: Boolean = false,
    val replyTo: ReplyQuote? = null,
    val isEditable: Boolean = false,
    val isGrouped: Boolean = false,
    val spoilers: List<String> = emptyList(),
    val mentions: List<MessageMention> = emptyList(),
    /** The message's formatting (headings, lists, code...) to draw instead of the plain body */
    val rich: List<RichBlock>? = null,
    val mediaSpoiler: String? = null,
    val galleryItems: List<ChatEntry> = emptyList(),
    val thread: ThreadSummaryView? = null,
) {
    sealed interface Kind {
        data class Message(val body: String, val isEmote: Boolean, val isNotice: Boolean) : Kind
        data class Image(val media: MediaContent) : Kind
        data class Sticker(val media: MediaContent) : Kind
        data class Video(val media: MediaContent) : Kind
        data class Audio(val media: MediaContent, val isVoice: Boolean, val waveform: List<Float>) : Kind
        data class File(val media: MediaContent) : Kind
        data class Location(val body: String, val geoUri: String, val description: String?) : Kind
        data class Poll(val poll: PollContent) : Kind
        data object Redacted : Kind
        data class Undecryptable(val text: String) : Kind
        data class System(val text: String) : Kind
        data class Call(val call: CallHistoryView) : Kind
        data class DateDivider(val date: Instant) : Kind
    }

    enum class ContentType { text, notice, emote, image, video, audio, file, location }

    val editableMedia: MediaContent?
        get() = when (val k = kind) {
            is Kind.Image -> k.media
            is Kind.Video -> k.media
            is Kind.Audio -> k.media.takeUnless { k.isVoice }
            is Kind.File -> k.media
            else -> null
        }

    val editableText: String?
        get() = (kind as? Kind.Message)?.body
            ?: editableMedia?.let { media -> media.caption?.takeIf { it.isNotBlank() && it != media.filename } ?: "" }

    /** `duration` is in seconds */
    data class MediaContent(
        val source: MediaSource,
        val body: String,
        val caption: String?,
        val filename: String,
        val mimetype: String?,
        val width: Float?,
        val height: Float?,
        val size: Long?,
        val duration: Double?,
        val thumbnail: MediaSource?,
        val isAnimated: Boolean,
    ) {
        constructor(media: MediaInfo, body: String? = null) : this(
            source = media.source,
            body = body ?: media.caption ?: media.filename,
            caption = media.caption,
            filename = media.filename,
            mimetype = media.mimetype,
            width = media.width?.toFloat(),
            height = media.height?.toFloat(),
            size = media.size,
            duration = media.durationMs?.let { it / 1000.0 },
            thumbnail = media.thumbnailSource,
            isAnimated = media.isAnimated || media.mimetype == "image/gif",
        )
    }

    data class PollContent(
        val question: String,
        val answers: List<Answer>,
        val maxSelections: Int,
        val isDisclosed: Boolean,
        val hasEnded: Boolean,
        val totalVotes: Int,
    ) {
        data class Answer(val id: String, val text: String, val votes: Int, val votedByMe: Boolean)
    }

    data class ReactionGroup(val key: String, val count: Int, val reactedByMe: Boolean, val senders: List<String>) {
        val id: String get() = key
    }

    data class ReplyQuote(val eventId: String, val senderName: String, val text: String, val sender: String = "")

    val allowsActions: Boolean get() = kind !is Kind.Redacted && kind !is Kind.Undecryptable
    val canBeRepliedTo: Boolean get() = eventId != null && allowsActions

    val summary: String
        get() = when (val kind = kind) {
            is Kind.Message -> kind.body
            is Kind.Image -> kind.media.caption ?: L10n.format("timeline.summary.image")
            is Kind.Sticker -> kind.media.body
            is Kind.Video -> L10n.format("timeline.summary.video")
            is Kind.Audio -> if (kind.isVoice) L10n.format("composer.voice.record") else L10n.format("timeline.audioFile")
            is Kind.File -> kind.media.filename
            is Kind.Location -> L10n.format("timeline.locationShared")
            is Kind.Poll -> kind.poll.question
            else -> ""
        }

    val isContent: Boolean get() = kind !is Kind.System && kind !is Kind.DateDivider && kind !is Kind.Call

    /** With read receipts added (not your own), newest first */
    fun addReceipts(receipts: List<ReadReceiptView>, ownUserId: String): ChatEntry {
        val others = receipts.filter { it.userId != ownUserId }
        val dates = others.mapNotNull { r -> r.timestamp?.let { r.userId to Instant.ofEpochMilli(it) } }.toMap()
        return mergeReceipts(others.map { it.userId }, dates)
    }

    fun mergeReceipts(readBy: List<String>, readAt: Map<String, Instant>): ChatEntry {
        val merged = this.readAt.toMutableMap()
        for ((user, date) in readAt) merged[user] = merged[user]?.let { maxOf(it, date) } ?: date
        val users = (this.readBy + readBy).toSet().sortedByDescending { merged[it] ?: Instant.MIN }
        return copy(readBy = users, readAt = merged)
    }
}

/** A room's timeline. Call [close] when the screen goes away. */
class TimelineModel(
    val client: WizardClient,
    val roomId: String,
    threadRoot: String? = null,
    pinnedOnly: Boolean = false,
    private val onlyTypes: Set<ChatEntry.ContentType>? = null,
) {
    var entries by mutableStateOf<List<ChatEntry>>(emptyList())
        private set
    var isPaginating by mutableStateOf(false)
        private set
    var reachedStart by mutableStateOf(false)
        private set
    var loadFailed by mutableStateOf(false)
    var typingNames by mutableStateOf<List<String>>(emptyList())
        private set
    var typingIds by mutableStateOf<List<String>>(emptyList())
        private set
    var sendError by mutableStateOf<String?>(null)
    var firstUnreadId by mutableStateOf<String?>(null)
        private set
    var pinnedIds by mutableStateOf<Set<String>>(emptySet())
        private set
    var uploads by mutableStateOf<List<PendingUpload>>(emptyList())
        private set

    private val kind: TimelineKind = threadRoot?.let { TimelineKind.Thread(it) }
        ?: if (pinnedOnly) TimelineKind.Pinned else TimelineKind.Main
    private val scope = MainScope()
    private var timeline: RoomTimeline? = null
    private val items = mutableListOf<TimelineEntry>()
    private val converted = mutableListOf<ChatEntry?>()
    private val subscriptions = mutableListOf<Subscription>()
    private var isTyping = false
    private var starting = false
    private val ownUserId: String get() = client.userId ?: ""

    fun close() {
        subscriptions.forEach { it.cancel() }
        subscriptions.clear()
        scope.cancel()
    }

    suspend fun start() {
        if (timeline != null || starting) return
        starting = true
        loadPinned()
        try {
            val timeline = if (kind == TimelineKind.Main) client.timeline(roomId) else client.timelineOf(roomId, kind)
            this.timeline = timeline
            subscriptions += timeline.watch { diffs -> apply(diffs) }
            if (kind == TimelineKind.Main) {
                subscriptions += timeline.watchTyping { users ->
                    typingNames = users.map { it.displayName ?: localpart(it.userId) }
                    typingIds = users.map { it.userId }
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            sendError = readableError(e)
        } finally {
            starting = false
        }
    }

    suspend fun loadPinned() {
        pinnedIds = runCatching { client.roomDetails(roomId) }.getOrNull()?.pinnedEventIds?.toSet() ?: emptySet()
    }

    suspend fun togglePin(entry: ChatEntry) {
        val timeline = timeline ?: return
        val eventId = entry.eventId ?: return
        if (eventId in pinnedIds) {
            report { timeline.unpin(eventId) }
            pinnedIds = pinnedIds - eventId
        } else {
            report { timeline.pin(eventId) }
            pinnedIds = pinnedIds + eventId
        }
    }

    suspend fun reportMessage(entry: ChatEntry, reason: String?): Boolean {
        val eventId = entry.eventId ?: return false
        return try {
            client.reportEvent(roomId, eventId, reason)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            sendError = readableError(e)
            false
        }
    }

    /** The event as JSON (decrypted when it was encrypted), pretty-printed with sorted keys */
    suspend fun source(entry: ChatEntry): String? {
        val eventId = entry.eventId ?: return null
        val source = runCatching { client.eventSource(roomId, eventId) }.getOrNull() ?: return null
        return prettyJson.encodeToString(JsonElement.serializer(), sorted(source.decrypted ?: source.original))
    }

    suspend fun retry(entry: ChatEntry) {
        val timeline = timeline ?: return
        val itemKey = entry.itemKey ?: return
        report { timeline.retrySend(itemKey) }
    }

    fun retrySending() {
        for (entry in entries.filter { it.sendFailed }) scope.launch { retry(entry) }
    }

    suspend fun loadUntilReadMarker(maxPages: Int = 6): String? {
        repeat(maxPages) {
            firstUnreadId?.let { return it }
            if (reachedStart) return null
            paginateBackwards()
            delay(50)
        }
        return firstUnreadId
    }

    suspend fun loadUntil(eventId: String, maxPages: Int = 15): Boolean {
        repeat(maxPages) {
            if (entries.any { e -> e.eventId == eventId || e.galleryItems.any { it.eventId == eventId } }) return true
            if (reachedStart) return false
            paginateBackwards()
            delay(50)
        }
        return entries.any { it.eventId == eventId }
    }

    suspend fun paginateBackwards() {
        val timeline = timeline ?: return
        if (isPaginating || reachedStart) return
        isPaginating = true
        try {
            val atStart = withTimeoutOrNull(25_000) { timeline.paginateBack(80) }
            if (atStart == null) {
                loadFailed = true
            } else {
                reachedStart = atStart
                loadFailed = false
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            loadFailed = true
        } finally {
            isPaginating = false
        }
    }

    suspend fun send(text: String, html: String? = null, emote: Boolean = false, replyTo: String? = null, mentions: Mentions? = null) {
        val trimmed = text.trim()
        val timeline = timeline ?: return
        if (trimmed.isEmpty()) return
        report {
            timeline.sendMessage(if (emote) MessageKind.emote else MessageKind.text, trimmed, html, replyTo, mentions)
        }
    }

    suspend fun sendNotice(text: String, replyTo: String? = null) {
        val timeline = timeline ?: return
        report { timeline.sendMessage(MessageKind.notice, text, replyTo = replyTo) }
    }

    suspend fun sendPlain(text: String, replyTo: String? = null) {
        val timeline = timeline ?: return
        val escaped = text.replace("&", "&amp;").replace("<", "&lt;")
        report { timeline.sendHtml(text, escaped, replyTo) }
    }

    suspend fun edit(entry: ChatEntry, newText: String) {
        val timeline = timeline ?: return
        val itemKey = entry.itemKey ?: return
        report {
            if (entry.editableMedia != null) timeline.editCaption(itemKey, newText)
            else timeline.editText(itemKey, newText)
        }
    }

    suspend fun redact(entry: ChatEntry) {
        val timeline = timeline ?: return
        val itemKey = entry.itemKey ?: return
        report { timeline.redact(itemKey) }
    }

    suspend fun toggleReaction(key: String, entry: ChatEntry) {
        val timeline = timeline ?: return
        val itemKey = entry.itemKey ?: return
        report { timeline.toggleReaction(itemKey, key) }
    }

    /** Uploads a picked file (`content://` or `file://`) */
    suspend fun sendFile(uri: Uri, caption: String? = null, replyTo: String? = null, spoiler: Boolean = false) =
        sendFiles(listOf(uri to null), caption, replyTo, spoiler)

    /** The caption and reply go with the first file */
    suspend fun sendFiles(
        files: List<Pair<Uri, Bitmap?>>,
        caption: String? = null,
        replyTo: String? = null,
        spoiler: Boolean = false,
    ) {
        if (timeline == null) return
        val pending = files.map { (uri, preview) ->
            val mimetype = mimeTypeOf(uri)
            PendingUpload(
                preview = preview ?: if (mimetype.startsWith("image/")) decodePreview(uri) else null,
                isVideo = mimetype.startsWith("video/"),
                filename = filenameOf(uri),
            )
        }
        uploads = uploads + pending
        files.zip(pending).forEachIndexed { index, (file, item) ->
            upload(
                file.first,
                item.id,
                caption = if (index == 0) caption else null,
                replyTo = if (index == 0) replyTo else null,
                spoiler = spoiler,
            )
            uploads = uploads.filter { it.id != item.id }
        }
    }

    private suspend fun upload(uri: Uri, id: Long, caption: String?, replyTo: String?, spoiler: Boolean) {
        val timeline = timeline ?: return
        val context = WizardApplication.instance
        val mimetype = mimeTypeOf(uri)
        var file = UploadedFile(
            source = JsonPrimitive(""),
            size = 0,
            filename = filenameOf(uri),
            mimetype = mimetype,
            caption = caption,
            spoiler = spoiler,
            isAnimated = mimetype == "image/gif",
            replyTo = replyTo,
        )
        when {
            mimetype.startsWith("image/") -> MediaMetadata.imageSize(uri)?.let { (w, h) ->
                file = file.copy(width = w.toLong(), height = h.toLong())
            }
            mimetype.startsWith("video/") -> {
                val video = MediaMetadata.video(uri)
                file = file.copy(
                    width = video.size?.first?.toLong(),
                    height = video.size?.second?.toLong(),
                    durationMs = video.duration?.let { (it * 1000).toLong() },
                )
            }
            mimetype.startsWith("audio/") ->
                file = file.copy(durationMs = MediaMetadata.duration(uri)?.let { (it * 1000).toLong() })
        }
        report {
            val data = withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            } ?: throw IllegalStateException(L10n.format("common.somethingWentWrong"))
            val source = timeline.uploadFile(data, mimetype) { progress ->
                if (progress.total <= 0) return@uploadFile
                val fraction = progress.current.toFloat() / progress.total
                scope.launch { uploads = uploads.map { if (it.id == id) it.copy(progress = fraction) else it } }
            }
            if (mimetype.startsWith("video/")) {
                MediaMetadata.videoFrame(uri)?.let { frame ->
                    runCatching { timeline.uploadFile(frame.data, "image/jpeg") {} }.getOrNull()?.let { thumb ->
                        file = file.copy(
                            thumbnail = UploadedThumbnail(thumb, "image/jpeg", frame.width.toLong(), frame.height.toLong(), frame.data.size.toLong()),
                        )
                    }
                }
            }
            timeline.sendUploaded(file.copy(source = source, size = data.size.toLong()))
        }
    }

    private fun filenameOf(uri: Uri): String =
        displayName(uri) ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"

    private fun mimeTypeOf(uri: Uri): String =
        WizardApplication.instance.contentResolver.getType(uri)?.takeIf { it != "application/octet-stream" }
            ?: mimeType(filenameOf(uri))

    private suspend fun decodePreview(uri: Uri): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            WizardApplication.instance.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 4 })
            }
        }.getOrNull()
    }

    suspend fun sendFile(file: File, caption: String? = null, replyTo: String? = null, spoiler: Boolean = false) =
        sendFile(Uri.fromFile(file), caption, replyTo, spoiler)

    /** `duration` in seconds; `waveform` loudness samples from 0 to 1 */
    suspend fun sendVoiceMessage(file: File, duration: Double, waveform: List<Float>, replyTo: String?) {
        val timeline = timeline ?: return
        val options = AttachmentOptions(
            filename = file.name,
            mimetype = if (file.extension.lowercase() == "ogg") "audio/ogg" else "audio/mp4",
            voice = true,
            durationMs = (duration * 1000).toLong(),
            waveform = waveform.map { (it * 1024).roundToLong() },
            replyTo = replyTo,
        )
        report {
            val data = withContext(Dispatchers.IO) { file.readBytes() }
            timeline.sendFile(data, options)
        }
    }

    suspend fun sendSticker(url: String, body: String, info: JsonElement, replyTo: String?) {
        val timeline = timeline ?: return
        val content = mutableMapOf("body" to JsonPrimitive(body), "url" to JsonPrimitive(url), "info" to info)
        if (replyTo != null) {
            content["m.relates_to"] = JsonObject(mapOf("m.in_reply_to" to JsonObject(mapOf("event_id" to JsonPrimitive(replyTo)))))
        }
        report { timeline.sendEvent("m.sticker", JsonObject(content)) }
    }

    suspend fun createPoll(question: String, answers: List<String>, disclosed: Boolean) {
        val timeline = timeline ?: return
        report { timeline.sendPoll(question, answers, 1, !disclosed) }
    }

    suspend fun vote(answerId: String, entry: ChatEntry) {
        val timeline = timeline ?: return
        val eventId = entry.eventId ?: return
        report { timeline.vote(eventId, listOf(answerId)) }
    }

    suspend fun endPoll(entry: ChatEntry) {
        val timeline = timeline ?: return
        val eventId = entry.eventId ?: return
        report { timeline.endPoll(eventId) }
    }

    suspend fun sendLocation(latitude: Double, longitude: Double, description: String?, replyTo: String?) {
        val timeline = timeline ?: return
        val geoUri = "geo:$latitude,$longitude"
        val body = description?.let { "$it ($geoUri)" } ?: geoUri
        report { timeline.sendLocation(body, geoUri, description) }
    }

    private suspend fun report(work: suspend () -> Unit) {
        try {
            work()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            sendError = readableError(e)
        }
    }

    /** Public receipts when "Send read receipts" is on, private ones otherwise */
    suspend fun markAsRead(sendReceipts: Boolean) {
        runCatching { timeline?.markAsRead(!sendReceipts) }
    }

    fun setTyping(typing: Boolean) {
        val timeline = timeline ?: return
        if (typing == isTyping) return
        isTyping = typing
        scope.launch { runCatching { timeline.setTyping(typing) } }
    }

    suspend fun members(): List<Member> =
        (runCatching { client.members(roomId) }.getOrNull() ?: emptyList()).filter { !it.isInvite }

    private fun apply(diffs: List<ListDiff<TimelineEntry>>) {
        val own = ownUserId
        for (diff in diffs) {
            diff.applyTo(items)
            diff.mapTo(converted) { makeEntry(it, own) }
        }
        // The read marker is a virtual item; the first message after it is the first unread
        val marker = items.indexOfFirst { it is TimelineEntry.ReadMarker }
        firstUnreadId = if (marker >= 0) {
            converted.drop(marker + 1).firstOrNull { it?.isContent == true }?.id
        } else {
            null
        }
        if (items.any { it is TimelineEntry.TimelineStart }) reachedStart = true
        // Receipts on events that aren't shown move to the message above them
        var entries = mutableListOf<ChatEntry>()
        for ((item, entry) in items.zip(converted)) {
            if (entry != null) {
                entries += entry
            } else if (item is TimelineEntry.Event && item.readBy.isNotEmpty()) {
                val last = entries.indexOfLast { it.isContent }
                if (last >= 0) entries[last] = entries[last].addReceipts(item.readBy, own)
            }
        }
        if (onlyTypes != null) {
            entries = entries.filter { entry ->
                entry.kind is ChatEntry.Kind.DateDivider || entry.contentType?.let { it in onlyTypes } == true
            }.toMutableList()
        }
        val withDividers = entries
        entries = withDividers.filterIndexed { index, entry ->
            if (entry.kind !is ChatEntry.Kind.DateDivider) return@filterIndexed true
            if (index + 1 >= withDividers.size) return@filterIndexed false
            withDividers[index + 1].kind !is ChatEntry.Kind.DateDivider
        }.toMutableList()
        for (index in 1 until entries.size) {
            val previous = entries[index - 1]
            val current = entries[index]
            if (!current.isContent || !previous.isContent || current.replyTo != null) continue
            entries[index] = current.copy(
                isGrouped = previous.sender == current.sender &&
                    current.timestamp.toEpochMilli() - previous.timestamp.toEpochMilli() < GROUPING_INTERVAL_MS,
            )
        }
        this.entries = if (kind == TimelineKind.Main && onlyTypes == null) collapseGalleries(entries) else entries
    }

    private fun displayName(uri: Uri): String? = runCatching {
        WizardApplication.instance.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    }.getOrNull()

    companion object {
        private const val GROUPING_INTERVAL_MS = 5 * 60 * 1000L

        private val prettyJson = Json { prettyPrint = true }

        fun localpart(userId: String): String = userId.drop(1).takeWhile { it != ':' }

        fun mimeType(filename: String): String =
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(filename.substringAfterLast('.', "").lowercase())
                ?: "application/octet-stream"

        private fun sorted(json: JsonElement): JsonElement = when (json) {
            is JsonObject -> JsonObject(json.entries.sortedBy { it.key }.associate { it.key to sorted(it.value) })
            is JsonArray -> JsonArray(json.map { sorted(it) })
            else -> json
        }

        private fun makeEntry(item: TimelineEntry, ownUserId: String): ChatEntry? {
            val event = when (item) {
                is TimelineEntry.DateDivider -> {
                    val date = Instant.ofEpochMilli(item.timestamp)
                    return ChatEntry(item.id, ChatEntry.Kind.DateDivider(date), "", "", null, false, date, false, false)
                }
                is TimelineEntry.ReadMarker, is TimelineEntry.TimelineStart -> return null
                is TimelineEntry.Event -> item
            }
            var contentType: ChatEntry.ContentType? = null
            var spoilers = emptyList<String>()
            var mentions = emptyList<MessageMention>()
            var rich: List<RichBlock>? = null
            var mediaSpoiler: String? = null
            val kind: ChatEntry.Kind = when (val content = event.content) {
                is EntryContent.Text -> {
                    contentType = ChatEntry.ContentType.text
                    rich = content.rich
                    spoilers = spoilers(content.html)
                    val mentioned = mentionText(content.html, ownUserId)
                    mentions = mentioned?.second ?: emptyList()
                    ChatEntry.Kind.Message(mentioned?.first ?: content.body, isEmote = false, isNotice = false)
                }
                is EntryContent.Notice -> {
                    contentType = ChatEntry.ContentType.notice
                    rich = content.rich
                    spoilers = spoilers(content.html)
                    val mentioned = mentionText(content.html, ownUserId)
                    mentions = mentioned?.second ?: emptyList()
                    ChatEntry.Kind.Message(mentioned?.first ?: content.body, isEmote = false, isNotice = true)
                }
                is EntryContent.Emote -> {
                    contentType = ChatEntry.ContentType.emote
                    spoilers = spoilers(content.html)
                    val mentioned = mentionText(content.html, ownUserId)
                    mentions = mentioned?.second ?: emptyList()
                    ChatEntry.Kind.Message(mentioned?.first ?: content.body, isEmote = true, isNotice = false)
                }
                is EntryContent.Image -> {
                    contentType = ChatEntry.ContentType.image
                    mediaSpoiler = if (content.media.spoiler) content.media.spoilerReason ?: "" else null
                    ChatEntry.Kind.Image(ChatEntry.MediaContent(content.media))
                }
                is EntryContent.Video -> {
                    contentType = ChatEntry.ContentType.video
                    mediaSpoiler = if (content.media.spoiler) content.media.spoilerReason ?: "" else null
                    ChatEntry.Kind.Video(ChatEntry.MediaContent(content.media))
                }
                is EntryContent.Audio -> {
                    contentType = ChatEntry.ContentType.audio
                    val waveform = (content.media.waveform ?: emptyList()).map { it / 1024f }
                    ChatEntry.Kind.Audio(ChatEntry.MediaContent(content.media), content.media.voice, waveform)
                }
                is EntryContent.File -> {
                    contentType = ChatEntry.ContentType.file
                    ChatEntry.Kind.File(ChatEntry.MediaContent(content.media))
                }
                is EntryContent.Sticker -> ChatEntry.Kind.Sticker(ChatEntry.MediaContent(content.media, content.body))
                is EntryContent.Location -> {
                    contentType = ChatEntry.ContentType.location
                    ChatEntry.Kind.Location(content.body, content.geoUri, content.description)
                }
                is EntryContent.Poll -> {
                    val poll = content.poll
                    ChatEntry.Kind.Poll(
                        ChatEntry.PollContent(
                            question = poll.question,
                            answers = poll.answers.map {
                                ChatEntry.PollContent.Answer(it.id, it.text, it.votes.toInt(), it.id in poll.myVotes)
                            },
                            maxSelections = poll.maxSelections.toInt(),
                            isDisclosed = !poll.undisclosed,
                            hasEnded = poll.ended,
                            totalVotes = poll.totalVotes.toInt(),
                        ),
                    )
                }
                is EntryContent.Redacted -> ChatEntry.Kind.Redacted
                is EntryContent.UnableToDecrypt -> ChatEntry.Kind.Undecryptable(decryptionMessage(content.reason))
                is EntryContent.Membership -> {
                    val text = describe(content, event.senderName ?: event.sender) ?: return null
                    ChatEntry.Kind.System(text)
                }
                is EntryContent.Call -> ChatEntry.Kind.Call(content.call)
                EntryContent.CallPart -> return null
                else -> return null
            }
            return ChatEntry(
                id = event.id,
                kind = kind,
                sender = event.sender,
                senderName = event.senderName ?: event.sender,
                senderAvatarUrl = event.senderAvatar,
                isOwn = event.isOwn,
                timestamp = Instant.ofEpochMilli(event.timestamp),
                isSending = event.sendState == SendState.sending,
                isEdited = event.edited,
                itemKey = event.itemKey,
                eventId = event.eventId,
                contentType = contentType,
                sendFailed = event.sendState == SendState.failed,
                spoilers = spoilers,
                mentions = mentions,
                rich = rich,
                mediaSpoiler = mediaSpoiler,
                isEditable = event.isEditable,
                thread = event.thread,
                replyTo = event.inReplyTo?.let(::quote),
                reactions = event.reactions.map {
                    ChatEntry.ReactionGroup(it.key, it.count.toInt(), it.mine, it.senders)
                },
            ).addReceipts(event.readBy, ownUserId)
        }

        private val spoilerPattern = Regex(
            "<span[^>]*data-mx-spoiler[^>]*>(.*?)</span>",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )

        private fun spoilers(html: String?): List<String> {
            if (html == null || !html.contains("data-mx-spoiler")) return emptyList()
            return spoilerPattern.findAll(html).mapNotNull { match ->
                val inner = match.groupValues[1].replace(Regex("<[^>]+>"), "")
                decodeEntities(inner).trim().ifEmpty { null }
            }.toList()
        }

        private val mentionLink = Regex(
            """<a\s[^>]*href=["']https://matrix\.to/#/((?:@|%40)[^"'?]+)[^"']*["'][^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )

        /**
         * The body has only names, so mentions (matrix.to links in the HTML, as Element sends them)
         * are read from the HTML and shown as "@name" pills
         */
        fun mentionText(html: String?, ownUserId: String?): Pair<String, List<MessageMention>>? {
            if (html == null) return null
            val withoutReply = html.replace(Regex("(?is)<mx-reply>.*?</mx-reply>"), "")
            if (!mentionLink.containsMatchIn(withoutReply)) return null
            val mentions = mutableListOf<MessageMention>()
            val text = mentionLink.replace(withoutReply) { match ->
                val rawId = match.groupValues[1]
                val userId = runCatching { URLDecoder.decode(rawId.replace("+", "%2B"), "UTF-8") }.getOrDefault(rawId)
                val name = decodeEntities(match.groupValues[2].replace(Regex("<[^>]+>"), "")).trim()
                val label = if (name.startsWith("@")) name else "@" + name.ifEmpty { userId }
                mentions += MessageMention(label, userId, userId == ownUserId)
                label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            }
                .replace(Regex("(?i)<br\\s*/?>"), "\n")
                .replace(Regex("(?i)</(p|div|li|h[1-6]|blockquote|pre|tr)>"), "\n")
                .replace(Regex("(?i)<li[^>]*>"), "• ")
                .replace(Regex("""(?i)<img[^>]*alt="([^"]*)"[^>]*>"""), "$1")
                .replace(Regex("<[^>]+>"), "")
                .replace("&nbsp;", " ")
                .replace(Regex("\n{3,}"), "\n\n")
            return decodeEntities(text).trim() to mentions
        }

        private fun decodeEntities(text: String): String =
            text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
                .replace("&amp;", "&")

        private fun collapseGalleries(entries: List<ChatEntry>): List<ChatEntry> {
            fun isCandidate(entry: ChatEntry): Boolean {
                val image = entry.kind as? ChatEntry.Kind.Image ?: return false
                return entry.replyTo == null && image.media.mimetype != "image/svg+xml" && image.media.caption == null
            }
            fun day(instant: Instant) = instant.atZone(ZoneId.systemDefault()).toLocalDate()
            val result = mutableListOf<ChatEntry>()
            var index = 0
            while (index < entries.size) {
                var entry = entries[index]
                if (!isCandidate(entry)) {
                    result += entry
                    index++
                    continue
                }
                val group = mutableListOf(entry)
                var next = index + 1
                while (next < entries.size && isCandidate(entries[next]) &&
                    entries[next].sender == entry.sender &&
                    entries[next].timestamp.toEpochMilli() - group.last().timestamp.toEpochMilli() < GROUPING_INTERVAL_MS &&
                    day(entries[next].timestamp) == day(entry.timestamp)
                ) {
                    group += entries[next]
                    next++
                }
                if (group.size >= 2) {
                    entry = entry.copy(galleryItems = group, readBy = emptyList(), readAt = emptyMap())
                    for (image in group) entry = entry.mergeReceipts(image.readBy, image.readAt)
                }
                result += entry
                index = if (group.size >= 2) next else index + 1
            }
            return result
        }

        private fun quote(reply: ReplyPreview): ChatEntry.ReplyQuote = when (reply) {
            is ReplyPreview.Ready -> ChatEntry.ReplyQuote(reply.eventId, reply.senderName ?: reply.sender, reply.summary, reply.sender)
            is ReplyPreview.Unavailable -> ChatEntry.ReplyQuote(reply.eventId, "", "")
            is ReplyPreview.Pending -> ChatEntry.ReplyQuote(reply.eventId, "", "")
        }

        private fun decryptionMessage(reason: String): String = when (reason) {
            "sentBeforeWeJoined" -> L10n.format("timeline.decryptBeforeJoined")
            "verificationViolation" -> L10n.format("timeline.decryptSenderIdentityReset")
            "unsignedDevice", "unknownDevice" -> L10n.format("timeline.decryptUnverifiedSender")
            "withheldForUnverifiedOrInsecureDevice", "withheldBySender" -> L10n.format("timeline.decryptWithheld")
            "historicalMessageAndDeviceIsUnverified" -> L10n.format("timeline.decryptUnverifiedSession")
            else -> L10n.format("timeline.couldNotDecrypt")
        }

        private fun describe(membership: EntryContent.Membership, sender: String): String? {
            val name = membership.displayName ?: membership.userId
            // The core passes the SDK's membership change names through
            return when (membership.change) {
                "Joined", "InvitationAccepted" -> plain("timeline.userJoined", name)
                "Left" -> plain("timeline.userLeft", name)
                "KickedAndBanned" -> plain("timeline.userBanned", name)
                "Kicked" -> plain("timeline.userKicked", name, sender)
                else -> null
            }
        }

        /** The text without its rich-text tags (`<name>...</name>`) */
        private fun plain(key: String, vararg args: Any): String =
            L10n.format(key, *args).replace(Regex("</?(name|user|kicker)>"), "")
    }
}

fun readableError(error: Throwable): String {
    val message = error.message.orEmpty()
    val network = message.contains("error sending request", ignoreCase = true) ||
        message.contains("timed out", ignoreCase = true) ||
        error is java.io.IOException
    return when {
        network -> L10n.format("common.connectionFailed")
        message.isNotBlank() -> message
        else -> L10n.format("common.somethingWentWrong")
    }
}
