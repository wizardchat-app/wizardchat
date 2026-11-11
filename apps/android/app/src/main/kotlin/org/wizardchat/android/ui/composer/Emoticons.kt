package org.wizardchat.android.ui.composer

object Emoticons {
    private val map = linkedMapOf(
        ">:-(" to "😠", ">:(" to "😠", ":'(" to "😢", ":')" to "🥲", "</3" to "💔", "<3" to "❤️",
        ":-)" to "🙂", ":)" to "🙂", ":-(" to "🙁", ":(" to "🙁", ":-D" to "😄", ":D" to "😄",
        "xD" to "😆", "XD" to "😆", ";-)" to "😉", ";)" to "😉",
        ":-P" to "😛", ":P" to "😛", ":-p" to "😛", ":p" to "😛",
        ":-O" to "😮", ":O" to "😮", ":-o" to "😮", ":o" to "😮",
        ":-|" to "😐", ":|" to "😐", ":-/" to "😕", ":/" to "😕", ":-*" to "😘", ":*" to "😘",
        "B-)" to "😎", "^_^" to "😊",
    )

    private val pattern = Regex(
        "(^|\\s)(" + map.keys.sortedByDescending { it.length }.joinToString("|") { Regex.escape(it) } + ")(?=$|\\s|[.,!?])",
    )
    private val code = Regex("```[\\s\\S]*?```|`[^`\\n]*`")

    fun replace(text: String): String {
        val out = StringBuilder()
        var last = 0
        for (match in code.findAll(text)) {
            out.append(convert(text.substring(last, match.range.first))).append(match.value)
            last = match.range.last + 1
        }
        return out.append(convert(text.substring(last))).toString()
    }

    private fun convert(text: String): String =
        pattern.replace(text) { it.groupValues[1] + map.getValue(it.groupValues[2]) }
}
