package org.wizardchat.android.ui.voice

import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.people.ActionRow
import org.wizardchat.android.ui.people.EmptyState
import org.wizardchat.android.ui.people.ErrorText
import org.wizardchat.android.ui.people.FormList
import org.wizardchat.android.ui.people.NavRow
import org.wizardchat.android.ui.people.SheetPage
import org.wizardchat.android.ui.people.TextFieldDialog
import org.wizardchat.android.ui.people.ToggleRow
import org.wizardchat.android.ui.people.errorText
import org.wizardchat.android.ui.settings.SettingsPage
import androidx.compose.foundation.layout.fillMaxHeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.android.ui.people.FormField
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import org.wizardchat.core.RoomSoundPacks
import org.wizardchat.core.SoundPack
import org.wizardchat.core.SoundPackSource
import org.wizardchat.core.SoundboardSound
import org.wizardchat.core.WizardError
import org.wizardchat.tokens.WZ

private val SOUND_TYPES = arrayOf("audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav")

internal fun soundPackTitle(pack: SoundPack): String = when (pack.source) {
    SoundPackSource.frequent -> L10n.format("call.soundboard.packs.frequent")
    SoundPackSource.builtIn -> L10n.format("call.soundboard.packs.builtIn")
    SoundPackSource.mine -> L10n.format("call.soundboard.packs.mine")
    else -> pack.name ?: ""
}

internal fun soundLabel(sound: SoundboardSound): String {
    sound.body?.let { return it }
    val key = "call.soundboard.sounds.${sound.shortcode}"
    return if (L10n.has(key)) L10n.format(key) else sound.shortcode
}

private fun soundErrorText(error: Throwable): String {
    if (error is WizardError && error.code == "invalidSound") {
        val key = "call.soundboard.errors.${error.message}"
        return L10n.format(if (L10n.has(key)) key else "call.soundboard.errors.unsupported")
    }
    return errorText(error)
}

private class PickedSound(val data: ByteArray, val mimetype: String, val durationMs: Int, val name: String)

private suspend fun readSound(context: Context, uri: Uri): PickedSound? = withContext(Dispatchers.IO) {
    runCatching {
        val resolver = context.contentResolver
        val data = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
        val duration = MediaMetadataRetriever().run {
            try {
                setDataSource(context, uri)
                extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toIntOrNull() ?: 0
            } finally {
                release()
            }
        }
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: ""
        PickedSound(data, resolver.getType(uri) ?: "audio/mpeg", duration, name.substringBeforeLast('.'))
    }.getOrNull()
}

internal fun soundShortcode(name: String): String =
    name.lowercase().map { if (it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_') it else '_' }
        .joinToString("").split('_').filter { it.isNotEmpty() }.joinToString("_").take(96).ifEmpty { "sound" }

@Composable
internal fun SoundPackEditorScreen(
    roomId: String?,
    initial: SoundPack,
    canEdit: Boolean,
    onBack: () -> Unit,
    onSaved: () -> Unit = {},
    onDelete: (suspend () -> Unit)? = null,
) {
    val client = LocalSession.current.client ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(initial.name ?: "") }
    var attribution by remember { mutableStateOf(initial.attribution ?: "") }
    var sounds by remember { mutableStateOf(initial.sounds) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var previewing by remember { mutableStateOf<String?>(null) }
    var emojiFor by remember { mutableStateOf<Int?>(null) }
    var emojiText by remember { mutableStateOf("") }
    var nameFor by remember { mutableStateOf<Int?>(null) }
    var nameText by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }

    fun stop() {
        player?.release()
        player = null
        previewing = null
    }
    DisposableEffect(Unit) { onDispose { stop() } }

    fun toggle(sound: SoundboardSound) {
        val same = previewing == sound.url
        stop()
        if (same) return
        previewing = sound.url
        scope.launch {
            val data = runCatching { client.soundboardSound(sound.url) }.getOrNull()
            val next = data?.let {
                runCatching { MediaPlayer().apply { setDataSource(Soundboard.ByteSource(it)); prepare() } }.getOrNull()
            }
            if (next == null || previewing != sound.url) {
                next?.release()
                if (previewing == sound.url) previewing = null
                return@launch
            }
            next.setOnCompletionListener { if (player === it) stop() }
            player = next
            next.start()
        }
    }

    fun update(index: Int, change: (SoundboardSound) -> SoundboardSound) {
        sounds = sounds.mapIndexed { i, sound -> if (i == index) change(sound) else sound }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        uploading = true
        error = null
        scope.launch {
            for (uri in uris) {
                val picked = readSound(context, uri)
                if (picked == null) {
                    error = L10n.format("call.soundboard.errors.unsupported")
                    continue
                }
                try {
                    val uploaded = client.uploadSound(picked.data, picked.mimetype, picked.durationMs.toLong())
                    sounds = sounds + uploaded.copy(shortcode = soundShortcode(picked.name), body = picked.name.ifBlank { null })
                } catch (e: Exception) {
                    error = soundErrorText(e)
                }
            }
            uploading = false
        }
    }

    fun save() {
        saving = true
        error = null
        scope.launch {
            try {
                val used = mutableSetOf<String>()
                val named = sounds.map { sound ->
                    val body = sound.body?.trim().orEmpty()
                    val base = if (body.isEmpty()) sound.shortcode else soundShortcode(body)
                    var shortcode = base
                    var n = 2
                    while (shortcode in used) shortcode = "${base}_${n++}"
                    used += shortcode
                    sound.copy(shortcode = shortcode, body = body.ifEmpty { null })
                }
                client.saveSoundPack(roomId, initial.stateKey ?: "", name.trim(), attribution.trim().ifEmpty { null }, named)
                onSaved()
                onBack()
            } catch (e: Exception) {
                error = soundErrorText(e)
            } finally {
                saving = false
            }
        }
    }

    SheetPage {
        WizardTopBar(soundPackTitle(initial), onBack = onBack) {
            if (canEdit) BarTextButton(tr("common.save"), ::save, enabled = !saving && !uploading, bold = true)
        }
        FormList(Modifier.weight(1f)) {
            if (canEdit) {
                item {
                    GroupedSection(header = tr("room.settings.emojis.pack")) {
                        FormField(name, { name = it }, tr("room.settings.emojis.packName"))
                        RowDivider()
                        FormField(attribution, { attribution = it }, tr("room.settings.emojis.attribution"))
                    }
                }
            }
            item {
                GroupedSection(
                    header = "${tr("room.settings.sounds.sounds")} (${sounds.size})",
                    footer = if (canEdit) tr("call.soundboard.limits") else null,
                ) {
                    if (sounds.isEmpty()) GroupedRow(tr("room.settings.sounds.noSounds"), titleColor = theme.textMuted)
                    sounds.forEachIndexed { index, sound ->
                        if (index > 0) RowDivider()
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                        ) {
                            Box(
                                Modifier
                                    .size(WZ.Space.space11)
                                    .clip(RoundedCornerShape(WZ.Radius.md))
                                    .background(theme.fill)
                                    .clickable(enabled = canEdit, onClickLabel = tr("room.settings.sounds.emoji")) {
                                        emojiText = sound.emoji ?: ""
                                        emojiFor = index
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(Soundboard.emoji(sound.shortcode, sound.emoji), style = wizardFont(WZ.FontSize.xl))
                            }
                            Column(
                                Modifier.weight(1f).clickable(enabled = canEdit) {
                                    nameText = sound.body ?: ""
                                    nameFor = index
                                },
                            ) {
                                Text(soundLabel(sound), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            val playing = previewing == sound.url
                            IconAction(
                                if (playing) "stop" else "play",
                                PhWeight.fill,
                                tr(if (playing) "call.soundboard.stopPreview" else "call.soundboard.preview"),
                                theme.textMuted,
                            ) { toggle(sound) }
                            if (canEdit) {
                                IconAction("trash", PhWeight.regular, tr("room.settings.sounds.removeSound"), theme.danger) {
                                    sounds = sounds.filterIndexed { i, _ -> i != index }
                                }
                            }
                        }
                    }
                    if (canEdit) {
                        RowDivider()
                        ActionRow(tr("room.settings.sounds.addSounds"), "plus", { pick.launch(SOUND_TYPES) }, enabled = !uploading)
                    }
                }
            }
            item { ErrorText(error) }
            if (canEdit && onDelete != null) {
                item {
                    GroupedSection {
                        ActionRow(tr("room.settings.sounds.deletePack"), "trash", { confirmDelete = true }, color = theme.danger)
                    }
                }
            }
        }
    }

    emojiFor?.let { index ->
        TextFieldDialog(
            tr("room.settings.sounds.emoji"), emojiText, { emojiText = it }, "🔊", tr("common.save"),
            onConfirm = { update(index) { it.copy(emoji = emojiText.trim().take(8).ifEmpty { null }) } },
            onDismiss = { emojiFor = null },
        )
    }
    nameFor?.let { index ->
        TextFieldDialog(
            tr("room.settings.sounds.name"), nameText, { nameText = it }, tr("room.settings.sounds.name"), tr("common.save"),
            onConfirm = { update(index) { it.copy(body = nameText.trim().ifEmpty { null }) } },
            onDismiss = { nameFor = null },
        )
    }
    if (confirmDelete) {
        ConfirmDialog(
            tr("room.settings.sounds.deletePack"),
            tr("room.settings.sounds.deletePack"),
            onConfirm = {
                scope.launch {
                    onDelete?.invoke()
                    onBack()
                }
            },
            onDismiss = { confirmDelete = false },
            message = L10n.format("room.settings.sounds.deletePackConfirm", name.ifBlank { soundPackTitle(initial) }),
        )
    }
}

@Composable
private fun IconAction(icon: String, weight: PhWeight, label: String, tint: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10)
            .clip(CircleShape)
            .clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, weight, size = WZ.SizeIcon.md, tint = tint)
    }
}

@Composable
internal fun RoomSoundPacksSheet(roomId: String, onDismiss: () -> Unit) {
    var editing by remember { mutableStateOf<Pair<SoundPack, Boolean>?>(null) }
    val client = LocalSession.current.client
    WizardSheet(onDismiss) {
        Box(Modifier.fillMaxHeight(0.9f)) {
            val open = editing
            if (open == null) {
                RoomSoundPacksScreen(roomId, onDismiss) { pack, canEdit -> editing = pack to canEdit }
            } else {
                SoundPackEditorScreen(roomId, open.first, open.second, onBack = { editing = null }, onDelete = {
                    runCatching { client?.deleteSoundPack(roomId, open.first.stateKey ?: "") }
                })
            }
        }
    }
}

@Composable
internal fun SoundboardSettings(onBack: (() -> Unit)?, onDone: (() -> Unit)? = null) {
    val client = LocalSession.current.client
    val scope = rememberCoroutineScope()
    var mine by remember { mutableStateOf<SoundPack?>(null) }
    var editing by remember { mutableStateOf(false) }
    var packs by remember { mutableStateOf<List<SoundPack>?>(null) }
    var showSelectPacks by remember { mutableStateOf(false) }

    suspend fun loadMine() {
        mine = client?.let { runCatching { it.mySounds() }.getOrNull() }
    }
    LaunchedEffect(client) {
        loadMine()
        packs = client?.let { runCatching { it.favoriteSoundPacks() }.getOrNull() } ?: emptyList()
    }

    fun toggle(pack: SoundPack) {
        val roomId = pack.roomId ?: return
        val stateKey = pack.stateKey ?: return
        val everywhere = !pack.everywhere
        fun set(value: Boolean) {
            val rest = packs.orEmpty().filter { it.id != pack.id }
            packs = if (value) rest + pack.copy(everywhere = true) else rest
        }
        set(everywhere)
        scope.launch {
            runCatching { client?.setSoundPackEverywhere(roomId, stateKey, everywhere) }.onFailure { set(!everywhere) }
        }
    }

    val current = mine
    if (editing && current != null) {
        SoundPackEditorScreen(null, current, canEdit = true, onBack = { editing = false }, onSaved = { scope.launch { loadMine() } })
        return
    }
    SettingsPage(tr("settings.soundboard.title"), onBack, onDone) {
        GroupedSection(header = tr("settings.soundboard.defaultPack"), footer = tr("settings.soundboard.defaultPackNote")) {
            val first = current?.sounds?.firstOrNull()
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = current != null) { editing = true }
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            ) {
                Text(first?.let { Soundboard.emoji(it.shortcode, it.emoji) } ?: "🔊", style = wizardFont(WZ.FontSize.xl))
                Column(Modifier.weight(1f)) {
                    Text(current?.name ?: tr("call.soundboard.packs.mine"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                    Text(trPlural("room.settings.sounds.soundCount", current?.sounds?.size ?: 0, current?.sounds?.size ?: 0), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                }
                PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
            }
        }
        val favorites = packs.orEmpty()
        GroupedSection(header = tr("settings.soundboard.favoritePacks"), footer = tr("settings.soundboard.favoritePacksNote")) {
            if (packs == null) {
                GroupedRow(tr("call.soundboard.loading"), titleColor = theme.textMuted)
            } else if (favorites.isEmpty()) {
                GroupedRow(tr("settings.emojisStickers.noFavoritePacks"), titleColor = theme.textMuted)
            }
            favorites.forEachIndexed { index, pack ->
                if (index > 0) RowDivider()
                GroupedRow(pack.name ?: "", subtitle = pack.roomName ?: pack.roomId) {
                    IconAction("star", PhWeight.fill, tr("settings.emojisStickers.removeFavorite"), theme.accent) { toggle(pack) }
                }
            }
            RowDivider()
            ActionRow(tr("settings.emojisStickers.selectPacks"), "plus", { showSelectPacks = true })
        }
    }

    if (showSelectPacks) {
        var all by remember { mutableStateOf<List<SoundPack>?>(null) }
        LaunchedEffect(Unit) { all = client?.let { runCatching { it.allSoundPacks() }.getOrNull() } ?: emptyList() }
        WizardSheet({ showSelectPacks = false }) {
            SheetTopBar(tr("settings.emojisStickers.selectPacks"), trailing = { BarTextButton(tr("common.done"), { showSelectPacks = false }, bold = true) })
            FormList {
                item {
                    GroupedSection {
                        val list = all
                        if (list == null) {
                            GroupedRow(tr("call.soundboard.loading"), titleColor = theme.textMuted)
                        } else if (list.isEmpty()) {
                            GroupedRow(tr("settings.emojisStickers.noPacksFound"), titleColor = theme.textMuted)
                        }
                        list.orEmpty().map { listed -> listed.copy(everywhere = packs.orEmpty().any { it.id == listed.id }) }.forEachIndexed { index, pack ->
                            if (index > 0) RowDivider()
                            GroupedRow(pack.name ?: "", subtitle = pack.roomName ?: pack.roomId, onClick = { toggle(pack) }) {
                                PhIcon(
                                    "star",
                                    if (pack.everywhere) PhWeight.fill else PhWeight.regular,
                                    size = WZ.SizeIcon.md,
                                    tint = if (pack.everywhere) theme.accent else theme.textMuted,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun RoomSoundPacksScreen(roomId: String, onBack: () -> Unit, onOpenPack: (SoundPack, Boolean) -> Unit) {
    val client = LocalSession.current.client
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<RoomSoundPacks?>(null) }
    var showNewPack by remember { mutableStateOf(false) }
    var newPackName by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        data = client?.let { runCatching { it.roomSoundPacks(roomId) }.getOrNull() } ?: RoomSoundPacks(false, emptyList())
    }
    LaunchedEffect(roomId) { load() }

    fun create() {
        val name = newPackName.trim()
        newPackName = ""
        if (name.isEmpty() || client == null) return
        scope.launch {
            runCatching { client.createSoundPack(roomId, name) }
                .onSuccess { error = null }
                .onFailure { error = L10n.format("room.settings.sounds.createFailed", errorText(it)) }
            load()
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.sounds.title"), onBack = onBack)
        val current = data
        FormList(Modifier.weight(1f)) {
            if (current != null && current.packs.isEmpty() && !current.canEdit) {
                item { EmptyState(tr("room.settings.sounds.noPacks"), "vinyl-record", Modifier.padding(top = WZ.Space.space12)) }
            } else if (current != null) {
                item {
                    GroupedSection(footer = tr("room.settings.sounds.description")) {
                        current.packs.forEachIndexed { index, pack ->
                            if (index > 0) RowDivider()
                            NavRow(pack.name ?: "", "vinyl-record", { onOpenPack(pack, current.canEdit) }, value = "${pack.sounds.size}")
                        }
                        if (current.canEdit) {
                            if (current.packs.isNotEmpty()) RowDivider()
                            ActionRow(tr("room.settings.sounds.createPack"), "plus", { showNewPack = true })
                        }
                    }
                }
                item { ErrorText(error) }
            }
        }
    }

    if (showNewPack) {
        TextFieldDialog(
            tr("room.settings.sounds.createPack"),
            newPackName,
            { newPackName = it },
            tr("room.settings.sounds.packNamePlaceholder"),
            tr("common.create"),
            onConfirm = ::create,
            onDismiss = { showNewPack = false },
        )
    }
}
