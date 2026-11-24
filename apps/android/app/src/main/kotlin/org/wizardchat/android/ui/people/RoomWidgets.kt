package org.wizardchat.android.ui.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import java.util.Locale
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.stateEvents
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Widget
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

@Composable
internal fun RoomWidgetsScreen(roomId: String, client: WizardClient, canManage: Boolean, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val dark = theme.isDark
    var widgets by remember { mutableStateOf<List<Widget>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Widget?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        widgets = runCatching { client.widgets(roomId) }.getOrDefault(emptyList())
        loaded = true
    }
    LaunchedEffect(roomId) { load() }

    SheetPage {
        WizardTopBar(tr("room.settings.widgets.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                GroupedSection(footer = tr("room.settings.widgets.privacy")) {
                    if (loaded && widgets.isEmpty()) {
                        GroupedRow(tr("room.settings.widgets.noWidgets"), titleColor = theme.textMuted)
                    }
                    widgets.forEachIndexed { index, widget ->
                        if (index > 0) RowDivider()
                        val host = runCatching { java.net.URI(widget.url).host }.getOrNull() ?: widget.url
                        GroupedRow(
                            widget.name?.takeIf { it.isNotBlank() } ?: tr("room.settings.widgets.untitled"),
                            icon = "puzzle-piece",
                            iconTint = theme.textMuted,
                            subtitle = widget.creator?.let { L10n.format("room.settings.widgets.addedBy", it) } ?: host,
                            onClick = {
                                scope.launch {
                                    val language = Locale.getDefault().language
                                    runCatching { client.widgetUrl(roomId, widget, if (dark) "dark" else "light", language) }
                                        .onSuccess { uriHandler.openUri(it) }
                                }
                            },
                        ) {
                            if (canManage) BarTextButton(tr("common.remove"), { removing = widget })
                        }
                    }
                }
            }
            if (canManage) {
                item {
                    GroupedSection {
                        ActionRow(tr("room.settings.widgets.addWidgetBtn"), "plus", { adding = true })
                    }
                }
            }
            error?.let { message ->
                item { Text(message, Modifier.padding(WZ.Space.space6), style = wizardFont(WZ.FontSize.sm), color = theme.error) }
            }
        }
    }

    if (adding) {
        AddWidgetDialog(onDismiss = { adding = false }) { name, url ->
            adding = false
            scope.launch {
                runCatching { client.setWidget(roomId, null, name, url) }
                    .onFailure { error = L10n.format("room.settings.widgets.widgetSaveFailed", it.message ?: "") }
                load()
            }
        }
    }
    removing?.let { widget ->
        ConfirmDialog(
            title = L10n.format("room.settings.widgets.removeWidgetConfirm", widget.name ?: tr("room.settings.widgets.untitled")),
            confirmLabel = tr("room.settings.widgets.removeWidget"),
            onConfirm = {
                removing = null
                scope.launch {
                    runCatching { client.removeWidget(roomId, widget.id) }
                        .onFailure { error = L10n.format("room.settings.widgets.widgetRemoveFailed", it.message ?: "") }
                    load()
                }
            },
            onDismiss = { removing = null },
        )
    }
}

@Composable
private fun AddWidgetDialog(onDismiss: () -> Unit, onAdd: (String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgPrimary,
        title = { Text(tr("room.settings.widgets.addWidgetBtn"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                WizardTextField(name, { name = it }, tr("common.name"))
                WizardTextField(url, { url = it }, tr("room.settings.widgets.url"), keyboardType = KeyboardType.Uri)
                Text(tr("room.settings.widgets.urlHint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        },
        confirmButton = { BarTextButton(tr("common.save"), { if (url.isNotBlank()) onAdd(name, url.trim()) }, bold = true) },
        dismissButton = { BarTextButton(tr("common.cancel"), onDismiss) },
    )
}

internal data class RoomBridge(
    val key: String,
    val bot: String,
    val creator: String?,
    val protocol: Part,
    val network: Part?,
    val channel: Part,
) {
    data class Part(val id: String, val name: String?, val avatarUrl: String?, val externalUrl: String?) {
        val label get() = name ?: id
    }
}

internal suspend fun loadBridges(session: org.wizardchat.android.matrix.MatrixSession, roomId: String): List<RoomBridge> {
    val byKey = LinkedHashMap<String, RoomBridge>()
    for (type in listOf("m.bridge", "uk.half-shot.bridge")) {
        for ((key, content) in session.stateEvents(type, roomId)) {
            if (key in byKey) continue
            parseBridge(key, content)?.let { byKey[key] = it }
        }
    }
    return byKey.values.toList()
}

private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.takeIf { it.isNotEmpty() }

private fun bridgePart(value: JsonElement?): RoomBridge.Part? {
    val fields = value as? JsonObject ?: return null
    val idValue = fields["id"] as? JsonPrimitive ?: return null
    val id = idValue.contentOrNull?.takeIf { it.isNotEmpty() } ?: return null
    return RoomBridge.Part(
        id = id,
        name = fields["displayname"].text(),
        avatarUrl = fields["avatar_url"].text()?.takeIf { it.startsWith("mxc://") },
        externalUrl = fields["external_url"].text()?.takeIf { it.startsWith("http") },
    )
}

private fun parseBridge(key: String, content: JsonObject): RoomBridge? {
    val bot = content["bridgebot"].text() ?: return null
    val protocol = bridgePart(content["protocol"]) ?: return null
    val channel = bridgePart(content["channel"]) ?: return null
    return RoomBridge(key, bot, content["creator"].text(), protocol, bridgePart(content["network"]), channel)
}

@Composable
internal fun RoomBridgesScreen(roomId: String, bridges: List<RoomBridge>, onBack: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    var profileUserId by remember { mutableStateOf<String?>(null) }
    SheetPage {
        WizardTopBar(tr("room.settings.bridges.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            bridges.forEach { bridge ->
                item(key = bridge.key) {
                    GroupedSection {
                        GroupedRow(
                            bridge.protocol.label,
                            subtitle = listOfNotNull(bridge.network?.label, bridge.channel.label).joinToString(" · "),
                            onClick = bridge.channel.externalUrl?.let { url -> { uriHandler.openUri(url) } },
                        ) {
                            Avatar(bridge.protocol.label, bridge.protocol.avatarUrl, WZ.SizeAvatar.sm, initial = true)
                        }
                        RowDivider()
                        GroupedRow(tr("room.settings.bridges.bot"), subtitle = bridge.bot, onClick = { profileUserId = bridge.bot })
                        bridge.creator?.let { creator ->
                            RowDivider()
                            GroupedRow(tr("room.settings.bridges.createdBy"), subtitle = creator, onClick = { profileUserId = creator })
                        }
                    }
                }
            }
        }
    }
    profileUserId?.let { UserProfileSheet(it, roomId, onDismiss = { profileUserId = null }) }
}
