package org.wizardchat.android.ui.composer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.Emoji
import org.wizardchat.android.matrix.ImagePack
import org.wizardchat.android.matrix.PacksStore
import org.wizardchat.android.matrix.RecentEmoji
import org.wizardchat.android.matrix.text
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.room.AnimatedDrawable
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.PackImage
import org.wizardchat.tokens.WZ

enum class MediaPickerTab { emoji, stickers, gif }

/** Settings the composer keeps on the device (drafts, recent emoji, GIF favourites) */
internal val composerDefaults
    get() = WizardApplication.instance.getSharedPreferences("composer", Context.MODE_PRIVATE)

/** The floating "liquid glass" background of the composer's bubbles */
internal fun Modifier.floatingGlass(shape: Shape, color: androidx.compose.ui.graphics.Color) =
    shadow(4.dp, shape).clip(shape).background(color)

/**
 * The emoji/sticker/GIF sheet. With [emojiOnly] (reactions) only the emoji tab is shown and picking
 * one closes the sheet.
 */
@Composable
fun MediaPicker(
    tab: MediaPickerTab,
    store: PacksStore,
    onEmoji: (String, PackImage?) -> Unit,
    onSticker: (PackImage) -> Unit,
    onGif: suspend (GiphyGif) -> Unit,
    onDismiss: () -> Unit,
    emojiOnly: Boolean = false,
) {
    var current by remember { mutableStateOf(tab) }
    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.9f).background(theme.bgSecondary)) {
            Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
                if (!emojiOnly) {
                    val tabs = listOf(
                        MediaPickerTab.emoji to tr("common.emoji"),
                        MediaPickerTab.stickers to tr("room.settings.widgets.stickers"),
                        MediaPickerTab.gif to tr("composer.gif"),
                    )
                    SingleChoiceSegmentedButtonRow(Modifier.width(WZ.Size.sidebar).align(Alignment.Center)) {
                        tabs.forEachIndexed { index, (value, label) ->
                            SegmentedButton(
                                selected = current == value,
                                onClick = { current = value },
                                shape = SegmentedButtonDefaults.itemShape(index, tabs.size),
                                icon = {},
                                colors = SegmentedButtonDefaults.colors(
                                    activeContainerColor = theme.bgPrimary,
                                    activeContentColor = theme.textPrimary,
                                    inactiveContainerColor = theme.fill,
                                    inactiveContentColor = theme.textPrimary,
                                    activeBorderColor = theme.border,
                                    inactiveBorderColor = theme.border,
                                ),
                            ) {
                                Text(label, style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), maxLines = 1)
                            }
                        }
                    }
                }
                Box(Modifier.align(Alignment.CenterEnd)) {
                    BarTextButton(tr("common.done"), onDismiss, bold = true)
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (current) {
                    MediaPickerTab.emoji -> EmojiGrid(store.packs) { emoji, image ->
                        onEmoji(emoji, image)
                        if (emojiOnly) onDismiss()
                    }
                    MediaPickerTab.stickers -> StickerGrid(store.packs, store.isLoading) { sticker ->
                        onSticker(sticker)
                        onDismiss()
                    }
                    MediaPickerTab.gif -> GifPicker { gif ->
                        onGif(gif)
                        onDismiss()
                    }
                }
            }
        }
    }
}

@Composable
internal fun EmojiGrid(packs: List<ImagePack>, unicodeOnly: Boolean = false, onPick: (String, PackImage?) -> Unit) {
    var search by remember { mutableStateOf("") }
    val recentEmoji = RecentEmoji.shared
    val recent = recentEmoji.entries.filter { !unicodeOnly || it.url == null }
    val customEmoji = packs.flatMap { pack -> pack.images.filter { it.emoticon } }
    val gridState = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    val groups = remember { Emoji.groups }
    val all = remember { Emoji.all }

    fun rememberRecent(emoji: String) = recentEmoji.use(emoji, Emoji.labelOf(emoji))
    fun rememberRecent(image: PackImage) = recentEmoji.use(":${image.shortcode}:", image.shortcode, image.url)

    // Grid positions of the group headers, for the jump bar
    val headerIndex = HashMap<Int, Int>()
    if (search.isEmpty()) {
        var index = 0
        if (recent.isNotEmpty()) index += 1 + recent.size
        if (customEmoji.isNotEmpty()) index += 1 + customEmoji.size
        groups.forEach { group ->
            headerIndex[group.index] = index
            index += 1 + all.count { it.g == group.index }
        }
    }

    val recentTitle = tr("composer.recentEmoji")
    val customTitle = tr("composer.customEmoji")
    Column(Modifier.fillMaxSize()) {
        SearchBar(search, { search = it }, tr("composer.searchEmoji"))
        Box(Modifier.weight(1f).fillMaxWidth()) {
            LazyVerticalGrid(
                GridCells.Adaptive(44.dp),
                Modifier.fillMaxSize(),
                state = gridState,
                contentPadding = PaddingValues(
                    start = WZ.Space.space4,
                    end = WZ.Space.space4,
                    bottom = WZ.Space.space7 + if (search.isEmpty()) WZ.Space.space11 else 0.dp,
                ),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                if (search.isEmpty()) {
                    if (recent.isNotEmpty()) {
                        sectionHeader(recentTitle)
                        items(recent, key = { "r${it.emoji}" }) { entry ->
                            val url = entry.url
                            if (url != null) {
                                val image = PackImage(shortcode = entry.label ?: entry.emoji.trim(':'), url = url, emoticon = true, sticker = false)
                                CustomCell(image) { rememberRecent(image); onPick(":${image.shortcode}:", image) }
                            } else {
                                EmojiCell(entry.emoji) { rememberRecent(entry.emoji); onPick(entry.emoji, null) }
                            }
                        }
                    }
                    if (customEmoji.isNotEmpty()) {
                        sectionHeader(customTitle)
                        items(customEmoji) { image -> CustomCell(image) { rememberRecent(image); onPick(":${image.shortcode}:", image) } }
                    }
                    groups.forEach { group ->
                        sectionHeader(group.name)
                        items(all.filter { it.g == group.index }, key = { "e${it.e}" }) { emoji ->
                            EmojiCell(emoji.e) { rememberRecent(emoji.e); onPick(emoji.e, null) }
                        }
                    }
                } else {
                    val custom = customEmoji.filter { it.shortcode.contains(search, ignoreCase = true) }
                    val results = all.filter { it.matches(search) }
                    items(custom) { image -> CustomCell(image) { rememberRecent(image); onPick(":${image.shortcode}:", image) } }
                    items(results, key = { "e${it.e}" }) { emoji -> EmojiCell(emoji.e) { rememberRecent(emoji.e); onPick(emoji.e, null) } }
                    if (custom.isEmpty() && results.isEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Text(
                                tr("composer.noEmojiFound"),
                                Modifier.padding(top = WZ.Space.space8),
                                color = theme.textMuted,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
            if (search.isEmpty()) {
                Row(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(horizontal = WZ.Space.space5)
                        .padding(bottom = WZ.Space.space2)
                        .fillMaxWidth()
                        .floatingGlass(CircleShape, theme.bgTertiary)
                        .padding(horizontal = WZ.Space.space4),
                ) {
                    groups.forEach { group ->
                        Box(
                            Modifier
                                .weight(1f)
                                .heightIn(min = WZ.Space.space9)
                                .clickable { headerIndex[group.index]?.let { scope.launch { gridState.animateScrollToItem(it) } } },
                            contentAlignment = Alignment.Center,
                        ) {
                            PhIcon(group.icon, size = WZ.SizeIcon.md, tint = theme.textMuted, contentDescription = group.name)
                        }
                    }
                }
            }
        }
    }
}

private fun LazyGridScope.sectionHeader(title: String) {
    item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        Text(
            title,
            Modifier.fillMaxWidth().background(theme.bgSecondary).padding(vertical = WZ.Space.space3),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textMuted,
        )
    }
}

@Composable
private fun EmojiCell(emoji: String, onClick: () -> Unit) {
    Box(Modifier.size(WZ.Space.space10).clip(RoundedCornerShape(WZ.Radius.md)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(emoji, fontSize = WZ.SizeIcon.xl.value.sp)
    }
}

@Composable
private fun CustomCell(image: PackImage, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space10)
            .clip(RoundedCornerShape(WZ.Radius.md))
            .clickable(onClick = onClick)
            .semantics { contentDescription = image.shortcode },
        contentAlignment = Alignment.Center,
    ) {
        PackThumb(image.url, Modifier.size(WZ.Space.space9))
    }
}

@Composable
private fun StickerGrid(packs: List<ImagePack>, loading: Boolean, onPick: (PackImage) -> Unit) {
    var search by remember { mutableStateOf("") }
    val stickerPacks = packs.mapNotNull { pack ->
        val images = pack.images.filter {
            it.sticker && (search.isEmpty() || it.shortcode.contains(search, ignoreCase = true) ||
                it.text.contains(search, ignoreCase = true))
        }
        if (images.isEmpty()) null else pack.copy(images = images)
    }
    Column(Modifier.fillMaxSize()) {
        SearchBar(search, { search = it }, tr("composer.searchStickers"))
        if (stickerPacks.isEmpty() && loading) {
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spinner()
                Text(tr("composer.loadingStickers"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
            }
        } else if (stickerPacks.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(WZ.Space.space8),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                PhIcon("smiley", size = WZ.SizeIcon.xxl, tint = theme.textMuted)
                Text(tr("composer.noStickers"), style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary)
                Text(
                    tr("composer.addImagesToYour"),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyVerticalGrid(
                GridCells.Adaptive(84.dp),
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = WZ.Space.space5),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                stickerPacks.forEach { pack ->
                    sectionHeader(pack.name)
                    items(pack.images) { sticker ->
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(WZ.Radius.md))
                                .clickable { onPick(sticker) }
                                .semantics { contentDescription = sticker.text },
                            contentAlignment = Alignment.Center,
                        ) {
                            PackThumb(sticker.url, Modifier.size(WZ.SizeAvatar.xl), animated = true)
                        }
                    }
                }
            }
        }
    }
}

/** An emoji/sticker image from a pack */
@Composable
fun PackThumb(url: String, modifier: Modifier = Modifier, animated: Boolean = false, rounded: Boolean = true) {
    val media = LocalMedia.current
    val animates = animated || LocalPrefs.current.autoplayGifs
    var image by remember(url) { mutableStateOf<Bitmap?>(null) }
    var playing by remember(url) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(url, media, animates) {
        image = media?.thumbnail(url, 160)
        playing = if (animates) media?.animated(JsonObject(mapOf("url" to JsonPrimitive(url)))) else null
    }
    Box(if (rounded) modifier.clip(RoundedCornerShape(WZ.Radius.md)) else modifier) {
        val bitmap = image
        val drawable = playing
        if (drawable != null) {
            AnimatedDrawable(drawable, fit = true, modifier = Modifier.fillMaxSize())
        } else if (bitmap != null) {
            Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
        } else {
            Box(Modifier.fillMaxSize().background(theme.fill))
        }
    }
}

/** The search field at the top of the pickers */
@Composable
internal fun SearchBar(text: String, onChange: (String) -> Unit, prompt: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)
            .fillMaxWidth()
            .height(WZ.Space.space10)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        PhIcon("magnifying-glass", tint = theme.textMuted)
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (text.isEmpty()) Text(prompt, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted, maxLines = 1)
            BasicTextField(
                text,
                onChange,
                Modifier.fillMaxWidth(),
                textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
                singleLine = true,
                cursorBrush = SolidColor(theme.accent),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
            )
        }
        if (text.isNotEmpty()) {
            Box(Modifier.clip(CircleShape).clickable { onChange("") }) {
                PhIcon("x-circle", tint = theme.textMuted, contentDescription = tr("common.clear"))
            }
        }
    }
}
