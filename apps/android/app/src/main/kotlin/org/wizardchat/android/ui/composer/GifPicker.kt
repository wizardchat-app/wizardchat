package org.wizardchat.android.ui.composer

import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.LruCache
import android.widget.ImageView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

@Serializable
data class GiphyGif(
    val id: String,
    val title: String,
    val url: String,
    val previewUrl: String,
    val width: Int,
    val height: Int,
)

private const val GIF_API = "https://gifs.wizardchat.org/v1/gifs"
private val favouritesSerializer = ListSerializer(GiphyGif.serializer())

/** Downloads a URL's bytes (GIFs from Giphy) */
internal suspend fun download(url: String): ByteArray? = withContext(Dispatchers.IO) {
    runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            if (connection.responseCode !in 200..299) null else connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}

/** Trending and searched GIFs from Giphy (after consent), with favourites */
@Composable
fun GifPicker(onPick: suspend (GiphyGif) -> Unit) {
    var consented by remember { mutableStateOf(composerDefaults.getBoolean("gifConsent", false)) }
    var favouritesRaw by remember { mutableStateOf(composerDefaults.getString("gifFavourites", null)) }
    var search by remember { mutableStateOf("") }
    var showFavourites by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf(listOf<GiphyGif>()) }
    var loading by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val favourites = favouritesRaw?.let { runCatching { Json.decodeFromString(favouritesSerializer, it) }.getOrNull() }.orEmpty()

    fun toggleFavourite(gif: GiphyGif) {
        val list = favourites.toMutableList()
        if (!list.remove(gif)) list.add(0, gif)
        favouritesRaw = Json.encodeToString(favouritesSerializer, list.take(50))
        composerDefaults.edit().putString("gifFavourites", favouritesRaw).apply()
    }

    if (!consented) {
        Column(
            Modifier.fillMaxSize().padding(WZ.Space.space8),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PhIcon("images", size = WZ.SizeIcon.xxl, tint = theme.accent)
            Text(tr("composer.gifConsentTitle"), style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary)
            Text(
                tr("composer.gifConsentBody"),
                style = wizardFont(WZ.FontSize.md),
                color = theme.textMuted,
                textAlign = TextAlign.Center,
            )
            PrimaryButton(tr("composer.gifConsentEnable"), {
                consented = true
                composerDefaults.edit().putBoolean("gifConsent", true).apply()
            }, Modifier.widthIn(max = WZ.Size.sidebar))
        }
        return
    }

    LaunchedEffect(search) {
        if (search.isNotEmpty()) delay(350)
        loading = true
        loadGifs(search.trim())?.let { results = it }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SearchBar(search, { search = it }, tr("composer.searchGifs"), Modifier.weight(1f))
            Box(
                Modifier
                    .padding(end = WZ.Space.space3)
                    .size(WZ.Space.space10)
                    .clip(CircleShape)
                    .clickable { showFavourites = !showFavourites },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon(
                    "star",
                    if (showFavourites) PhWeight.fill else PhWeight.regular,
                    tint = if (showFavourites) theme.accent else theme.textMuted,
                    contentDescription = tr("nav.favourites"),
                )
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            val gifs = if (showFavourites) favourites else results
            LazyVerticalGrid(
                GridCells.Fixed(2),
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = WZ.Space.space5),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                items(gifs, key = { it.id }) { gif ->
                    val isFavourite = favourites.contains(gif)
                    Box(Modifier.semantics { contentDescription = gif.title }) {
                        RemoteAnimatedImage(
                            gif.previewUrl,
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(gif.width.toFloat() / gif.height.coerceAtLeast(1))
                                .clip(RoundedCornerShape(WZ.Radius.lg))
                                .clickable {
                                    if (!sending) {
                                        scope.launch {
                                            sending = true
                                            onPick(gif)
                                            sending = false
                                        }
                                    }
                                },
                        )
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .padding(WZ.Space.space2)
                                .size(WZ.Space.space9)
                                .clip(CircleShape)
                                .background(theme.overlay)
                                .clickable { toggleFavourite(gif) },
                            contentAlignment = Alignment.Center,
                        ) {
                            PhIcon(
                                "star",
                                if (isFavourite) PhWeight.fill else PhWeight.regular,
                                size = WZ.SizeIcon.xs,
                                tint = if (isFavourite) theme.warningColor else theme.textOnAccent,
                                contentDescription = if (isFavourite) tr("room.removeFavourite") else tr("room.addFavourite"),
                            )
                        }
                    }
                }
            }
            if (showFavourites && favourites.isEmpty()) {
                Text(
                    tr("composer.noFavourites"),
                    Modifier.padding(WZ.Space.space9),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            } else if (loading && results.isEmpty()) {
                Spinner()
            }
            if (sending) {
                Column(
                    Modifier
                        .clip(RoundedCornerShape(WZ.Radius.xl))
                        .background(theme.bgTertiary)
                        .padding(WZ.Space.space7),
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spinner(color = theme.textMuted)
                    Text(tr("composer.sendingGif"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                }
            }
        }
        Text(
            tr("composer.poweredByGiphy"),
            Modifier.align(Alignment.CenterHorizontally).padding(vertical = WZ.Space.space3),
            style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
            color = theme.textMuted,
        )
    }
}

private suspend fun loadGifs(query: String): List<GiphyGif>? {
    val endpoint = if (query.isEmpty()) {
        "$GIF_API/trending?limit=30"
    } else {
        "$GIF_API/search?q=${URLEncoder.encode(query, "UTF-8")}&limit=30"
    }
    val data = download(endpoint) ?: return null
    val json = runCatching { Json.parseToJsonElement(data.decodeToString()) as? JsonObject }.getOrNull() ?: return null
    val items = json["data"] as? JsonArray ?: return null
    fun JsonObject?.string(key: String) = (this?.get(key))?.jsonPrimitive?.contentOrNull
    return items.mapNotNull { element ->
        val item = element as? JsonObject ?: return@mapNotNull null
        val id = item.string("id") ?: return@mapNotNull null
        val images = item["images"] as? JsonObject ?: return@mapNotNull null
        val full = (images["downsized"] ?: images["original"]) as? JsonObject
        val preview = (images["fixed_width"] as? JsonObject) ?: full
        val url = full.string("url") ?: return@mapNotNull null
        val previewUrl = preview.string("url") ?: return@mapNotNull null
        GiphyGif(
            id = id,
            title = item.string("title") ?: L10n.format("composer.gif"),
            url = url,
            previewUrl = previewUrl,
            width = full.string("width")?.toIntOrNull() ?: 200,
            height = full.string("height")?.toIntOrNull() ?: 200,
        )
    }
}

private val gifBytes = object : LruCache<String, ByteArray>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: ByteArray) = value.size
}

/** A playing GIF from the web */
@Composable
fun RemoteAnimatedImage(url: String, modifier: Modifier = Modifier) {
    var drawable by remember(url) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(url) {
        val data = gifBytes.get(url) ?: download(url)?.also { gifBytes.put(url, it) } ?: return@LaunchedEffect
        drawable = withContext(Dispatchers.Default) { decodeAnimated(data) }
    }
    Box(modifier.background(theme.fill)) {
        val current = drawable
        if (current != null) {
            AndroidView(
                factory = { context -> ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP } },
                modifier = Modifier.fillMaxSize(),
                update = { view ->
                    if (view.drawable !== current) {
                        view.setImageDrawable(current)
                        (current as? AnimatedImageDrawable)?.start()
                    }
                },
            )
        }
    }
}

private fun decodeAnimated(data: ByteArray): Drawable? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        return runCatching { ImageDecoder.decodeDrawable(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data))) }.getOrNull()
    }
    val bitmap = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return null
    return BitmapDrawable(org.wizardchat.android.WizardApplication.instance.resources, bitmap)
}
