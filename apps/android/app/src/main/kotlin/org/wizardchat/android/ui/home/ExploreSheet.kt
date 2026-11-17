package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ExploreModel
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.PublicRoom
import org.wizardchat.tokens.WZ

private enum class ExploreTab { featured, home, other }

/** The public room directory of matrix.org, your server or another one */
@Composable
fun ExploreSheet(roomList: RoomListModel, onDismiss: () -> Unit, onOpen: (String) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val model = remember(session.client) { session.client?.let { ExploreModel(it, scope) } }
    var tab by remember { mutableStateOf(ExploreTab.featured) }
    var otherServer by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var joining by remember { mutableStateOf(setOf<String>()) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val homeServer = session.userId?.split(":", limit = 2)?.getOrNull(1) ?: "your server"
    val currentServer = when (tab) {
        ExploreTab.featured -> "matrix.org"
        ExploreTab.home -> null
        ExploreTab.other -> otherServer.ifEmpty { null }
    }

    fun reload() {
        val server = when (tab) {
            ExploreTab.featured -> "matrix.org"
            ExploreTab.home -> null
            ExploreTab.other -> otherServer.ifEmpty { null }
        }
        model?.load(server, if (tab == ExploreTab.featured) null else search)
    }

    fun select(newTab: ExploreTab) {
        tab = newTab
        reload()
    }

    fun goToOtherServer() {
        if (otherServer.isEmpty()) return
        select(ExploreTab.other)
    }

    fun join(room: PublicRoom) {
        if (roomList.isJoined(room.id)) {
            onOpen(room.id)
            onDismiss()
            return
        }
        joining = joining + room.id
        errorMessage = null
        val via = currentServer ?: homeServer
        scope.launch {
            try {
                val roomId = session.joinTarget(room.id, listOf(via))
                onOpen(roomId)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("common.joinFailed", e.message ?: e.toString())
            } finally {
                joining = joining - room.id
            }
        }
    }

    LaunchedEffect(model) { reload() }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("explore.title"),
            trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) },
        )
        Column(
            Modifier
                .fillMaxHeight()
                .background(theme.bgSecondary)
                .imePadding()
                .padding(horizontal = WZ.Space.space6)
                .padding(top = WZ.Space.space4),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(CircleShape)
                    .background(theme.bgPrimary)
                    .border(1.dp, theme.border, CircleShape)
                    .padding(WZ.Space.space1),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Pill(tr("explore.tabFeatured"), tab == ExploreTab.featured) { select(ExploreTab.featured) }
                Pill(homeServer, tab == ExploreTab.home, Modifier.weight(1f, fill = false)) { select(ExploreTab.home) }
                Row(
                    Modifier
                        .weight(1f)
                        .height(WZ.Space.space9)
                        .clip(CircleShape)
                        .background(if (tab == ExploreTab.other) theme.bgSecondary else Color.Transparent)
                        .padding(horizontal = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    InlineField(
                        otherServer,
                        { otherServer = it },
                        tr("settings.privacy.other"),
                        wizardFont(WZ.FontSize.sm, FontWeight.Medium),
                        KeyboardType.Uri,
                        Modifier.weight(1f),
                        onSubmit = ::goToOtherServer,
                    )
                    if (otherServer.isNotEmpty()) {
                        Box(Modifier.clip(CircleShape).clickable(onClick = ::goToOtherServer).padding(WZ.Space.space1)) {
                            PhIcon("arrow-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.accent, contentDescription = tr("explore.go"))
                        }
                    }
                }
            }
            if (tab != ExploreTab.featured) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = WZ.Space.space11)
                        .clip(RoundedCornerShape(WZ.Radius.lg))
                        .background(theme.fill)
                        .padding(horizontal = WZ.Space.space5),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                ) {
                    PhIcon("magnifying-glass", size = WZ.SizeIcon.xs, tint = theme.textMuted)
                    InlineField(
                        search,
                        { search = it },
                        tr("explore.searchPlaceholder"),
                        wizardFont(WZ.FontSize.md),
                        KeyboardType.Text,
                        Modifier.weight(1f),
                        onSubmit = ::reload,
                    )
                }
            }
            if (model != null) Box(Modifier.weight(1f)) {
                Results(
                    model,
                    if (tab == ExploreTab.featured) tr("explore.featuredSpaces") else tr("explore.publicRoomsOn", currentServer ?: homeServer),
                    isJoined = { roomList.isJoined(it.id) },
                    joining = joining,
                    errorMessage = errorMessage,
                    onJoin = ::join,
                )
            }
        }
    }
}

@Composable
private fun Pill(title: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(WZ.Space.space9)
            .clip(CircleShape)
            .background(if (selected) theme.bgSecondary else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
            color = if (selected) theme.textPrimary else theme.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun InlineField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    style: TextStyle,
    keyboardType: KeyboardType,
    modifier: Modifier = Modifier,
    onSubmit: () -> Unit,
) {
    BasicTextField(
        value,
        onValueChange,
        modifier,
        textStyle = style.copy(color = theme.textPrimary),
        singleLine = true,
        cursorBrush = SolidColor(theme.accent),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, autoCorrectEnabled = false, imeAction = ImeAction.Go),
        keyboardActions = KeyboardActions(onGo = { onSubmit() }),
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = style, color = theme.textMuted, maxLines = 1)
                inner()
            }
        },
    )
}

@Composable
private fun Results(
    model: ExploreModel,
    title: String,
    isJoined: (PublicRoom) -> Boolean,
    joining: Set<String>,
    errorMessage: String?,
    onJoin: (PublicRoom) -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(bottom = WZ.Space.space6),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        item(key = "title") {
            Text(
                title,
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textMuted,
            )
        }
        val error = errorMessage ?: model.error?.let { L10n.format("explore.fetchError", it) }
        if (error != null) {
            item(key = "error") { Text(error, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
        }
        if (model.rooms.isEmpty() && !model.isLoading && model.error == null) {
            item(key = "empty") {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = WZ.Space.space9),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    Text(tr("explore.noResults"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                    Text(tr("explore.tryADifferentSearch"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, textAlign = TextAlign.Center)
                }
            }
        }
        items(model.rooms, key = { it.id }) { room ->
            RoomCard(room, isJoined(room), room.id in joining) { onJoin(room) }
            if (room.id == model.rooms.lastOrNull()?.id) LaunchedEffect(room.id) { model.loadNextPage() }
        }
        if (model.isLoading) {
            item(key = "loading") {
                Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() }
            }
        }
        item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
    }
}

private fun formatCount(count: Long): String =
    if (count >= 1000) String.format(Locale.getDefault(), "%.1fk", count / 1000.0) else "$count"

/** "1.2k members": the translation takes a number, so the shortened count goes in its place */
private fun memberCountText(count: Long): String {
    if (count < 1000) return L10n.format("explore.memberCount", count.toInt())
    val marker = 987654321
    return L10n.format("explore.memberCount", marker).replace(String.format(Locale.getDefault(), "%d", marker), formatCount(count))
}

@Composable
private fun RoomCard(room: PublicRoom, isJoined: Boolean, isJoining: Boolean, onJoin: () -> Unit) {
    val name = room.name ?: room.alias ?: room.id
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(WZ.Radius.md))
            .background(theme.bgPrimary)
            .border(1.dp, theme.border, RoundedCornerShape(WZ.Radius.md))
            .padding(WZ.Space.space5),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Avatar(name, room.avatarUrl, WZ.SizeAvatar.md, cornerRadius = WZ.Radius.sm)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                Text(name, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                room.alias?.let {
                    Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        room.topic?.takeIf { it.isNotEmpty() }?.let {
            Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                PhIcon("users", size = WZ.SizeIcon.sm, tint = theme.textMuted)
                Text(memberCountText(room.memberCount), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            Box(
                Modifier
                    .height(WZ.Space.space9)
                    .alpha(if (isJoining) 0.6f else 1f)
                    .clip(RoundedCornerShape(WZ.Radius.sm))
                    .background(if (isJoined) theme.bgTertiary else theme.accent)
                    .clickable(enabled = !isJoining, onClick = onJoin)
                    .padding(horizontal = WZ.Space.space5),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when {
                        isJoined -> tr("common.open")
                        isJoining -> tr("explore.joining")
                        else -> tr("common.join")
                    },
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = if (isJoined) theme.textPrimary else theme.textOnAccent,
                )
            }
        }
    }
}
