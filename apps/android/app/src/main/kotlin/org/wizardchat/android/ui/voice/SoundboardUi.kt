package org.wizardchat.android.ui.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Slider
import androidx.compose.material3.DropdownMenu
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.mutableFloatStateOf
import org.wizardchat.android.ui.composer.SearchBar
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.settings.SoundboardSettingsSection
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.SoundPack
import org.wizardchat.core.SoundPackSource
import org.wizardchat.core.SoundboardSound
import org.wizardchat.tokens.WZ

private val cachedPacks = mutableMapOf<String, List<SoundPack>>()

@Composable
internal fun SoundboardSheet(onDismiss: () -> Unit) {
    val calls = CallManager.shared
    val client = LocalSession.current.client
    val scope = rememberCoroutineScope()
    val roomId = calls.room?.id
    var packs by remember { mutableStateOf(cachedPacks[roomId ?: ""]) }
    var failed by remember { mutableStateOf(false) }
    var coolingDown by remember { mutableStateOf(false) }
    var showRoomPacks by remember { mutableStateOf(false) }

    suspend fun load() {
        if (client == null) return
        runCatching { client.soundboardPacks(roomId) }
            .onSuccess { list ->
                packs = list
                cachedPacks[roomId ?: ""] = list
                list.firstOrNull { it.source == SoundPackSource.frequent }?.sounds?.forEach { calls.soundboard?.prefetch(it.url) }
            }
            .onFailure { if (packs == null) failed = true }
    }
    LaunchedEffect(client, roomId) { load() }
    if (showRoomPacks && roomId != null) {
        RoomSoundPacksSheet(roomId) {
            showRoomPacks = false
            scope.launch { load() }
        }
    }
    LaunchedEffect(coolingDown) {
        if (!coolingDown) return@LaunchedEffect
        delay(Soundboard.COOLDOWN_MS)
        coolingDown = false
    }

    var search by remember { mutableStateOf("") }
    var showVolume by remember { mutableStateOf(false) }
    var volume by remember { mutableFloatStateOf(Soundboard.volume) }
    val listState = rememberLazyListState()

    val roomName = calls.room?.name ?: ""
    val sections: List<Pair<String, SoundPack?>>? = packs?.let { list ->
        val all = list.map<SoundPack, Pair<String, SoundPack?>> { soundPackTitle(it) to it }.toMutableList()
        if (list.none { it.source == SoundPackSource.room }) {
            all.add(list.indexOfFirst { it.source == SoundPackSource.builtIn } + 1, roomName to null)
        }
        val query = search.trim()
        if (query.isEmpty()) all
        else all.mapNotNull { (title, pack) ->
            if (pack == null || pack.source == SoundPackSource.frequent) return@mapNotNull null
            val titleMatches = title.contains(query, ignoreCase = true)
            val sounds = pack.sounds.filter {
                titleMatches || soundLabel(it).contains(query, ignoreCase = true) || it.shortcode.contains(query, ignoreCase = true)
            }
            if (sounds.isEmpty()) null else title to pack.copy(sounds = sounds)
        }
    }
    val play = { sound: SoundboardSound ->
        coolingDown = true
        calls.playSound(sound)
        scope.launch { runCatching { client?.recordSoundPlayed(sound.url) } }
        Unit
    }

    WizardSheet(onDismiss) {
        Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
            Text(
                tr("call.soundboard.title"),
                Modifier.align(Alignment.Center),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
            )
            Box(Modifier.align(Alignment.CenterEnd)) { BarTextButton(tr("common.done"), onDismiss, bold = true) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            SearchBar(search, { search = it }, tr("call.soundboard.search"), Modifier.weight(1f))
            val volumeLabel = tr("call.soundboard.volume")
            Box(
                Modifier
                    .padding(end = WZ.Space.space3)
                    .size(WZ.Space.space10)
                    .clip(CircleShape)
                    .clickable(onClickLabel = volumeLabel) { showVolume = true }
                    .semantics { contentDescription = volumeLabel },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon(
                    if (volume > 0f) "speaker-high" else "speaker-slash",
                    PhWeight.regular,
                    size = WZ.SizeIcon.md,
                    tint = if (showVolume) theme.accent else theme.textMuted,
                )
                DropdownMenu(
                    expanded = showVolume,
                    onDismissRequest = { showVolume = false },
                    shape = RoundedCornerShape(WZ.Radius.lg),
                    containerColor = theme.bgTertiary,
                ) {
                    Column(
                        Modifier.width(240.dp).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
                        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                    ) {
                        Text(volumeLabel, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                            PhIcon("speaker-none", tint = theme.textMuted)
                            Slider(
                                value = volume,
                                onValueChange = { volume = it },
                                onValueChangeFinished = { Soundboard.volume = volume },
                                modifier = Modifier.weight(1f),
                                colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent, inactiveTrackColor = theme.fill),
                            )
                            PhIcon("speaker-high", PhWeight.regular, tint = theme.textMuted)
                        }
                    }
                }
            }
        }
        if (search.isEmpty() && sections != null && sections.size > 1) {
            LazyRow(
                Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = WZ.Space.space5),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                itemsIndexed(sections) { index, (title, pack) ->
                    Box(
                        Modifier
                            .size(WZ.Space.space10)
                            .clip(CircleShape)
                            .clickable(onClickLabel = title) { scope.launch { listState.animateScrollToItem(index) } }
                            .semantics { contentDescription = title },
                        contentAlignment = Alignment.Center,
                    ) {
                        when {
                            pack == null -> PhIcon("hash", size = WZ.SizeIcon.md, tint = theme.textMuted)
                            pack.source == SoundPackSource.frequent -> PhIcon("clock", size = WZ.SizeIcon.md, tint = theme.textMuted)
                            else -> Text(
                                pack.sounds.firstOrNull()?.let { Soundboard.emoji(it.shortcode, it.emoji) } ?: "🔊",
                                style = wizardFont(WZ.FontSize.lg),
                            )
                        }
                    }
                }
            }
        }
        LazyColumn(
            Modifier.fillMaxWidth().heightIn(max = 360.dp),
            state = listState,
            contentPadding = PaddingValues(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            when {
                sections == null && !failed -> item {
                    val pulse by rememberInfiniteTransition(label = "skeleton").animateFloat(
                        1f, 0.4f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "pulse",
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        repeat(2) {
                            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                                repeat(4) {
                                    Box(
                                        Modifier
                                            .weight(1f)
                                            .height(76.dp)
                                            .alpha(pulse)
                                            .clip(RoundedCornerShape(WZ.Radius.md))
                                            .background(theme.fill),
                                    )
                                }
                            }
                        }
                    }
                }
                sections == null -> item {
                    Text(
                        tr("call.soundboard.failed"),
                        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space6),
                        style = wizardFont(WZ.FontSize.md),
                        color = theme.textMuted,
                        textAlign = TextAlign.Center,
                    )
                }
                sections.isEmpty() -> item {
                    Text(
                        tr("call.soundboard.noResults"),
                        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space6),
                        style = wizardFont(WZ.FontSize.md),
                        color = theme.textMuted,
                        textAlign = TextAlign.Center,
                    )
                }
                else -> items(sections) { (title, pack) ->
                    if (pack == null) EmptyRoomSection(title) { showRoomPacks = true }
                    else PackGrid(title, pack.sounds, !coolingDown, play)
                }
            }
            item {
                Text(
                    tr("call.soundboard.note"),
                    Modifier.fillMaxWidth().navigationBarsPadding(),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun EmptyRoomSection(roomName: String, onOpen: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        if (roomName.isNotEmpty()) {
            Text(roomName, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(tr("call.soundboard.noRoomSounds"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        Text(
            tr("room.settings.sounds.title"),
            Modifier.clickable(onClick = onOpen),
            style = wizardFont(WZ.FontSize.sm).copy(textDecoration = TextDecoration.Underline),
            color = theme.accent,
        )
    }
}

@Composable
private fun PackGrid(title: String, sounds: List<SoundboardSound>, enabled: Boolean, onPlay: (SoundboardSound) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        if (title.isNotEmpty()) {
            Text(
                title,
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        sounds.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                row.forEach { sound ->
                    Tile(Soundboard.emoji(sound.shortcode, sound.emoji), null, soundLabel(sound), enabled, Modifier.weight(1f)) { onPlay(sound) }
                }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun Tile(emoji: String?, icon: String?, label: String, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .heightIn(min = 76.dp)
            .clip(RoundedCornerShape(WZ.Radius.md))
            .background(theme.fill)
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.5f)
            .padding(WZ.Space.space3),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterVertically),
    ) {
        if (emoji != null) Text(emoji, style = wizardFont(WZ.FontSize.xxl))
        if (icon != null) PhIcon(icon, size = WZ.SizeIcon.lg, tint = theme.textMuted)
        Text(
            label,
            style = wizardFont(WZ.FontSize.xs),
            color = theme.textPrimary,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
