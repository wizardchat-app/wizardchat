package org.wizardchat.android.matrix

import android.icu.text.BreakIterator

object StatusEmoji {
    fun split(text: String): Pair<String, String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return "" to ""
        val breaks = BreakIterator.getCharacterInstance().apply { setText(trimmed) }
        val first = trimmed.substring(0, breaks.following(0))
        if (!isEmoji(first)) return "" to trimmed
        return first to trimmed.substring(first.length).trim()
    }

    fun join(emoji: String, rest: String): String = listOf(emoji, rest.trim()).filter { it.isNotEmpty() }.joinToString(" ")

    fun isEmojiOnly(text: String?): Boolean {
        if (text.isNullOrBlank()) return false
        val (emoji, rest) = split(text)
        return emoji.isNotEmpty() && rest.isEmpty()
    }

    private fun isEmoji(cluster: String): Boolean {
        if (cluster.contains('⃣')) return true
        val cp = cluster.codePointAt(0)
        return cp in 0x1F000..0x1FAFF || cp in 0x2600..0x27BF || cp in 0x2300..0x23FF || cp in 0x2B00..0x2BFF ||
            cp in 0x2190..0x21FF || cp == 0x00A9 || cp == 0x00AE || cp == 0x203C || cp == 0x2049 || cp == 0x2122 ||
            cp == 0x2139 || cp == 0x3030 || cp == 0x303D || cp == 0x3297 || cp == 0x3299
    }
}
