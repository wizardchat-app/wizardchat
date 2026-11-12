package org.wizardchat.android.ui.composer

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.content.MediaType
import androidx.compose.foundation.content.consume
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.content.hasMediaType
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.OutputTransformation
import androidx.compose.foundation.text.input.TextFieldBuffer
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.sp
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalSession
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.Emoji
import org.wizardchat.android.matrix.MediaMetadata
import org.wizardchat.android.matrix.PacksStore
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.emoticons
import org.wizardchat.android.matrix.text
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.room.EmojiText
import org.wizardchat.android.ui.room.RoomLinks
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.withNameColors
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Member
import org.wizardchat.core.Mentions
import org.wizardchat.core.PackImage
import org.wizardchat.core.RichBlock
import org.wizardchat.core.RichSpan
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** A file waiting in the composer's tray until the message is sent */
data class PendingAttachment(val file: File, val thumbnail: Bitmap?, val isVideo: Boolean, val id: Long = nextId++) {
    private companion object {
        var nextId = 0L
    }
}

private sealed interface Suggestion {
    data class MemberItem(val member: Member) : Suggestion
    data class RoomItem(val name: String, val avatarUrl: String?, val detail: String?, val link: String) : Suggestion
    data class EmojiItem(val emoji: Emoji) : Suggestion
    data class Custom(val image: PackImage) : Suggestion
    data class Command(val name: String, val description: String) : Suggestion
}

/**
 * The message bar under the timeline: draft (saved per room), mention, emoji and command
 * suggestions, reply/edit banners, attachments, formatting, voice messages, stickers and GIFs.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ComposerView(
    timeline: TimelineModel,
    room: RoomSummary,
    replyTo: ChatEntry?,
    onReplyToChange: (ChatEntry?) -> Unit,
    editing: ChatEntry?,
    onEditingChange: (ChatEntry?) -> Unit,
    onTyping: (Boolean) -> Unit,
    threadRoot: String? = null,
) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }

    val draft = rememberTextFieldState()
    val attachments = remember { mutableStateListOf<PendingAttachment>() }
    val packStore = remember { PacksStore() }
    val usedEmotes = remember { mutableStateMapOf<String, PackImage>() }
    val mentions = remember { HashMap<String, String>() }
    val roomLinks = remember { HashMap<String, String>() }
    var members by remember { mutableStateOf(listOf<Member>()) }
    var pickerTab by remember { mutableStateOf<MediaPickerTab?>(null) }
    var plusMenu by remember { mutableStateOf(false) }
    var clipboardHasImages by remember { mutableStateOf(false) }
    var showPoll by remember { mutableStateOf(false) }
    var showLocation by remember { mutableStateOf(false) }
    val recorder = remember { VoiceRecorder(context.applicationContext, scope) }
    var focused by remember { mutableStateOf(false) }
    // The formatting bar stays open, picked from the + menu (it also shows while text is selected)
    var formatting by remember { mutableStateOf(false) }
    var preparing by remember { mutableIntStateOf(0) }

    val text = draft.text.toString()
    val trimmed = text.trim()
    val canSend = (trimmed.isNotEmpty() || attachments.isNotEmpty() || editing?.editableMedia != null) && preparing == 0
    val isRecording = recorder.state == VoiceRecorder.State.recording || recorder.state == VoiceRecorder.State.paused
    val hasSelection = !draft.selection.collapsed
    val draftKey = threadRoot?.let { "draft.${room.id}.$it" } ?: "draft.${room.id}"

    val currentEditing by rememberUpdatedState(editing)
    val currentOnTyping by rememberUpdatedState(onTyping)
    val currentReplyTo by rememberUpdatedState(replyTo)

    fun focus(on: Boolean) {
        if (on) runCatching { focusRequester.requestFocus() } else focusManager.clearFocus()
    }

    fun setDraft(value: String) = draft.setTextAndPlaceCursorAtEnd(value)

    fun addUri(uri: Uri, keepName: Boolean) {
        preparing += 1
        scope.launch {
            try {
                val resolver = context.contentResolver
                val mime = resolver.getType(uri)
                val data = withContext(Dispatchers.IO) { runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() }
                    ?: return@launch
                val isImage = mime?.startsWith("image/") == true
                val isVideo = mime?.startsWith("video/") == true
                val ext = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
                    ?: if (isImage) "jpg" else "bin"
                val original = if (keepName) displayName(context, uri) else null
                val name = original ?: "${if (isVideo) "video" else if (isImage) "image" else "file"}-${System.currentTimeMillis()}.$ext"
                val file = MediaMetadata.temporaryCopy(data, name)
                attachments.add(PendingAttachment(file, if (isImage) thumbnail(data) else null, isVideo))
            } finally {
                preparing = maxOf(preparing - 1, 0)
            }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        uris.forEach { addUri(it, keepName = false) }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { addUri(it, keepName = true) }
    }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = cameraUri
        if (saved && uri != null) addUri(uri, keepName = false)
    }
    fun launchCamera() {
        val file = File(context.cacheDir, "camera-${System.currentTimeMillis()}.jpg")
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        cameraUri = uri
        takePicture.launch(uri)
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera()
    }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) recorder.start() else recorder.state = VoiceRecorder.State.denied
    }

    fun startRecording() {
        recorder.state = VoiceRecorder.State.requesting
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            recorder.start()
        } else {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun pasteImages() {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = clipboard.primaryClip ?: return
        for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let { addUri(it, keepName = false) }
    }

    val currentToken = text.split(" ").lastOrNull()?.takeIf { it.isNotEmpty() && !it.contains("\n") }
    val suggestions: List<Suggestion> = when {
        text.startsWith("/") && !text.contains(" ") -> {
            val query = text.drop(1).lowercase()
            SlashCommand.all.filter { it.name.startsWith(query) }.map { Suggestion.Command(it.name, it.description) }
        }
        currentToken == null -> emptyList()
        currentToken.startsWith("@") && currentToken.length >= 2 -> {
            val query = currentToken.drop(1)
            members.filter {
                (it.displayName ?: "").contains(query, ignoreCase = true) || it.userId.contains(query, ignoreCase = true)
            }.take(6).map { Suggestion.MemberItem(it) }
        }
        currentToken.startsWith("#") && !currentToken.drop(1).contains("#") -> {
            val query = currentToken.drop(1)
            val roomList = session.roomList
            val rooms = roomList?.joinedRooms.orEmpty()
                .filter { !it.isDirect && !it.isInvite && !it.isTombstoned }
                .map { Suggestion.RoomItem(it.displayName, it.avatarUrl, if (it.isSpace) tr("explore.typeSpace") else it.canonicalAlias, RoomLinks.link(it)) }
            val spaces = roomList?.allSpaces.orEmpty()
                .filter { space -> rooms.none { it.link.contains(space.id) } }
                .map { Suggestion.RoomItem(it.name, it.avatarUrl, tr("explore.typeSpace"), RoomLinks.link(it)) }
            (rooms + spaces)
                .filter { it.name.contains(query, ignoreCase = true) || it.detail?.contains(query, ignoreCase = true) == true }
                .sortedByDescending { it.name.startsWith(query, ignoreCase = true) }
                .take(6)
        }
        currentToken.startsWith(":") && currentToken.length >= 3 && !currentToken.drop(1).contains(":") -> {
            val query = currentToken.drop(1)
            val custom = packStore.packs.flatMap { pack -> pack.images.filter { it.emoticon && it.shortcode.contains(query, ignoreCase = true) } }
                .take(4).map { Suggestion.Custom(it) }
            val emoji = Emoji.all.filter { emoji -> emoji.s.any { it.startsWith(query.lowercase()) } }.take(6).map { Suggestion.EmojiItem(it) }
            custom + emoji
        }
        else -> emptyList()
    }

    fun apply(suggestion: Suggestion) {
        if (suggestion is Suggestion.Command) {
            setDraft("/${suggestion.name} ")
            return
        }
        val token = currentToken ?: return
        val base = text.dropLast(token.length)
        when (suggestion) {
            is Suggestion.MemberItem -> {
                val name = suggestion.member.displayName ?: suggestion.member.userId
                mentions[name] = suggestion.member.userId
                setDraft("$base$name ")
            }
            is Suggestion.RoomItem -> {
                val label = "#${suggestion.name}"
                roomLinks[label] = suggestion.link
                setDraft("$base$label ")
            }
            is Suggestion.EmojiItem -> setDraft("$base${suggestion.emoji.e} ")
            is Suggestion.Custom -> {
                usedEmotes[suggestion.image.shortcode] = suggestion.image
                setDraft("$base:${suggestion.image.shortcode}: ")
            }
            is Suggestion.Command -> Unit
        }
    }

    fun wrap(open: String, close: String, block: Boolean) {
        val selection = draft.selection
        val selected = text.substring(selection.min, selection.max)
        var before = text.substring(0, selection.min)
        if (block && before.isNotEmpty() && !before.endsWith("\n")) before += "\n"
        val after = text.substring(selection.max)
        val result = before + open + selected + close + after
        val cursor = before.length + open.length + selected.length + if (selected.isEmpty()) 0 else close.length
        draft.edit {
            replace(0, length, result)
            this.selection = TextRange(cursor)
        }
    }

    /** Prefixes each selected line, `prefix` getting its 1-based number */
    fun prefixLines(prefix: (Int) -> String) {
        val selection = draft.selection
        val lineStart = if (selection.min == 0) 0 else text.lastIndexOf('\n', selection.min - 1) + 1
        val lineEnd = text.indexOf('\n', selection.max).let { if (it < 0) text.length else it }
        val replaced = text.substring(lineStart, lineEnd).split("\n")
            .mapIndexed { index, line -> prefix(index + 1) + line }
            .joinToString("\n")
        draft.edit {
            replace(lineStart, lineEnd, replaced)
            this.selection = TextRange(lineStart + replaced.length)
        }
    }

    suspend fun send(message: String, reply: String?) {
        val links = roomLinks.filterKeys { message.contains(it) }.entries.sortedByDescending { it.key.length }
        val body = links.fold(message) { text, (label, link) -> text.replace(label, RoomLinks.target(link) ?: link) }
        val html = richHtml(body, usedEmotes, mentions, timeline.client, links.associate { (_, link) -> (RoomLinks.target(link) ?: link) to link })
        val userIds = mentions.filter { message.contains(it.key) && it.value != session.userId }.values.toSet().sorted()
        val room = Regex("(^|\\s)@room\\b").containsMatchIn(message)
        usedEmotes.clear()
        mentions.clear()
        roomLinks.clear()
        timeline.send(body, html = html, replyTo = reply, mentions = Mentions(userIds, if (room) true else null))
    }

    suspend fun submit() {
        val message = trimmed.let { if (WizardApplication.instance.prefs.emoticonsToEmoji) Emoticons.replace(it) else it }
        val reply = replyTo?.eventId
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        // The keyboard stays up so you can keep typing

        editing?.let { entry ->
            onEditingChange(null)
            setDraft("")
            val html = richHtml(message, usedEmotes, mentions, timeline.client)
            val userIds = mentions.filter { message.contains(it.key) && it.value != session.userId }.values.toSet().sorted()
            val room = Regex("(^|\\s)@room\\b").containsMatchIn(message)
            usedEmotes.clear()
            mentions.clear()
            timeline.edit(entry, message, html, Mentions(userIds, if (room) true else null))
            return
        }

        if (attachments.isNotEmpty()) {
            val pending = attachments.toList()
            attachments.clear()
            setDraft("")
            onReplyToChange(null)
            timeline.sendFiles(
                pending.map { Uri.fromFile(it.file) to it.thumbnail },
                caption = message.ifEmpty { null },
                replyTo = reply,
            )
            return
        }

        setDraft("")
        onReplyToChange(null)
        if (message.startsWith("/") && !message.startsWith("//")) {
            val result = SlashCommand.run(message, timeline, session, reply)
            if (result != null) {
                if (result == SlashCommand.Result.unknown) send(message, reply)
                return
            }
        }
        send(if (message.startsWith("//")) message.drop(1) else message, reply)
    }

    fun sentSomething() {
        onReplyToChange(null)
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        focus(false)
    }

    suspend fun sendSticker(sticker: PackImage) {
        val reply = currentReplyTo?.eventId
        val source = JsonObject(mapOf("url" to JsonPrimitive(sticker.url)))
        val info = runCatching { timeline.client.media(source) }.getOrNull()?.let { data ->
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            if (bounds.outWidth <= 0) return@let null
            val isGif = data.startsWith(0x47, 0x49, 0x46)
            buildJsonObject {
                put("w", bounds.outWidth)
                put("h", bounds.outHeight)
                put("size", data.size)
                put("mimetype", if (isGif) "image/gif" else if (data.startsWith(0x89, 0x50)) "image/png" else "image/webp")
                if (isAnimatedImage(data)) put("is_animated", true)
            }
        } ?: JsonObject(emptyMap())
        timeline.sendSticker(sticker.url, sticker.text, info, reply)
        sentSomething()
    }

    suspend fun sendGif(gif: GiphyGif) {
        val data = download(gif.url)
        val mxc = data?.let { runCatching { timeline.client.uploadMedia(it, "image/gif") }.getOrNull() }
        if (data == null || mxc == null) {
            timeline.sendError = L10n.format("composer.gifSendFailed")
            return
        }
        val info = buildJsonObject {
            put("mimetype", "image/gif")
            put("w", gif.width)
            put("h", gif.height)
            put("size", data.size)
        }
        timeline.sendSticker(mxc, gif.title.ifEmpty { "GIF" }, info, currentReplyTo?.eventId)
        sentSomething()
    }

    fun insertEmoji(emoji: String, image: PackImage?) {
        if (image != null) usedEmotes[image.shortcode] = image
        setDraft(draft.text.toString() + emoji)
    }

    LaunchedEffect(room.id) { packStore.load(session, room.id) }
    LaunchedEffect(room.id) { members = timeline.members() }
    LaunchedEffect(room.id) {
        if (draft.text.isEmpty() && currentEditing == null) composerDefaults.getString(draftKey, null)?.let { setDraft(it) }
        snapshotFlow { draft.text.toString() }.collect { value ->
            currentOnTyping(value.isNotEmpty())
            if (currentEditing == null) {
                if (value.isEmpty()) composerDefaults.edit().remove(draftKey).apply()
                else composerDefaults.edit().putString(draftKey, value).apply()
            }
        }
    }
    LaunchedEffect(editing?.id) {
        val entry = editing ?: return@LaunchedEffect
        val text = entry.editableText ?: return@LaunchedEffect
        usedEmotes.clear()
        usedEmotes.putAll(emotesIn(entry.rich.orEmpty()))
        mentions.clear()
        entry.mentions.forEach { mentions.putIfAbsent(it.label, it.userId) }
        setDraft(text)
        focus(true)
    }
    LaunchedEffect(replyTo?.id) { if (replyTo != null) focus(true) }
    LaunchedEffect(timeline.sendError) {
        if (timeline.sendError != null) {
            delay(5000)
            timeline.sendError = null
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
            .padding(horizontal = WZ.Space.space4)
            .padding(top = WZ.Space.space2, bottom = WZ.Space.space4)
            .animateContentSize(tween(WZ.MotionDuration.slow)),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        if (suggestions.isNotEmpty()) SuggestionList(suggestions, ::apply)
        if (timeline.loadFailed) {
            Notice(tr("timeline.loadFailed"), tr("common.retry")) { scope.launch { timeline.paginateBackwards() } }
        }
        timeline.sendError?.let { error ->
            Notice(error, modifier = Modifier.clickable { timeline.sendError = null })
        }
        if (isRecording) {
            RecordingBar(
                recorder,
                Modifier.floatingGlass(CircleShape, theme.bgTertiary),
                onSend = {
                    val result = recorder.finish()
                    if (result != null) {
                        val reply = replyTo?.eventId
                        sentSomething()
                        scope.launch { timeline.sendVoiceMessage(result.file, result.duration, result.waveform, reply) }
                    }
                },
            )
        } else {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                if (editing == null) {
                    Box {
                        Bubble("plus", tr("composer.attach")) {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboardHasImages = clipboard.primaryClipDescription?.hasMimeType("image/*") == true
                            plusMenu = true
                        }
                        WizardMenu(
                            plusMenu,
                            { plusMenu = false },
                            buildList {
                                add(MenuItem(tr("composer.photosVideos"), "images") {
                                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                                })
                                if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                                    add(MenuItem(tr("composer.camera"), "camera") {
                                        val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                                            PackageManager.PERMISSION_GRANTED
                                        if (granted) launchCamera() else cameraPermission.launch(Manifest.permission.CAMERA)
                                    })
                                }
                                add(MenuItem(tr("composer.file"), "file") { filePicker.launch(arrayOf("*/*")) })
                                if (clipboardHasImages) add(MenuItem(tr("composer.pasteImage"), "clipboard-text") { pasteImages() })
                                add(MenuItem(tr("composer.formatting.toolbar"), "text-aa", divider = true) {
                                    formatting = !formatting
                                    if (formatting) runCatching { focusRequester.requestFocus() }
                                })
                                add(MenuItem(tr("composer.poll.create"), "chart-bar-horizontal") { showPoll = true })
                                add(MenuItem(tr("composer.location.share"), "map-pin") { showLocation = true })
                                add(MenuItem(tr("composer.voice.record"), "microphone") { startRecording() })
                            },
                        )
                    }
                }
                Column(Modifier.weight(1f).floatingGlass(RoundedCornerShape(WZ.Radius.xl), theme.bgTertiary)) {
                    replyTo?.let { entry ->
                        ContextBar("arrow-bend-up-left", L10n.format("composer.replyingToName", entry.senderName), entry.summary, entry.rich?.emoticons().orEmpty(), entry.senderName to nameColor(entry.sender)) {
                            onReplyToChange(null)
                        }
                    }
                    editing?.let { entry ->
                        ContextBar("pencil-simple", tr("timeline.editing"), entry.summary, entry.rich?.emoticons().orEmpty()) {
                            onEditingChange(null)
                            setDraft("")
                        }
                    }
                    if (attachments.isNotEmpty() || preparing > 0) {
                        AttachmentTray(attachments, preparing) { attachment -> attachments.removeAll { it.id == attachment.id } }
                    }
                    if (formatting || (focused && hasSelection)) {
                        FormatBar(
                            Modifier.padding(horizontal = WZ.Space.space4).padding(top = WZ.Space.space2),
                            selectionHasLines = text.substring(draft.selection.min, draft.selection.max).contains('\n'),
                            onWrap = ::wrap,
                            onPrefix = ::prefixLines,
                            onClose = if (formatting) ({ formatting = false }) else null,
                        )
                    }
                    InputField(
                        draft,
                        emotes = usedEmotes,
                        placeholder = when {
                            editing != null -> tr("composer.editMessage")
                            threadRoot != null -> tr("timeline.threadComposerPlaceholder")
                            else -> L10n.format("composer.messageRoom", room.displayName)
                        },
                        modifier = Modifier
                            .focusRequester(focusRequester)
                            .onFocusChanged { focused = it.isFocused }
                            .contentReceiver { content ->
                                if (content.hasMediaType(MediaType.Text) && !content.hasMediaType(MediaType.Image)) return@contentReceiver content
                                content.consume { item ->
                                    val uri = item.uri ?: return@consume false
                                    addUri(uri, keepName = false)
                                    true
                                }
                            },
                    )
                }
                AnimatedContent(
                    canSend || editing != null,
                    transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
                    label = "send",
                ) { showSend ->
                    if (showSend) {
                        val label = if (editing == null) tr("composer.send") else tr("composer.saveEdit")
                        Box(
                            Modifier
                                .size(WZ.Space.space10)
                                .alpha(if (canSend) 1f else 0.5f)
                                .clip(CircleShape)
                                .background(theme.accent)
                                .clickable(enabled = canSend) { scope.launch { submit() } }
                                .semantics { contentDescription = label },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (editing == null) {
                                PhIcon("paper-plane-right", PhWeight.fill, size = WZ.SizeIcon.md, tint = theme.textOnAccent)
                            } else {
                                PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.md, tint = theme.textOnAccent)
                            }
                        }
                    } else {
                        Bubble("sticker", tr("room.settings.widgets.stickers"), iconSize = WZ.Space.space7) {
                            pickerTab = MediaPickerTab.stickers
                        }
                    }
                }
            }
        }
    }

    pickerTab?.let { tab ->
        MediaPicker(
            tab = tab,
            store = packStore,
            onEmoji = ::insertEmoji,
            onSticker = { sticker -> scope.launch { sendSticker(sticker) } },
            onGif = { gif -> sendGif(gif) },
            onDismiss = { pickerTab = null },
        )
    }
    if (showPoll) {
        PollCreatorSheet(
            onSend = { question, answers, disclosed -> timeline.createPoll(question, answers, disclosed) },
            onDismiss = { showPoll = false },
        )
    }
    if (showLocation) {
        LocationShareSheet(
            onSend = { lat, lon, note ->
                timeline.sendLocation(lat, lon, note, currentReplyTo?.eventId)
                onReplyToChange(null)
            },
            onDismiss = { showLocation = false },
        )
    }
}

/**
 * HTML only when the message has custom emoji or mentions (otherwise the core turns the Markdown
 * into HTML); its Markdown is rendered first so formatting isn't lost.
 */
internal suspend fun richHtml(
    text: String,
    emotes: Map<String, PackImage>,
    mentions: Map<String, String>,
    client: WizardClient,
    roomLinks: Map<String, String> = emptyMap(),
): String? {
    val usedEmotes = emotes.filter { text.contains(":${it.key}:") }
    val usedMentions = mentions.filter { text.contains(it.key) }
    val usedRooms = roomLinks.filter { text.contains(it.key) }
    if (usedEmotes.isEmpty() && usedMentions.isEmpty() && usedRooms.isEmpty()) return null
    var html = runCatching { client.markdownToHtml(text) }.getOrNull()
        ?: text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
    for ((name, userId) in usedMentions) {
        html = html.replace(name, "<a href=\"https://matrix.to/#/$userId\">$name</a>")
    }
    for ((label, link) in usedRooms.entries.sortedByDescending { it.key.length }) {
        html = html.replace(label, "<a href=\"$link\">$label</a>")
    }
    for ((code, image) in usedEmotes) {
        html = html.replace(
            ":$code:",
            "<img data-mx-emoticon height=\"32\" src=\"${image.url}\" alt=\":$code:\" title=\":$code:\">",
        )
    }
    return html
}

private fun ByteArray.startsWith(vararg bytes: Int) = size >= bytes.size && bytes.indices.all { this[it] == bytes[it].toByte() }

private fun displayName(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }
}.getOrNull()?.takeIf { it.isNotBlank() }

/** A small preview of an image for the attachment tray */
private suspend fun thumbnail(data: ByteArray): Bitmap? = withContext(Dispatchers.Default) {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 320) sample *= 2
    BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
}

@Composable
private fun Bubble(icon: String, label: String, iconSize: Dp = WZ.SizeIcon.md, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10)
            .floatingGlass(CircleShape, theme.bgTertiary)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, size = iconSize, tint = theme.textPrimary)
    }
}

internal fun emotesIn(blocks: List<RichBlock>): Map<String, PackImage> =
    blocks.emoticons().entries.associate { (text, url) ->
        val code = text.trim(':')
        code to PackImage(shortcode = code, url = url, emoticon = true, sticker = false)
    }

private val shortcodePattern = Regex(":([^\\s:]+):")

private class EmojiOutput(private val emotes: Map<String, PackImage>) : OutputTransformation {
    override fun TextFieldBuffer.transformOutput() {
        if (emotes.isEmpty()) return
        for (match in shortcodePattern.findAll(originalText).toList().asReversed()) {
            if (match.groupValues[1] in emotes) replace(match.range.first, match.range.last + 1, EMOJI_SPACE)
        }
    }
}

private const val EMOJI_SPACE = "\u2003"

@Composable
private fun InputField(state: TextFieldState, emotes: Map<String, PackImage>, placeholder: String, modifier: Modifier = Modifier) {
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val density = LocalDensity.current
    val output = remember(emotes.keys.toSet()) { EmojiOutput(emotes.toMap()) }
    BasicTextField(
        state,
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space10)
            .padding(vertical = WZ.Space.space5, horizontal = WZ.Space.space6),
        textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
        lineLimits = TextFieldLineLimits.MultiLine(maxHeightInLines = 6),
        outputTransformation = output,
        onTextLayout = { result -> layout = result() },
        cursorBrush = SolidColor(theme.accent),
        decorator = { inner ->
            Box {
                if (state.text.isEmpty()) {
                    Text(placeholder, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                inner()
                val result = layout
                if (result != null && emotes.isNotEmpty()) {
                    val shown = result.layoutInput.text.text
                    var offset = 0
                    val codes = shortcodePattern.findAll(state.text).map { it.groupValues[1] }.filter { it in emotes }.toList()
                    for (code in codes) {
                        val index = shown.indexOf(EMOJI_SPACE, offset).takeIf { it >= 0 } ?: break
                        offset = index + 1
                        val box = result.getBoundingBox(index)
                        val size = with(density) { minOf(box.width, box.height).toDp() }
                        PackThumb(
                            emotes.getValue(code).url,
                            Modifier
                                .offset { IntOffset(box.left.toInt(), (box.top + (box.height - size.toPx()) / 2).toInt()) }
                                .size(size),
                            rounded = false,
                        )
                    }
                }
            }
        },
    )
}

@Composable
private fun FormatBar(
    modifier: Modifier,
    selectionHasLines: Boolean,
    onWrap: (String, String, Boolean) -> Unit,
    onPrefix: ((Int) -> String) -> Unit,
    onClose: (() -> Unit)?,
) {
    // The same options as the web's toolbar, written as the Markdown sending turns into formatting
    Row(modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
        FormatButton("text-b", tr("composer.formatting.bold")) { onWrap("**", "**", false) }
        FormatButton("text-italic", tr("composer.formatting.italic")) { onWrap("_", "_", false) }
        FormatButton("text-strikethrough", tr("composer.formatting.strikethrough")) { onWrap("~~", "~~", false) }
        FormatButton("code", tr("composer.formatting.code")) {
            if (selectionHasLines) onWrap("```\n", "\n```", true) else onWrap("`", "`", false)
        }
        FormatButton("text-h", tr("composer.formatting.heading")) { onPrefix { "# " } }
        FormatButton("list-bullets", tr("composer.formatting.bulletList")) { onPrefix { "- " } }
        FormatButton("list-numbers", tr("composer.formatting.numberedList")) { onPrefix { "$it. " } }
        FormatButton("quotes", tr("composer.formatting.quote")) { onPrefix { "> " } }
        FormatButton("link", tr("composer.formatting.link")) { onWrap("[", "](https://)", false) }
        if (onClose != null) FormatButton("x", tr("common.close"), tint = theme.textMuted, onClick = onClose)
    }
}

@Composable
private fun FormatButton(icon: String, label: String, tint: Color = theme.textPrimary, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10, WZ.Space.space9)
            .clip(RoundedCornerShape(WZ.Radius.md))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = tint)
    }
}

@Composable
private fun ContextBar(icon: String, title: String, text: String, emotes: Map<String, String>, name: Pair<String, Color>? = null, onClose: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space5)
            .padding(top = WZ.Space.space4, bottom = WZ.Space.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon(icon, tint = theme.accent)
        Column(Modifier.weight(1f)) {
            Text(
                withNameColors(title, listOfNotNull(name)),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.accent,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            EmojiText(text, emotes, wizardFont(WZ.FontSize.sm), theme.textMuted, maxLines = 1)
        }
        Box(Modifier.clip(CircleShape).clickable(onClick = onClose)) {
            PhIcon("x-circle", size = WZ.SizeIcon.md, tint = theme.textMuted, contentDescription = tr("common.cancel"))
        }
    }
}

@Composable
private fun AttachmentTray(attachments: List<PendingAttachment>, preparing: Int, onRemove: (PendingAttachment) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = WZ.Space.space5)
            .padding(top = WZ.Space.space5),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        attachments.forEach { attachment ->
            Box {
                Box(
                    Modifier.size(WZ.SizeAvatar.xl).clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.fill),
                    contentAlignment = Alignment.Center,
                ) {
                    val thumb = attachment.thumbnail
                    if (thumb != null) {
                        Image(thumb.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    } else {
                        Column(
                            Modifier.padding(WZ.Space.space3),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                        ) {
                            if (attachment.isVideo) {
                                PhIcon("video-camera", PhWeight.regular, size = WZ.SizeIcon.md, tint = theme.textMuted)
                            } else {
                                PhIcon("file", size = WZ.SizeIcon.md, tint = theme.textMuted)
                            }
                            Text(attachment.file.name, style = wizardFont(WZ.FontSize.xs), color = theme.textMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = WZ.Space.space3, y = -WZ.Space.space3)
                        .clip(CircleShape)
                        .background(theme.overlay)
                        .clickable { onRemove(attachment) },
                ) {
                    PhIcon("x-circle", size = WZ.SizeIcon.md, tint = theme.textOnAccent, contentDescription = tr("common.remove"))
                }
            }
        }
        repeat(preparing) {
            val label = tr("composer.preparing")
            Box(
                Modifier
                    .size(WZ.SizeAvatar.xl)
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill)
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Spinner(color = theme.textMuted)
            }
        }
    }
}

@Composable
private fun Notice(text: String, action: String? = null, modifier: Modifier = Modifier, onAction: () -> Unit = {}) {
    Row(
        modifier
            .fillMaxWidth()
            .floatingGlass(RoundedCornerShape(WZ.Radius.xl), theme.bgTertiary)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon("warning-circle", size = WZ.SizeIcon.sm, tint = theme.danger)
        Text(text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.sm), color = theme.textPrimary)
        if (action != null) {
            Text(
                action,
                Modifier.clickable(onClick = onAction),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.accent,
            )
        }
    }
}

@Composable
private fun SuggestionList(suggestions: List<Suggestion>, onPick: (Suggestion) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .floatingGlass(RoundedCornerShape(WZ.Radius.xl), theme.bgTertiary)
            .padding(vertical = WZ.Space.space2),
    ) {
        suggestions.forEach { suggestion ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space10)
                    .clickable { onPick(suggestion) }
                    .padding(horizontal = WZ.Space.space5),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                when (suggestion) {
                    is Suggestion.MemberItem -> {
                        val member = suggestion.member
                        Avatar(member.displayName ?: member.userId, member.avatarUrl, WZ.SizeAvatar.sm)
                        Text(
                            member.displayName ?: member.userId,
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            member.userId,
                            Modifier.weight(1f, fill = false),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    is Suggestion.RoomItem -> {
                        Avatar(suggestion.name, suggestion.avatarUrl, WZ.SizeAvatar.sm)
                        Text(
                            suggestion.name,
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        suggestion.detail?.let {
                            Text(
                                it,
                                Modifier.weight(1f, fill = false),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    is Suggestion.EmojiItem -> {
                        Box(Modifier.widthIn(min = WZ.Space.space8), contentAlignment = Alignment.Center) {
                            Text(suggestion.emoji.e, fontSize = WZ.SizeIcon.lg.value.sp)
                        }
                        Text(
                            ":${suggestion.emoji.s.firstOrNull() ?: suggestion.emoji.label}:",
                            style = wizardFont(WZ.FontSize.md),
                            color = theme.textPrimary,
                            maxLines = 1,
                        )
                    }
                    is Suggestion.Custom -> {
                        PackThumb(suggestion.image.url, Modifier.size(WZ.Space.space8))
                        Text(":${suggestion.image.shortcode}:", style = wizardFont(WZ.FontSize.md), color = theme.textPrimary, maxLines = 1)
                    }
                    is Suggestion.Command -> {
                        Text(
                            "/${suggestion.name}",
                            Modifier.widthIn(min = WZ.SizeAvatar.xl),
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                        )
                        Text(
                            suggestion.description,
                            Modifier.weight(1f, fill = false),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RecordingBar(recorder: VoiceRecorder, modifier: Modifier, onSend: () -> Unit) {
    val recording = recorder.state == VoiceRecorder.State.recording
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.size(WZ.Space.space10).clip(CircleShape).clickable { recorder.cancel() }, contentAlignment = Alignment.Center) {
            PhIcon("trash", size = WZ.SizeIcon.md, tint = theme.error, contentDescription = tr("composer.voice.cancel"))
        }
        Box(Modifier.size(WZ.Space.space4).clip(CircleShape).background(if (recording) theme.danger else theme.textMuted))
        val seconds = recorder.elapsed.toInt()
        Text(
            "%d:%02d".format(seconds / 60, seconds % 60),
            style = wizardFont(WZ.FontSize.md).copy(fontFeatureSettings = "tnum"),
            color = theme.textPrimary,
        )
        RecordingWaveform(recorder.samples.takeLast(60), Modifier.weight(1f).height(WZ.Space.space8))
        Box(
            Modifier.size(WZ.Space.space9, WZ.Space.space10).clip(CircleShape).clickable { recorder.togglePause() },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon(
                if (recording) "pause" else "record",
                if (recording) PhWeight.fill else PhWeight.regular,
                size = WZ.SizeIcon.md,
                tint = theme.textMuted,
                contentDescription = if (recording) tr("composer.voice.pause") else tr("composer.voice.resume"),
            )
        }
        Box(Modifier.clip(CircleShape).clickable(onClick = onSend)) {
            PhIcon("arrow-circle-up", PhWeight.fill, size = WZ.SizeIcon.xl, tint = theme.accent, contentDescription = tr("composer.voice.send"))
        }
    }
}

private fun isAnimatedImage(data: ByteArray): Boolean {
    fun ascii(at: Int, text: String) = at + text.length <= data.size && text.indices.all { data[at + it] == text[it].code.toByte() }
    return when {
        ascii(0, "GIF") -> (0 until data.size - 1).count { data[it] == 0x21.toByte() && data[it + 1] == 0xF9.toByte() } > 1
        ascii(0, "RIFF") && ascii(8, "WEBPVP8X") -> data.size > 20 && data[20].toInt() and 0x02 != 0
        data.startsWith(0x89, 0x50) -> {
            val idat = (0 until data.size - 4).firstOrNull { ascii(it, "IDAT") } ?: data.size
            (0 until idat - 4).any { ascii(it, "acTL") }
        }
        else -> false
    }
}
