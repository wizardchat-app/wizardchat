package org.wizardchat.android.ui.room

import android.icu.lang.UCharacter
import android.icu.lang.UProperty
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import android.text.format.Formatter
import android.util.Patterns
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.MessageMention

/** Pills for mentions: [own] for you and @room, [other] for everyone else */
data class MentionColors(val own: Color, val other: Color) {
    fun pill(isOwn: Boolean): SpanStyle {
        val color = if (isOwn) own else other
        return SpanStyle(color = color, background = color.copy(alpha = 0.18f), fontWeight = FontWeight.Bold)
    }
}

/** Links, mentions and spoilers in message text */
object MessageText {
    fun isEmojiOnly(text: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        val points = text.codePoints().toArray()
        var found = false
        points.forEachIndexed { index, point ->
            val next = points.getOrNull(index + 1)
            val allowed = when {
                Character.isWhitespace(point) -> true
                point == 0x200D || point == 0xFE0F || point == 0x20E3 || point in 0xE0020..0xE007F -> true
                UCharacter.hasBinaryProperty(point, UProperty.EMOJI_PRESENTATION) ||
                    UCharacter.hasBinaryProperty(point, UProperty.EMOJI_MODIFIER) -> true.also { found = true }
                UCharacter.hasBinaryProperty(point, UProperty.EMOJI) && (next == 0xFE0F || next == 0x20E3) -> true.also { found = true }
                else -> false
            }
            if (!allowed) return false
        }
        return found
    }

    private data class Match(val start: Int, val end: Int, val url: String)

    private fun links(text: String): List<Match> {
        val matcher = Patterns.WEB_URL.matcher(text)
        val result = mutableListOf<Match>()
        while (matcher.find()) {
            val raw = matcher.group()
            // Plain words with a dot ("e.g") aren't links; only a scheme or a host-like shape counts
            val url = if (raw.contains("://")) raw else if (raw.contains('.') && !raw.startsWith(".")) "https://$raw" else continue
            if (!raw.contains("://") && text.getOrNull(matcher.start() - 1) == '@') continue
            result += Match(matcher.start(), matcher.end(), url)
        }
        return result
    }

    /**
     * The text with tappable links (shortened to their host when [prettifyLinks] is on), [mentions] and
     * "@room" as pills when [mentionColors] is set (tapping one calls [onMention], else opens matrix.to),
     * and [spoilers] covered by [cover] (their links removed).
     */
    fun attributed(
        text: String,
        prettifyLinks: Boolean,
        linkColor: Color,
        spoilers: List<String> = emptyList(),
        cover: Color = Color.Unspecified,
        mentions: List<MessageMention> = emptyList(),
        mentionColors: MentionColors? = null,
        onMention: ((String) -> Unit)? = null,
    ): AnnotatedString {
        val parts = mutableListOf<Pair<String, String?>>()
        var cursor = 0
        for (match in links(text)) {
            if (match.start > cursor) parts += text.substring(cursor, match.start) to null
            val original = text.substring(match.start, match.end)
            parts += (if (prettifyLinks) prettified(match.url) ?: original else original) to match.url
            cursor = match.end
        }
        if (cursor < text.length) parts += text.substring(cursor) to null
        val shown = parts.joinToString("") { it.first }
        val hidden = spoilerRanges(shown, spoilers)
        val linked = mutableListOf<IntRange>()
        return buildAnnotatedString {
            var offset = 0
            for ((part, url) in parts) {
                val range = offset until offset + part.length
                if (url != null && hidden.none { it.overlaps(range) }) {
                    pushLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = linkColor))))
                    append(part)
                    pop()
                    linked += range
                } else {
                    append(part)
                }
                offset += part.length
            }
            if (mentionColors != null) {
                for ((range, mention) in mentionRanges(shown, mentions)) {
                    if ((hidden + linked).any { it.overlaps(range) }) continue
                    val pill = mentionColors.pill(mention?.isOwn != false)
                    if (mention == null) {
                        addStyle(pill, range.first, range.last + 1)
                        continue
                    }
                    val styles = TextLinkStyles(pill)
                    if (onMention != null) {
                        addLink(LinkAnnotation.Clickable(mention.userId, styles) { onMention(mention.userId) }, range.first, range.last + 1)
                    } else {
                        addLink(LinkAnnotation.Url("https://matrix.to/#/${mention.userId}", styles), range.first, range.last + 1)
                    }
                }
            }
            for (range in hidden) {
                addStyle(SpanStyle(color = Color.Transparent, background = cover), range.first, range.last + 1)
            }
        }
    }

    /** Each mention's label in order, then every "@room" (with no mention) */
    private fun mentionRanges(text: String, mentions: List<MessageMention>): List<Pair<IntRange, MessageMention?>> {
        val result = mutableListOf<Pair<IntRange, MessageMention?>>()
        var cursor = 0
        for (mention in mentions) {
            val start = text.indexOf(mention.label, cursor)
            if (start < 0) continue
            result += (start until start + mention.label.length) to mention
            cursor = start + mention.label.length
        }
        var start = text.indexOf("@room")
        while (start >= 0) {
            val range = start until start + 5
            if (result.none { it.first.overlaps(range) }) result += range to null
            start = text.indexOf("@room", start + 5)
        }
        return result
    }

    private fun IntRange.overlaps(other: IntRange) = first <= other.last && other.first <= last

    private fun spoilerRanges(text: String, spoilers: List<String>): List<IntRange> {
        val ranges = mutableListOf<IntRange>()
        for (spoiler in spoilers) {
            if (spoiler.isEmpty()) continue
            var start = text.indexOf(spoiler)
            while (start >= 0) {
                ranges += start until start + spoiler.length
                start = text.indexOf(spoiler, start + spoiler.length)
            }
        }
        return ranges
    }

    private fun prettified(url: String): String? {
        val uri = Uri.parse(url)
        if (uri.scheme != "http" && uri.scheme != "https") return null
        return uri.host?.removePrefix("www.")
    }

    fun prettifiedLink(text: String, link: String): String? = if (bare(text) == bare(link)) prettified(link) else null

    private fun bare(link: String): String =
        link.trim().lowercase().let { text -> text.substringAfter("://", text) }.trimEnd('/')

    /** The first http(s) link that isn't a matrix.to link, for the link preview */
    fun firstPreviewURL(text: String): String? = links(text).map { it.url }.firstOrNull { url ->
        val uri = Uri.parse(url)
        (uri.scheme?.lowercase() == "http" || uri.scheme?.lowercase() == "https") && uri.host?.lowercase() != "matrix.to"
    }

    fun allWebURLs(text: String): List<String> = links(text).map { it.url }.filter {
        val scheme = Uri.parse(it).scheme?.lowercase()
        scheme == "http" || scheme == "https"
    }
}

/** Long-pressing anything inside a message opens its menu; media taps use it so they don't swallow it */
internal val LocalMessageLongPress = compositionLocalOf<(() -> Unit)?> { null }

/** Plays GIFs in previews regardless of the autoplay setting */
internal val LocalAnimatesMedia = compositionLocalOf { false }

internal object Formats {
    private val zone get() = ZoneId.systemDefault()
    private val locale get() = Locale.getDefault()

    fun time(instant: Instant): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(instant.atZone(zone))

    fun abbreviatedDate(instant: Instant): String =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(instant.atZone(zone))

    fun abbreviatedDateTime(instant: Instant): String =
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).format(instant.atZone(zone))

    /** "October 31, 2026" */
    fun longDate(instant: Instant): String =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "MMMMdy"), locale).format(instant.atZone(zone))

    fun isToday(instant: Instant): Boolean = instant.atZone(zone).toLocalDate() == LocalDate.now(zone)

    fun isYesterday(instant: Instant): Boolean = instant.atZone(zone).toLocalDate() == LocalDate.now(zone).minusDays(1)

    /** "1:05" */
    fun duration(seconds: Double): String {
        val total = seconds.toLong()
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val secs = total % 60
        return if (hours > 0) String.format(locale, "%d:%02d:%02d", hours, minutes, secs) else String.format(locale, "%d:%02d", minutes, secs)
    }

    fun fileSize(bytes: Long): String = Formatter.formatShortFileSize(WizardApplication.instance, bytes)
}
