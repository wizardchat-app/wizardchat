package org.wizardchat.android.ui.composer

import org.wizardchat.android.matrix.readableError
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.ui.L10n

/** A `/command` the composer understands */
data class SlashCommand(val name: String, val description: String) {
    enum class Result { handled, unknown }

    companion object {
        val all: List<SlashCommand>
            get() = listOf(
                SlashCommand("me", L10n.format("timeline.commands.me.description")),
                SlashCommand("notice", L10n.format("timeline.commands.notice.description")),
                SlashCommand("spoiler", L10n.format("timeline.commands.spoiler.description")),
                SlashCommand("join", L10n.format("timeline.commands.join.description")),
                SlashCommand("part", L10n.format("timeline.commands.part.description")),
                SlashCommand("invite", L10n.format("timeline.commands.invite.description")),
                SlashCommand("kick", L10n.format("timeline.commands.kick.description")),
                SlashCommand("ban", L10n.format("timeline.commands.ban.description")),
                SlashCommand("unban", L10n.format("timeline.commands.unban.description")),
                SlashCommand("topic", L10n.format("timeline.commands.topic.description")),
                SlashCommand("roomname", L10n.format("timeline.commands.roomname.description")),
                SlashCommand("nick", L10n.format("timeline.commands.nick.description")),
            )

        /** Runs `text` as a command; null if it isn't one, `unknown` if no command has that name */
        suspend fun run(text: String, timeline: TimelineModel, session: MatrixSession, replyTo: String?): Result? {
            val body = text.drop(1)
            val name = body.takeWhile { !it.isWhitespace() }.lowercase()
            val args = body.drop(name.length).trim(' ', '\t')
            if (name.isEmpty()) return null
            val client = timeline.client
            val roomId = timeline.roomId

            fun firstWord(): Pair<String, String?> {
                val parts = args.split(" ", limit = 2)
                return parts.first() to parts.getOrNull(1)
            }

            try {
                when (name) {
                    "me" -> timeline.send(args, emote = true, replyTo = replyTo)
                    "notice" -> timeline.sendNotice(args, replyTo = replyTo)
                    "spoiler" -> {
                        var reason: String? = null
                        var message = args
                        if (args.startsWith("\"")) {
                            val end = args.indexOf('"', 1)
                            if (end > 0) {
                                reason = args.substring(1, end)
                                message = args.substring(end + 1).trim(' ', '\t')
                            }
                        }
                        val escaped = message.replace("&", "&amp;").replace("<", "&lt;")
                        val span = reason?.let { "<span data-mx-spoiler=\"$it\">$escaped</span>" }
                            ?: "<span data-mx-spoiler>$escaped</span>"
                        timeline.send(message, html = span, replyTo = replyTo)
                    }
                    "join" -> joinTarget(args).let { (target, via) -> client.join(target, via) }
                    "part" -> client.leave(roomId)
                    "invite" -> client.invite(roomId, firstWord().first)
                    "kick" -> firstWord().let { (user, reason) -> client.kick(roomId, user, reason) }
                    "ban" -> firstWord().let { (user, reason) -> client.ban(roomId, user, reason) }
                    "unban" -> client.unban(roomId, firstWord().first)
                    "topic" -> client.setRoomTopic(roomId, args)
                    "roomname" -> client.setRoomName(roomId, args)
                    "nick" -> {
                        client.setDisplayName(args)
                        session.setProfile(args, session.avatarUrl)
                    }
                    else -> return Result.unknown
                }
            } catch (e: Exception) {
                timeline.sendError = readableError(e)
            }
            return Result.handled
        }

        /** A room ID, alias or matrix.to link and its `via` servers */
        private fun joinTarget(idOrAliasOrLink: String): Pair<String, List<String>> {
            var target = idOrAliasOrLink.trim()
            target.indexOf("matrix.to/#/").takeIf { it >= 0 }?.let { target = target.substring(it + "matrix.to/#/".length) }
            val via = mutableListOf<String>()
            val query = target.indexOf('?')
            if (query >= 0) {
                target.substring(query + 1).split("&").forEach { param ->
                    val (key, value) = param.split("=", limit = 2).let { it[0] to it.getOrNull(1) }
                    if (key == "via" && value != null) via += java.net.URLDecoder.decode(value, "UTF-8")
                }
                target = target.substring(0, query)
            }
            target = runCatching { java.net.URLDecoder.decode(target, "UTF-8") }.getOrDefault(target)
            return target to via
        }
    }
}
