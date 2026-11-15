package org.wizardchat.android.matrix

object RoomMention {
    private val pattern = Regex("(?:^|[\\s(])(@(?:room|everyone|all))(?=[\\s).,!?;:]|$)", RegexOption.IGNORE_CASE)

    fun isIn(text: String) = pattern.containsMatchIn(text)

    fun ranges(text: String) = pattern.findAll(text).mapNotNull { it.groups[1]?.range }.toList()
}
