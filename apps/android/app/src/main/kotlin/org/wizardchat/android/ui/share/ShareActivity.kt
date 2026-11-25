package org.wizardchat.android.ui.share

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.lifecycleScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.MainActivity
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MediaMetadata
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.ShareSender
import org.wizardchat.android.matrix.SharedFile
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.followReducedMotion
import org.wizardchat.android.ui.theme.WizardThemeRoot
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/**
 * "Share to WizardChat" from other apps (text, links, images, files): pick a room, add a message,
 * send. Sending continues in the app, which opens the room.
 */
class ShareActivity : ComponentActivity() {
    private val app get() = application as WizardApplication

    private var files by mutableStateOf(listOf<SharedFile>())
    private var previews by mutableStateOf(listOf<Bitmap>())
    private var message by mutableStateOf("")
    private var loading by mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lifecycleScope.launch { app.session.restore() }
        lifecycleScope.launch { load(intent) }
        followReducedMotion()
        setContent {
            CompositionLocalProvider(LocalSession provides app.session, LocalPrefs provides app.prefs) {
                WizardThemeRoot(app.prefs.theme(app.prefs.themeMode.isDark(isSystemInDarkTheme()))) {
                    CompositionLocalProvider(LocalMedia provides app.session.media) {
                        ShareScreen(
                            files.size,
                            previews,
                            message,
                            { message = it },
                            loading,
                            onCancel = ::finish,
                            onSend = ::send,
                        )
                    }
                }
            }
        }
    }

    private suspend fun load(intent: Intent) {
        val streams = when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(intent.stream())
            Intent.ACTION_SEND_MULTIPLE -> intent.streams()
            else -> emptyList()
        }
        val copied = withContext(Dispatchers.IO) { streams.mapNotNull(::copy) }
        files = copied
        previews = withContext(Dispatchers.IO) {
            copied.filter { it.mimetype.startsWith("image/") }.mapNotNull { preview(it.file) }
        }
        val text = listOfNotNull(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()).filter { it.isNotBlank() }
        message = text.joinToString("\n")
        loading = false
    }

    @Suppress("DEPRECATION")
    private fun Intent.stream(): Uri? =
        if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun Intent.streams(): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else getParcelableArrayListExtra(Intent.EXTRA_STREAM))
            .orEmpty()

    /** The grant to read a shared file ends with this screen, so copy it out */
    private fun copy(uri: Uri): SharedFile? = runCatching {
        val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: uri.lastPathSegment ?: "file"
        val mimetype = contentResolver.getType(uri) ?: "application/octet-stream"
        val folder = File(cacheDir, "share").apply { mkdirs() }
        val file = File(folder, "${UUID.randomUUID()}-$name")
        contentResolver.openInputStream(uri)?.use { input -> file.outputStream().use { input.copyTo(it) } } ?: return null
        var width: Long? = null
        var height: Long? = null
        if (mimetype.startsWith("image/")) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.path, bounds)
            if (bounds.outWidth > 0) {
                val rotated = file.inputStream().use(MediaMetadata::isRotated)
                width = (if (rotated) bounds.outHeight else bounds.outWidth).toLong()
                height = (if (rotated) bounds.outWidth else bounds.outHeight).toLong()
            }
        }
        SharedFile(file, name, mimetype, width, height)
    }.getOrNull()

    private fun preview(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= 256 && bounds.outHeight / (sample * 2) >= 256) sample *= 2
        return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    private fun send(room: RoomSummary) {
        val text = message.trim()
        ShareSender.send(room.id, text.ifEmpty { null }, files)
        MessageNotifier.shared.roomToOpen = room.id
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }
}

@Composable
private fun ShareScreen(
    fileCount: Int,
    previews: List<Bitmap>,
    message: String,
    onMessageChange: (String) -> Unit,
    loading: Boolean,
    onCancel: () -> Unit,
    onSend: (RoomSummary) -> Unit,
) {
    val session = LocalSession.current
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<RoomSummary?>(null) }
    val roomList = session.roomList
    val allRooms = roomList?.joinedRooms.orEmpty().take(200)
    val rooms = if (search.isEmpty()) allRooms else allRooms.filter { it.displayName.contains(search, ignoreCase = true) }
    val restoring = session.state == MatrixSession.State.Restoring || (roomList != null && !roomList.isLoaded)
    val canSend = selected != null && !loading && (fileCount > 0 || message.isNotBlank())

    Column(Modifier.fillMaxSize().background(theme.bgPrimary).imePadding()) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(theme.bgPrimary)
                .statusBarsPadding()
                .height(WZ.Space.space11)
                .padding(horizontal = WZ.Space.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BarTextButton(tr("common.cancel"), onCancel)
            Text(
                tr("app.name"),
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            BarTextButton(tr("common.send"), { selected?.let(onSend) }, enabled = canSend, bold = true)
        }
        WizardTextField(
            search,
            { search = it },
            tr("share.searchRooms"),
            Modifier.background(theme.bgPrimary).padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = WZ.Space.space8)) {
            item(key = "content") {
                GroupedSection {
                    if (previews.isNotEmpty()) {
                        LazyRow(
                            Modifier.padding(WZ.Space.space5),
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                        ) {
                            items(previews.size) { index ->
                                Image(
                                    previews[index].asImageBitmap(),
                                    null,
                                    Modifier.size(WZ.SizeAvatar.xl).clip(RoundedCornerShape(WZ.Radius.lg)),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }
                        RowDivider()
                    } else if (fileCount > 0) {
                        Row(
                            Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                        ) {
                            PhIcon("file", tint = theme.textMuted)
                            Text(tr("share.fileCount", fileCount), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                        }
                        RowDivider()
                    }
                    WizardTextField(
                        message,
                        onMessageChange,
                        tr("share.messagePlaceholder"),
                        Modifier.padding(WZ.Space.space3),
                        singleLine = false,
                    )
                }
            }
            item(key = "rooms") {
                GroupedSection(header = tr("share.sendTo")) {
                    when {
                        restoring -> Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() }
                        allRooms.isEmpty() -> Text(
                            tr("share.noRoomsHint"),
                            Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                            style = wizardFont(WZ.FontSize.lg),
                            color = theme.textMuted,
                        )
                    }
                    rooms.forEachIndexed { index, room ->
                        if (index > 0) RowDivider()
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = WZ.Space.space11)
                                .clickable { selected = room }
                                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.width(WZ.Space.space8)) {
                                PhIcon(if (room.isDirect) "user" else "hash-straight", tint = theme.textMuted)
                            }
                            Text(
                                room.displayName,
                                Modifier.weight(1f),
                                style = wizardFont(WZ.FontSize.lg),
                                color = theme.textPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (selected?.id == room.id) PhIcon("check", PhWeight.bold, tint = theme.accent)
                        }
                    }
                }
            }
        }
        Box(Modifier.navigationBarsPadding())
    }
}
