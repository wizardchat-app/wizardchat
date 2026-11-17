package org.wizardchat.android.ui.room

import org.wizardchat.android.matrix.MediaMetadata
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import java.net.URL
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

data class LinkPreviewData(
    val url: String,
    val title: String,
    val description: String?,
    val siteName: String,
    val imageUrl: String?,
)

/**
 * Fetches and caches link previews from the homeserver through the core. Only used in unencrypted
 * rooms, so the server never sees links from encrypted chats.
 */
class LinkPreviewLoader(val client: WizardClient) {
    /** Call from the main thread */
    suspend fun preview(url: String): LinkPreviewData? {
        if (cache.containsKey(url)) return cache[url]
        inFlight[url]?.let { return it.await() }
        val deferred = CompletableDeferred<LinkPreviewData?>()
        inFlight[url] = deferred
        val result = runCatching { client.urlPreview(url) }.getOrNull()?.let { preview ->
            val title = preview.title?.trim()?.takeIf { it.isNotEmpty() } ?: return@let null
            val host = (Uri.parse(preview.url).host ?: Uri.parse(url).host ?: "").removePrefix("www.")
            LinkPreviewData(url, title, preview.description?.trim(), preview.siteName ?: host, preview.imageUrl)
        }
        inFlight.remove(url)
        cache[url] = result
        deferred.complete(result)
        return result
    }

    private companion object {
        val cache = HashMap<String, LinkPreviewData?>()
        val inFlight = HashMap<String, CompletableDeferred<LinkPreviewData?>>()
    }
}

@Composable
fun LinkPreviewCard(url: String, loader: LinkPreviewLoader) {
    val media = LocalMedia.current
    val uriHandler = LocalUriHandler.current
    var data by remember(url) { mutableStateOf<LinkPreviewData?>(null) }
    var image by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) {
        data = loader.preview(url)
        val imageUrl = data?.imageUrl ?: return@LaunchedEffect
        image = if (imageUrl.startsWith("mxc://")) {
            media?.thumbnail(imageUrl, 400)
        } else {
            withContext(Dispatchers.IO) {
                runCatching { URL(imageUrl).openStream().use { it.readBytes() } }.getOrNull()
                    ?.let { MediaMetadata.decodeImage(it, 400) }
            }
        }
    }
    val preview = data ?: return
    val hint = tr("timeline.opensTheLink")
    Row(
        Modifier
            .padding(top = WZ.Space.space2)
            .widthIn(max = WZ.Size.panel)
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .clickable { runCatching { uriHandler.openUri(preview.url) } }
            .semantics { contentDescription = "${preview.siteName} ${preview.title} $hint" }
            .padding(WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.width(WZ.Space.space1).fillMaxHeight().background(theme.linkColor, RoundedCornerShape(WZ.Radius.xs)))
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(preview.siteName, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Text(
                preview.title,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.linkColor,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            preview.description?.takeIf { it.isNotEmpty() }?.let {
                Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            image?.let {
                Image(
                    it.asImageBitmap(),
                    null,
                    Modifier
                        .padding(top = WZ.Space.space2)
                        .widthIn(max = WZ.Size.sidebar)
                        .heightIn(max = WZ.SizeAvatar.xxl)
                        .clip(RoundedCornerShape(WZ.Radius.md)),
                    contentScale = ContentScale.Crop,
                )
            }
        }
    }
}
