package org.wizardchat.android.ui.people

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.tr

@Composable
internal fun NicknameRow(roomId: String, space: Boolean, push: (PeoplePage) -> Unit) {
    val client = LocalSession.current.client
    var nickname by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(roomId) { nickname = runCatching { client?.roomNickname(roomId) }.getOrNull() }
    NavRow(tr("room.nickname.title"), "user", { push(PeoplePage.Nickname(roomId, space)) }, value = nickname)
}

@Composable
internal fun NicknameScreen(roomId: String, space: Boolean, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(roomId) {
        current = runCatching { session.client?.roomNickname(roomId) }.getOrNull()
        name = current ?: ""
    }

    val dirty = name.trim() != (current ?: "")

    fun save(value: String) {
        val client = session.client ?: return
        saving = true
        scope.launch {
            try {
                if (space) {
                    val failed = client.setSpaceNickname(roomId, value).toInt()
                    if (failed > 0) {
                        error = L10n.plural("room.nickname.someFailed", failed, failed)
                        current = runCatching { client.roomNickname(roomId) }.getOrNull()
                        return@launch
                    }
                } else {
                    client.setRoomNickname(roomId, value)
                }
                onBack()
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                saving = false
            }
        }
    }

    SheetPage {
        WizardTopBar(tr("room.nickname.title"), onBack = onBack, actions = {
            BarTextButton(tr("common.save"), { save(name) }, enabled = dirty && !saving, bold = true)
        })
        FormList(Modifier.weight(1f)) {
            item {
                GroupedSection(footer = tr(if (space) "room.nickname.spaceNote" else "room.nickname.roomNote")) {
                    FormField(name, { name = it }, session.displayName ?: "", onSubmit = { if (dirty && !saving) save(name) })
                }
            }
            if (current != null || space) {
                item {
                    GroupedSection {
                        ActionRow(tr("room.nickname.reset"), null, { save("") }, enabled = !saving)
                    }
                }
            }
            item { ErrorText(error) }
        }
    }
}
