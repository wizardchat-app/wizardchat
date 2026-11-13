package org.wizardchat.android.ui.room

import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.ImageView
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.MediaVisibility
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.composer.PackThumb
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.MediaSource
import org.wizardchat.core.ThreadSummaryView
import org.wizardchat.tokens.WZ

/** Whether media should start covered: spoilers always, otherwise by the "Show media" setting */
@Composable
internal fun mediaHidden(revealed: Boolean, spoiler: String?, isPrivateRoom: Boolean): Boolean {
    if (revealed) return false
    if (spoiler != null) return true
    return when (LocalPrefs.current.mediaVisibility) {
        MediaVisibility.always -> false
        MediaVisibility.private -> !isPrivateRoom
        MediaVisibility.never -> true
    }
}

/** A frosted cover over hidden media */
@Composable
internal fun BoxScope.MaterialCover() {
    Box(Modifier.matchParentSize().background(theme.bgSecondary.copy(alpha = 0.82f)))
}

/** Taps that leave long presses to the message menu */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.messageTap(
    interactionSource: MutableInteractionSource? = null,
    onClick: () -> Unit,
): Modifier = combinedClickable(
    interactionSource = interactionSource,
    indication = null,
    onLongClick = LocalMessageLongPress.current,
    onClick = onClick,
)

/** A full-screen page over everything */
@Composable
internal fun FullScreenDialog(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        content = content,
    )
}

/** A `content://` URI other apps can read */
internal fun shareableUri(context: Context, file: File): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.files", file)

/** Opens a downloaded file in another app */
internal fun openFile(context: Context, file: File, mimetype: String?) {
    try {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(shareableUri(context, file), mimetype ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(Intent.createChooser(intent, file.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
        CopyToast.show(L10n.format("common.somethingWentWrong"))
    }
}

internal fun shareFile(context: Context, file: File, mimetype: String) {
    try {
        val intent = Intent(Intent.ACTION_SEND)
            .setType(mimetype)
            .putExtra(Intent.EXTRA_STREAM, shareableUri(context, file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
        CopyToast.show(L10n.format("common.somethingWentWrong"))
    }
}

internal suspend fun saveToPhotos(context: Context, file: File, mimetype: String) {
    val saved = withContext(Dispatchers.IO) {
        runCatching {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, file.name)
                put(MediaStore.Images.Media.MIME_TYPE, mimetype)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/WizardChat")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("insert failed")
            resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            }
        }.isSuccess
    }
    CopyToast.show(L10n.format(if (saved) "common.savedToPhotos" else "common.somethingWentWrong"))
}

/** Shows a playing GIF/WebP drawable */
@Composable
internal fun AnimatedDrawable(drawable: Drawable, fit: Boolean, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { ImageView(it) },
        modifier = modifier,
        update = { view ->
            view.scaleType = if (fit) ImageView.ScaleType.FIT_CENTER else ImageView.ScaleType.CENTER_CROP
            if (view.drawable !== drawable) {
                view.setImageDrawable(drawable)
                (drawable as? Animatable)?.start()
            }
        },
    )
}

@Composable
fun ImageMessageView(
    media: ChatEntry.MediaContent,
    isSticker: Boolean = false,
    isPrivateRoom: Boolean = true,
    spoiler: String? = null,
) {
    val prefs = LocalPrefs.current
    val loader = LocalMedia.current
    val animatesMedia = LocalAnimatesMedia.current
    var revealed by remember { mutableStateOf(false) }
    var showViewer by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val holding by interaction.collectIsPressedAsState()
    val hidden = mediaHidden(revealed, spoiler, isPrivateRoom)
    val canAnimate = media.isAnimated || isSticker || media.mimetype in listOf("image/gif", "image/webp", "image/apng")
    val animate = canAnimate && (prefs.autoplayGifs || holding || animatesMedia)

    var image by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    var animated by remember(media.source) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(animate, showViewer, hidden, loader) {
        if (hidden || loader == null) return@LaunchedEffect
        if ((animate || showViewer && canAnimate) && animated == null) animated = loader.animated(media.source)
        if (image == null) image = loader.image(media.source, if (animate) null else 800)
    }

    val maxWidth = if (isSticker) 160f else 260f
    val maxHeight = if (isSticker) 160f else 320f
    val width = media.width ?: maxWidth
    val height = media.height ?: (maxWidth * 0.75f)
    val scale = minOf(maxWidth / maxOf(width, 1f), maxHeight / maxOf(height, 1f), 1f)
    val shape = RoundedCornerShape(if (isSticker) 0.dp else 14.dp)

    Box(
        Modifier
            .size(maxOf(width * scale, 60f).dp, maxOf(height * scale, 60f).dp)
            .clip(shape)
            .messageTap(interaction) {
                if (hidden) revealed = true else showViewer = true
            }
            .semantics { contentDescription = media.body },
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = image
        val drawable = animated
        val blur = if (hidden) Modifier.blur(24.dp) else Modifier
        when {
            animate && drawable != null && !hidden -> AnimatedDrawable(drawable, fit = isSticker, modifier = Modifier.fillMaxSize())
            bitmap != null -> Image(
                bitmap.asImageBitmap(),
                null,
                Modifier.fillMaxSize().then(blur),
                contentScale = if (isSticker) ContentScale.Fit else ContentScale.Crop,
            )
            else -> {
                Box(Modifier.fillMaxSize().background(theme.fill))
                if (!hidden) Spinner(color = theme.textMuted)
            }
        }
        if (hidden) {
            MaterialCover()
            if (spoiler != null) {
                SpoilerCover(spoiler)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    PhIcon("eye", tint = theme.textPrimary, size = WZ.SizeIcon.sm)
                    Text(tr("timeline.showMedia"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                }
            }
        } else if (media.isAnimated && !animate) {
            Text(
                tr("composer.gif"),
                Modifier.background(theme.overlay, CircleShape).padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
                style = wizardFont(WZ.FontSize.sm, FontWeight.Bold),
                color = theme.textOnAccent,
            )
        }
    }
    if (showViewer) {
        ImageViewer(image, animated.takeIf { canAnimate }, media.caption ?: media.filename, media.source, media.filename, media.mimetype) {
            showViewer = false
        }
    }
}

/** The full-screen picture with zoom */
@Composable
fun ImageViewer(
    image: Bitmap?,
    animated: Drawable?,
    title: String,
    source: MediaSource?,
    filename: String,
    mimetype: String?,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    FullScreenDialog(onDismiss) {
        Column(Modifier.fillMaxSize().background(Color.Black)) {
            Row(
                Modifier.fillMaxWidth().background(Color(0xFF1C1C1E)).statusBarsPadding().height(WZ.Space.space11)
                    .padding(horizontal = WZ.Space.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BarTextButton(tr("common.done"), onDismiss)
                Text(
                    title,
                    Modifier.weight(1f),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
                if (image != null && source != null && loader != null) {
                    BarButton("download-simple", tr("common.saveToPhotos"), {
                        scope.launch {
                            val file = runCatching { loader.file(source, filename) }.getOrNull() ?: return@launch
                            saveToPhotos(context, file, mimetype ?: "image/png")
                        }
                    })
                    BarButton("export", tr("desktopPicker.share"), {
                        scope.launch {
                            val file = runCatching { loader.file(source, filename) }.getOrNull() ?: return@launch
                            shareFile(context, file, mimetype ?: "image/*")
                        }
                    })
                } else {
                    Spacer(Modifier.size(WZ.Space.space11))
                }
            }
            ZoomableBox(Modifier.weight(1f).fillMaxWidth().navigationBarsPadding()) {
                when {
                    animated != null -> AnimatedDrawable(animated, fit = true, modifier = Modifier.fillMaxSize())
                    image != null -> Image(image.asImageBitmap(), title, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                }
            }
        }
    }
}

/** Pinch to zoom; springs back on release */
@Composable
internal fun ZoomableBox(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    Box(
        modifier
            .clipToBounds()
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        if (event.changes.size > 1) {
                            scale = maxOf(1f, scale * event.calculateZoom())
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    scale = 1f
                }
            }
            .graphicsLayer(scaleX = scale, scaleY = scale),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

@Composable
fun VideoMessageView(media: ChatEntry.MediaContent, spoiler: String? = null) {
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    var revealed by remember { mutableStateOf(false) }
    var thumbnail by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    var loading by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf<File?>(null) }
    val width = 260f
    val ratio = (media.height ?: 9f) / maxOf(media.width ?: 16f, 1f)
    LaunchedEffect(media.thumbnail, loader) {
        val source = media.thumbnail ?: return@LaunchedEffect
        thumbnail = loader?.image(source, 600)
    }
    val description = tr("timeline.summary.video")
    Box(
        Modifier
            .size(width.dp, minOf(width * ratio, 340f).dp)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .messageTap {
                if (spoiler != null && !revealed) {
                    revealed = true
                } else if (!loading && loader != null) {
                    scope.launch {
                        loading = true
                        playing = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                        loading = false
                    }
                }
            }
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        val covered = spoiler != null && !revealed
        thumbnail?.let {
            Image(it.asImageBitmap(), null, Modifier.fillMaxSize().then(if (covered) Modifier.blur(24.dp) else Modifier), contentScale = ContentScale.Crop)
        }
        when {
            covered -> {
                MaterialCover()
                SpoilerCover(spoiler ?: "")
            }
            loading -> Spinner(color = theme.textOnAccent)
            else -> Box(
                Modifier.size(WZ.Space.space11).background(theme.overlay, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("play", PhWeight.fill, size = WZ.SizeIcon.lg, tint = theme.textOnAccent)
            }
        }
        media.duration?.let { duration ->
            Text(
                Formats.duration(duration),
                Modifier.align(Alignment.BottomEnd).padding(WZ.Space.space4)
                    .background(theme.overlay, CircleShape)
                    .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textOnAccent,
            )
        }
    }
    playing?.let { file -> VideoPlayer(file) { playing = null } }
}

/** Plays a downloaded video full screen */
@Composable
fun VideoPlayer(file: File, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val player = remember(file) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    FullScreenDialog(onDismiss) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { PlayerView(it).apply { this.player = player } },
                modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
            )
            Box(Modifier.statusBarsPadding().padding(WZ.Space.space3)) {
                BarTextButton(tr("common.done"), onDismiss)
            }
        }
    }
}

@Composable
fun FileMessageView(media: ChatEntry.MediaContent) {
    val loader = LocalMedia.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    Row(
        Modifier
            .widthIn(max = WZ.Size.sidebar)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .messageTap {
                if (loader == null || loading) return@messageTap
                scope.launch {
                    loading = true
                    val file = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                    loading = false
                    if (file != null) openFile(context, file, media.mimetype)
                }
            }
            .padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Box(
            Modifier.size(WZ.Space.space10).background(theme.accent.copy(alpha = 0.14f), RoundedCornerShape(WZ.Radius.lg)),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("file", size = WZ.SizeIcon.lg, tint = theme.accent)
        }
        Column(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(
                media.filename,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            media.size?.let {
                Text(Formats.fileSize(it), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }
        Spacer(Modifier.weight(0.001f))
        if (loading) Spinner(size = WZ.SizeIcon.md) else PhIcon("download-simple", tint = theme.textMuted)
    }
}

/** Plays one audio file */
class AudioPlayback {
    var isPlaying by mutableStateOf(false)
        private set
    var progress by mutableFloatStateOf(0f)
        private set
    private var player: MediaPlayer? = null

    fun toggle(file: File) {
        if (isPlaying) {
            pause()
            return
        }
        val player = player ?: runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                setDataSource(file.path)
                prepare()
                setOnCompletionListener {
                    this@AudioPlayback.isPlaying = false
                    progress = 0f
                }
            }
        }.getOrNull()?.also { player = it } ?: return
        player.start()
        isPlaying = true
    }

    fun pause() {
        player?.pause()
        isPlaying = false
    }

    /** Called while playing to move the waveform along */
    fun tick() {
        val player = player ?: return
        if (isPlaying && player.duration > 0) progress = player.currentPosition.toFloat() / player.duration
    }

    fun release() {
        player?.release()
        player = null
        isPlaying = false
    }
}

@Composable
fun AudioMessageView(media: ChatEntry.MediaContent, isVoice: Boolean, waveform: List<Float>) {
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    val playback = remember { AudioPlayback() }
    var file by remember(media.source) { mutableStateOf<File?>(null) }
    var loading by remember { mutableStateOf(false) }
    DisposableEffect(playback) { onDispose { playback.release() } }
    LaunchedEffect(playback.isPlaying) {
        while (playback.isPlaying && isActive) {
            playback.tick()
            delay(50)
        }
    }
    Row(
        Modifier.background(theme.fill, CircleShape).padding(WZ.Space.space4).padding(end = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        val label = if (playback.isPlaying) tr("voiceMessagePlayer.pause") else tr("voiceMessagePlayer.play")
        Box(
            Modifier.size(WZ.Space.space10).clip(CircleShape).background(theme.accent)
                .messageTap {
                    scope.launch {
                        if (file == null && loader != null) {
                            loading = true
                            file = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                            loading = false
                        }
                        file?.let { playback.toggle(it) }
                    }
                }
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            if (loading) {
                Spinner(size = WZ.SizeIcon.sm, color = theme.textOnAccent)
            } else {
                PhIcon(if (playback.isPlaying) "pause" else "play", PhWeight.fill, size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
            }
        }
        if (isVoice || waveform.isNotEmpty()) {
            WaveformView(
                if (waveform.isEmpty()) List(32) { 0.3f } else waveform,
                playback.progress,
                Modifier.size(WZ.SizeAvatar.xxl, WZ.Space.space8),
            )
        } else {
            Text(
                media.filename,
                Modifier.widthIn(max = WZ.SizeAvatar.xxl),
                style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        media.duration?.let {
            Text(Formats.duration(it), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
    }
}

/** Loudness bars of a voice message, filled up to [progress] */
@Composable
fun WaveformView(samples: List<Float>, progress: Float = 0f, modifier: Modifier = Modifier) {
    val played = theme.accent
    val rest = theme.textMuted.copy(alpha = 0.6f)
    androidx.compose.foundation.Canvas(modifier) {
        val barWidth = WZ.Space.space1.toPx()
        val step = 4.dp.toPx()
        val count = maxOf((size.width / step).toInt(), 1)
        val bars = resample(samples, count)
        bars.forEachIndexed { index, value ->
            val height = maxOf(3.dp.toPx(), value * size.height)
            drawRoundRect(
                color = if (index.toFloat() / bars.size < progress) played else rest,
                topLeft = Offset(index * step, (size.height - height) / 2),
                size = Size(barWidth, height),
                cornerRadius = CornerRadius(barWidth / 2),
            )
        }
    }
}

internal fun resample(samples: List<Float>, count: Int): List<Float> {
    if (samples.isEmpty()) return List(count) { 0.1f }
    return (0 until count).map { index ->
        val start = index * samples.size / count
        val end = maxOf(start + 1, (index + 1) * samples.size / count)
        minOf(1f, samples.subList(start, minOf(end, samples.size)).maxOrNull() ?: 0f)
    }
}

/**
 * A shared location. Android has no built-in map view, so it shows a pin card that opens the
 * location in the user's maps app.
 */
@Composable
fun LocationMessageView(geoUri: String, description: String?) {
    val context = LocalContext.current
    val parts = geoUri.removePrefix("geo:").split(';').firstOrNull()?.split(',')?.mapNotNull { it.toDoubleOrNull() }.orEmpty()
    if (parts.size < 2) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PhIcon("map-pin", tint = theme.textPrimary)
            Text(description ?: geoUri, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
        }
        return
    }
    val (lat, lon) = parts
    Column(
        Modifier
            .width(WZ.Size.sidebar)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .messageTap {
                val label = Uri.encode(description ?: "")
                val uri = Uri.parse("geo:$lat,$lon?q=$lat,$lon${if (label.isEmpty()) "" else "($label)"}")
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: ActivityNotFoundException) {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://www.openstreetmap.org/?mlat=$lat&mlon=$lon#map=16/$lat/$lon"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            },
    ) {
        Box(
            Modifier.fillMaxWidth().height(WZ.SizeAvatar.xxl).background(theme.accent.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                PhIcon("map-pin", PhWeight.fill, size = WZ.SizeIcon.xl, tint = theme.accent)
                Text(
                    String.format(java.util.Locale.ROOT, "%.5f, %.5f", lat, lon),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
        }
        Row(
            Modifier.fillMaxWidth().background(theme.fill).padding(WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        ) {
            PhIcon("map-pin", tint = theme.textPrimary)
            Text(
                description ?: tr("timeline.location"),
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            PhIcon("arrow-square-out", tint = theme.textMuted)
        }
    }
}

@Composable
fun PollMessageView(poll: ChatEntry.PollContent, isOwn: Boolean, onVote: (String) -> Unit, onEnd: () -> Unit) {
    val hasVoted = poll.answers.any { it.votedByMe }
    val showsResults = poll.hasEnded || (poll.isDisclosed && hasVoted)
    Column(
        Modifier.widthIn(max = WZ.Size.panel).background(theme.fill, RoundedCornerShape(WZ.Radius.xl)).padding(WZ.Space.space5),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PhIcon("chart-bar-horizontal", tint = theme.textPrimary)
            Text(poll.question, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
        }
        poll.answers.forEach { answer ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill.copy(alpha = theme.fill.alpha * 0.6f))
                    .then(if (poll.hasEnded) Modifier else Modifier.messageTap { onVote(answer.id) })
                    .padding(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    PhIcon(
                        if (answer.votedByMe) "check-circle" else "circle",
                        if (answer.votedByMe) PhWeight.fill else PhWeight.regular,
                        tint = if (answer.votedByMe) theme.accent else theme.textMuted,
                    )
                    Text(answer.text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    if (showsResults) {
                        Text("${answer.votes}", style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                    }
                }
                if (showsResults) {
                    Box(Modifier.fillMaxWidth().height(WZ.Space.space3).clip(CircleShape).background(theme.fill)) {
                        Box(
                            Modifier.fillMaxHeight()
                                .fillMaxWidth(answer.votes.toFloat() / maxOf(poll.totalVotes, 1))
                                .clip(CircleShape)
                                .background(theme.accent),
                        )
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    poll.hasEnded -> tr("timeline.finalResultsVotes", "${poll.totalVotes}")
                    showsResults || hasVoted -> tr("timeline.votes", "${poll.totalVotes}")
                    else -> tr("timeline.tapAnOptionTo")
                },
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
            if (isOwn && !poll.hasEnded) {
                Text(
                    tr("timeline.poll.end"),
                    Modifier.messageTap(onClick = onEnd),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.accent,
                )
            }
        }
    }
}

@Composable
fun ReplyQuoteView(quote: ChatEntry.ReplyQuote) {
    Row(
        Modifier.height(IntrinsicSize.Min).padding(bottom = WZ.Space.space2),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.width(WZ.Space.space1).fillMaxHeight().background(theme.accent, CircleShape))
        Column {
            Text(quote.senderName, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = nameColor(quote.sender), maxLines = 1, overflow = TextOverflow.Ellipsis)
            EmojiText(quote.text.ifEmpty { tr("timeline.originalMessage") }, quote.emotes, wizardFont(WZ.FontSize.sm), theme.textMuted, maxLines = 1)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReactionsBar(reactions: List<ChatEntry.ReactionGroup>, onToggle: (String) -> Unit) {
    FlowRow(
        Modifier.padding(top = WZ.Space.space2),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        reactions.forEach { reaction ->
            val mine = reaction.reactedByMe
            Row(
                Modifier
                    .height(WZ.Space.space8)
                    .clip(CircleShape)
                    .background(if (mine) theme.accent.copy(alpha = 0.18f) else theme.fill)
                    .border(WZ.BorderWidth.thin, if (mine) theme.accent else Color.Transparent, CircleShape)
                    .messageTap { onToggle(reaction.key) }
                    .padding(horizontal = WZ.Space.space4)
                    .semantics { contentDescription = "${reaction.key} ${reaction.count}" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                if (reaction.key.startsWith("mxc://")) {
                    PackThumb(reaction.key, Modifier.size(WZ.Space.space6))
                } else {
                    Text(reaction.key, fontSize = WZ.SizeIcon.sm.value.sp)
                }
                if (reaction.count > 1) {
                    Text(
                        "${reaction.count}",
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = if (mine) theme.accent else theme.textMuted,
                    )
                }
            }
        }
    }
}

@Composable
fun ReadReceiptsView(roomId: String, userIds: List<String>, readAt: Map<String, java.time.Instant> = emptyMap(), modifier: Modifier = Modifier) {
    var showList by remember { mutableStateOf(false) }
    val label = L10n.format("timeline.seenBy", userIds.size)
    Row(
        modifier
            .clickable { showList = true }
            .padding(vertical = WZ.Space.space1)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        userIds.take(4).forEachIndexed { index, userId ->
            Box(
                Modifier
                    .offset(x = (-WZ.Space.space2) * index)
                    .border(WZ.BorderWidth.thin, theme.bgPrimary, CircleShape),
            ) {
                ReceiptAvatar(roomId, userId, 16.dp)
            }
        }
        if (userIds.size > 4) {
            Text(
                "+${userIds.size - 4}",
                Modifier.offset(x = (-WZ.Space.space2) * 4).padding(start = WZ.Space.space4),
                style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                color = theme.textMuted,
            )
        }
    }
    if (showList) {
        WizardSheet({ showList = false }) {
            Text(
                tr("timeline.seenByTitle"),
                Modifier.fillMaxWidth().padding(bottom = WZ.Space.space4),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
            )
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 560.dp).navigationBarsPadding()) {
                items(userIds, key = { it }) { userId ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                    ) {
                        ReceiptAvatar(roomId, userId, 32.dp)
                        ReceiptName(roomId, userId, Modifier.weight(1f))
                        readAt[userId]?.let { date ->
                            Text(
                                if (Formats.isToday(date)) Formats.time(date) else Formats.abbreviatedDateTime(date),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ThreadSummaryBadge(thread: ThreadSummaryView, roomId: String, onOpen: () -> Unit) {
    val latest = thread.latestSummary?.lineSequence()?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }
    val preview = when {
        thread.latestRedacted -> tr("timeline.messageDeleted")
        latest != null -> thread.latestSenderName?.let { "$it: $latest" } ?: latest
        thread.latestUndecryptable -> tr("timeline.couldNotDecrypt")
        else -> null
    }
    val hint = tr("timeline.openThread")
    Row(
        Modifier
            .widthIn(max = WZ.Size.panel)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .messageTap(onClick = onOpen)
            .semantics { onClick(label = hint) { onOpen(); true } }
            .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        thread.latestSender?.let { ReceiptAvatar(roomId, it, WZ.SizeAvatar.xs) }
        Text(
            trPlural("timeline.threadReplies", thread.replies.toInt(), thread.replies.toInt()),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.accent,
        )
        preview?.let {
            Text(
                it,
                Modifier.weight(1f, fill = false),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        PhIcon("caret-right", size = WZ.SizeIcon.xs, tint = theme.textMuted, weight = PhWeight.bold)
    }
}

@Composable
private fun ReceiptAvatar(roomId: String, userId: String, size: Dp) {
    val session = LocalSession.current
    var name by remember(userId) { mutableStateOf<String?>(null) }
    var url by remember(userId) { mutableStateOf<String?>(null) }
    LaunchedEffect(userId) {
        val profile = session.memberProfile(userId, roomId)
        name = profile.name
        url = profile.avatarUrl
    }
    Avatar(name ?: userId, url, size)
}

@Composable
private fun ReceiptName(roomId: String, userId: String, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    var name by remember(userId) { mutableStateOf<String?>(null) }
    LaunchedEffect(userId) { name = session.memberProfile(userId, roomId).name }
    Column(modifier) {
        Text(name ?: userId, style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (name != null) {
            Text(userId, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
