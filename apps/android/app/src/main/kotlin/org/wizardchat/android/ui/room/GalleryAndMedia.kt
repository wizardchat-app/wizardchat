package org.wizardchat.android.ui.room

import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

@Composable
fun SpoilerCover(reason: String) {
    val hint = tr("timeline.tapToReveal")
    Column(
        Modifier.padding(WZ.Space.space4).semantics { contentDescription = "$reason $hint" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        if (reason.isNotEmpty()) {
            Text(
                reason,
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            Modifier.background(theme.overlay, CircleShape).padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        ) {
            PhIcon("eye-slash", size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
            Text(tr("timeline.spoilerMedia"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textOnAccent)
        }
    }
}

/** Several pictures sent in a row, as one grid */
@Composable
fun GalleryGridView(items: List<ChatEntry>, isPrivateRoom: Boolean = true) {
    var openIndex by remember { mutableStateOf<Int?>(null) }
    val all = items.mapNotNull { entry -> (entry.kind as? ChatEntry.Kind.Image)?.let { entry to it.media } }
    val visible = all.take(MAX_VISIBLE)
    val extra = all.size - visible.size
    val columns = if (visible.size <= 2) visible.size else if (visible.size == 4) 2 else 3
    val width = 260.dp
    val spacing = 3.dp
    val tile = (width - spacing * (columns - 1)) / maxOf(columns, 1)
    Column(
        Modifier
            .width(width)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .semantics { contentDescription = L10n.format("timeline.photos", all.size) },
        verticalArrangement = Arrangement.spacedBy(spacing),
    ) {
        visible.chunked(maxOf(columns, 1)).forEachIndexed { row, chunk ->
            Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                chunk.forEachIndexed { column, (entry, media) ->
                    val index = row * columns + column
                    key(entry.id) {
                        Box(Modifier.size(tile)) {
                            GalleryTile(
                                media,
                                entry.mediaSpoiler,
                                isPrivateRoom,
                                moreCount = if (index == visible.size - 1 && extra > 0) extra else 0,
                            ) { openIndex = index }
                        }
                    }
                }
            }
        }
    }
    openIndex?.let { start ->
        MediaPagerView(all.map { it.second }, start) { openIndex = null }
    }
}

private const val MAX_VISIBLE = 8

@Composable
private fun GalleryTile(media: ChatEntry.MediaContent, spoiler: String?, isPrivateRoom: Boolean, moreCount: Int, onOpen: () -> Unit) {
    val loader = LocalMedia.current
    var image by remember { mutableStateOf<Bitmap?>(null) }
    var revealed by remember { mutableStateOf(false) }
    val hidden = mediaHidden(revealed, spoiler, isPrivateRoom)
    LaunchedEffect(media.source, media.thumbnail, hidden, loader) {
        if (hidden || loader == null) return@LaunchedEffect
        loader.image(media.thumbnail ?: media.source, 400, serverThumbnail = media.thumbnail == null)?.let { image = it }
    }
    Box(
        Modifier.fillMaxSize().background(theme.fill).clipToBounds().messageTap { if (hidden) revealed = true else onOpen() },
        contentAlignment = Alignment.Center,
    ) {
        image?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
        if (hidden) {
            MaterialCover()
            PhIcon(if (spoiler != null) "eye-slash" else "eye", tint = theme.textPrimary)
        } else if (moreCount > 0) {
            Box(Modifier.matchParentSize().background(theme.overlay))
            Text("+$moreCount", style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textOnAccent)
        }
    }
}

/** Swipes through pictures (and videos) full screen */
@Composable
fun MediaPagerView(items: List<ChatEntry.MediaContent>, startIndex: Int, isVideo: List<Boolean> = emptyList(), onDismiss: () -> Unit) {
    val pager = rememberPagerState(initialPage = startIndex) { items.size }
    FullScreenDialog(onDismiss) {
        Column(Modifier.fillMaxSize().background(Color.Black)) {
            Box(
                Modifier.fillMaxWidth().background(Color(0xFF1C1C1E)).statusBarsPadding().height(WZ.Space.space11)
                    .padding(horizontal = WZ.Space.space3),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.align(Alignment.CenterStart)) { BarButton("x", tr("common.close"), onDismiss, tint = Color.White) }
                if (items.size > 1) {
                    Text(
                        tr("timeline.pageIndicator", "${pager.currentPage + 1}", items.size),
                        style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                        color = Color.White,
                    )
                }
            }
            HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth().navigationBarsPadding()) { page ->
                MediaPage(items[page], isVideo.getOrElse(page) { false })
            }
        }
    }
}

@Composable
private fun MediaPage(media: ChatEntry.MediaContent, isVideo: Boolean) {
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    var image by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    var animated by remember(media.source) { mutableStateOf<Drawable?>(null) }
    var loadingVideo by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf<java.io.File?>(null) }
    LaunchedEffect(media.source, loader) {
        loader ?: return@LaunchedEffect
        if (isVideo) {
            media.thumbnail?.let { image = loader.image(it, 800, serverThumbnail = false) }
        } else {
            if (media.isAnimated) animated = loader.animated(media.source)
            image = loader.image(media.source, null)
        }
    }
    Box(Modifier.fillMaxSize().background(theme.overlay), contentAlignment = Alignment.Center) {
        val drawable = animated
        val bitmap = image
        when {
            drawable != null -> ZoomableBox(Modifier.fillMaxSize()) { AnimatedDrawable(drawable, fit = true, modifier = Modifier.fillMaxSize()) }
            bitmap != null -> ZoomableBox(Modifier.fillMaxSize()) {
                Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            }
            else -> Spinner(color = theme.textOnAccent)
        }
        if (isVideo) {
            val label = tr("timeline.playVideo")
            Box(
                Modifier.size(WZ.SizeAvatar.xl).clip(CircleShape).background(theme.overlay)
                    .clickable {
                        if (loadingVideo || loader == null) return@clickable
                        scope.launch {
                            loadingVideo = true
                            playing = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                            loadingVideo = false
                        }
                    }
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon(if (loadingVideo) "hourglass" else "play", if (loadingVideo) PhWeight.regular else PhWeight.fill, size = WZ.SizeIcon.lg, tint = theme.textOnAccent)
            }
        }
    }
    playing?.let { VideoPlayer(it) { playing = null } }
}

private enum class MediaSection(val title: String) {
    media("timeline.mediaTabMedia"),
    docs("timeline.mediaTabDocs"),
    links("timeline.mediaTabLinks"),
}

/** A room's pictures, videos, files and links */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomMediaScreen(room: RoomSummary, client: WizardClient, onBack: () -> Unit) {
    var section by remember { mutableStateOf(MediaSection.media) }
    val mediaModel = remember(room.id) {
        TimelineModel(client, room.id, onlyTypes = setOf(ChatEntry.ContentType.image, ChatEntry.ContentType.video))
    }
    val docsModel = remember(room.id) {
        TimelineModel(client, room.id, onlyTypes = setOf(ChatEntry.ContentType.file, ChatEntry.ContentType.audio))
    }
    val linksModel = remember(room.id) {
        TimelineModel(client, room.id, onlyTypes = setOf(ChatEntry.ContentType.text, ChatEntry.ContentType.notice, ChatEntry.ContentType.emote))
    }
    DisposableEffect(room.id) {
        onDispose {
            mediaModel.close()
            docsModel.close()
            linksModel.close()
        }
    }
    val model = when (section) {
        MediaSection.media -> mediaModel
        MediaSection.docs -> docsModel
        MediaSection.links -> linksModel
    }
    LaunchedEffect(section) { model.start() }
    Column(Modifier.fillMaxSize().background(theme.bgSecondary)) {
        WizardTopBar(tr("timeline.mediaLinksAndDocs"), onBack = onBack)
        SingleChoiceSegmentedButtonRow(
            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
        ) {
            MediaSection.entries.forEachIndexed { index, item ->
                SegmentedButton(
                    selected = section == item,
                    onClick = { section = item },
                    shape = SegmentedButtonDefaults.itemShape(index, MediaSection.entries.size),
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = theme.bgTertiary,
                        activeContentColor = theme.textPrimary,
                        inactiveContainerColor = theme.fill,
                        inactiveContentColor = theme.textPrimary,
                        activeBorderColor = theme.border,
                        inactiveBorderColor = theme.border,
                    ),
                    icon = {},
                ) {
                    Text(tr(item.title), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium))
                }
            }
        }
        when (section) {
            MediaSection.media -> MediaGrid(mediaModel)
            MediaSection.docs -> DocsList(docsModel)
            MediaSection.links -> LinksList(linksModel)
        }
    }
}

@Composable
private fun LoadMoreFooter(model: TimelineModel, isEmpty: Boolean, emptyText: String, emptyIcon: String) {
    if (!model.reachedStart) {
        Box(Modifier.fillMaxWidth().padding(WZ.Space.space8), contentAlignment = Alignment.Center) {
            Spinner(color = theme.textMuted)
        }
        LaunchedEffect(model) {
            while (isActive && !model.reachedStart) {
                model.paginateBackwards()
                delay(150)
            }
        }
    } else if (isEmpty) {
        EmptyState(tr(emptyText), emptyIcon, Modifier.padding(top = WZ.Space.space10))
    }
}

/** An icon, a title and an optional description in the middle of an empty page */
@Composable
internal fun EmptyState(title: String, icon: String, modifier: Modifier = Modifier, description: String? = null) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = WZ.Space.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon(icon, size = WZ.SizeIcon.xxl, tint = theme.textMuted)
        Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
        if (description != null) {
            Text(description, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun MediaGrid(model: TimelineModel) {
    var openIndex by remember { mutableStateOf<Int?>(null) }
    val items = model.entries.asReversed().mapNotNull { entry ->
        when (val kind = entry.kind) {
            is ChatEntry.Kind.Image -> Triple(entry, kind.media, false)
            is ChatEntry.Kind.Video -> Triple(entry, kind.media, true)
            else -> null
        }
    }
    LazyVerticalGrid(
        GridCells.Fixed(3),
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = LocalBottomBarInset.current),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        itemsIndexed(items, key = { _, item -> item.first.id }) { index, (_, media, isVideo) ->
            Box(Modifier.aspectRatio(1f).clickable { openIndex = index }) { MediaThumb(media, isVideo) }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            LoadMoreFooter(model, items.isEmpty(), "timeline.noPhotosOrVideos", "images")
        }
    }
    openIndex?.let { start ->
        MediaPagerView(items.map { it.second }, start, items.map { it.third }) { openIndex = null }
    }
}

@Composable
private fun MediaThumb(media: ChatEntry.MediaContent, isVideo: Boolean) {
    val loader = LocalMedia.current
    var image by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(media.source, loader) {
        val source = if (isVideo) media.thumbnail else media.thumbnail ?: media.source
        if (loader != null && source != null) image = loader.image(source, 300)
    }
    val label = if (isVideo) tr("timeline.summary.video") else tr("timeline.photo")
    Box(Modifier.fillMaxSize().background(theme.fill).clipToBounds().semantics { contentDescription = label }) {
        image?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
        if (isVideo) {
            Row(
                Modifier.align(Alignment.BottomStart).padding(WZ.Space.space2),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                PhIcon("video-camera", PhWeight.regular, size = WZ.SizeIcon.xs, tint = theme.textOnAccent)
                media.duration?.let {
                    Text(Formats.duration(it), style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = theme.textOnAccent)
                }
            }
        }
    }
}

@Composable
private fun DocsList(model: TimelineModel) {
    val items = model.entries.asReversed().mapNotNull { entry ->
        when (val kind = entry.kind) {
            is ChatEntry.Kind.File -> entry to kind.media
            is ChatEntry.Kind.Audio -> if (!kind.isVoice) entry to kind.media else null
            else -> null
        }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = LocalBottomBarInset.current)) {
        items(items, key = { it.first.id }) { (entry, media) ->
            Column(
                Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                FileMessageView(media)
                Text(
                    "${entry.senderName} · ${Formats.abbreviatedDate(entry.timestamp)}",
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
        }
        item { LoadMoreFooter(model, items.isEmpty(), "timeline.noDocuments", "file") }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LinksList(model: TimelineModel) {
    val uriHandler = LocalUriHandler.current
    val seen = HashSet<String>()
    val items = model.entries.asReversed().flatMap { entry ->
        val body = (entry.kind as? ChatEntry.Kind.Message)?.body ?: return@flatMap emptyList()
        MessageText.allWebURLs(body).mapNotNull { url ->
            val id = "${entry.id}|$url"
            if (seen.add(id)) Triple(id, url, entry) else null
        }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = LocalBottomBarInset.current)) {
        items(items, key = { it.first }) { (_, url, entry) ->
            var menu by remember { mutableStateOf(false) }
            Box {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .combinedClickable(onLongClick = { menu = true }) { runCatching { uriHandler.openUri(url) } }
                        .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                ) {
                    Box(
                        Modifier.size(WZ.Space.space10).background(theme.fill, RoundedCornerShape(WZ.Radius.lg)),
                        contentAlignment = Alignment.Center,
                    ) {
                        PhIcon("link-simple", PhWeight.regular, size = WZ.SizeIcon.sm, tint = theme.linkColor)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(
                            android.net.Uri.parse(url).host?.removePrefix("www.") ?: url,
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(url, style = wizardFont(WZ.FontSize.sm), color = theme.linkColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${entry.senderName} · ${Formats.abbreviatedDate(entry.timestamp)}",
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                WizardMenu(
                    menu,
                    { menu = false },
                    listOf(MenuItem(tr("common.copyLink"), "copy") { copyToClipboard(url, L10n.format("timeline.linkCopied")) }),
                )
            }
        }
        item { LoadMoreFooter(model, items.isEmpty(), "timeline.noLinks", "link-simple") }
    }
}
