package org.wizardchat.android.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.UnreadState
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.people.CreateRoomSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.SpaceSummary
import org.wizardchat.tokens.WZ

/** The Spaces tab: a grid of the joined spaces, plus "Create or join" and "Explore" */
@Composable
fun SpacesScreen(roomList: RoomListModel, onCreateSpace: () -> Unit, onExplore: () -> Unit) {
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    val spaces = if (search.isEmpty()) roomList.spaces else roomList.spaces.filter { it.name.contains(search, ignoreCase = true) }

    Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        WizardTopBar(tr("room.settings.permissions.groups.spaces"), large = true, titleInRow = true) {
            BarButton("plus", tr("nav.createOrJoin"), onCreateSpace)
            BarButton("compass", tr("explore.title"), onExplore)
        }
        WizardTextField(
            search,
            { search = it },
            tr("common.search"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        LazyVerticalGrid(
            GridCells.Adaptive(92.dp),
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = WZ.Space.space6,
                end = WZ.Space.space6,
                top = WZ.Space.space4,
                bottom = LocalBottomBarInset.current + WZ.Space.space6,
            ),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space7),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            items(spaces, key = { it.id }) { space ->
                SpaceGridItem(
                    space,
                    roomList.unreadState(SidebarSelection.Space(space.id)),
                    onMarkRead = { scope.launch { roomList.markAsRead(roomList.rooms(SidebarSelection.Space(space.id))) } },
                ) {
                    navigator.push(Route.Space(space.id))
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SpaceGridItem(space: SpaceSummary, unread: UnreadState, onMarkRead: () -> Unit, onOpen: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        SpaceTile(space.name, unread, Modifier.combinedClickable(onClick = onOpen, onLongClick = { menuOpen = true })) {
            Avatar(space.name, space.avatarUrl, WZ.SizeAvatar.xl, cornerRadius = WZ.Radius.xl)
        }
        WizardMenu(
            menuOpen,
            { menuOpen = false },
            listOfNotNull(
                if (unread.unread) MenuItem(tr("common.markRead"), "envelope-simple-open") { onMarkRead() } else null,
                MenuItem(tr("common.copyLink"), "link-simple") {
                    copyToClipboard("https://matrix.to/#/${space.id}", L10n.format("timeline.linkCopied"))
                },
            ),
        )
    }
}

@Composable
private fun SpaceTile(name: String, unread: UnreadState, modifier: Modifier = Modifier, icon: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box {
            icon()
            if (unread.unread) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = WZ.Space.space2, y = -WZ.Space.space2)
                        .size(WZ.Space.space6)
                        .clip(CircleShape)
                        .background(if (unread.mention) theme.mention else theme.accent)
                        .border(WZ.BorderWidth.thick, theme.bgPrimary, CircleShape),
                )
            }
        }
        Text(
            name,
            style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
            color = theme.textPrimary,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private enum class CreateSpaceMode { choose, create, join }

/** Create a new space or join one by address */
@Composable
fun CreateSpaceSheet(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(CreateSpaceMode.choose) }
    var joinTarget by remember { mutableStateOf("") }
    var isWorking by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    if (mode == CreateSpaceMode.create) {
        CreateRoomSheet(null, onDismiss, onSpaceCreated = onCreated, onBack = { mode = CreateSpaceMode.choose })
        return
    }

    fun join() {
        scope.launch {
            isWorking = true
            errorMessage = null
            try {
                val spaceId = session.joinTarget(joinTarget)
                onCreated(spaceId)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("common.joinFailed", e.message ?: e.toString())
            } finally {
                isWorking = false
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr(if (mode == CreateSpaceMode.join) "space.join.title" else "space.addSpace"),
            leading = {
                if (mode == CreateSpaceMode.choose) {
                    BarTextButton(tr("common.cancel"), onDismiss)
                } else {
                    BarTextButton(tr("common.back"), {
                        errorMessage = null
                        mode = CreateSpaceMode.choose
                    })
                }
            },
        )
        Column(
            Modifier
                .fillMaxWidth()
                .background(theme.bgSecondary)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(vertical = WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            if (mode == CreateSpaceMode.choose) {
                GroupedSection {
                    Choice("plus-circle", tr("space.create.title"), tr("space.addSpaceHint")) { mode = CreateSpaceMode.create }
                    RowDivider()
                    Choice("link-simple", tr("space.join.title"), tr("space.joinHint")) { mode = CreateSpaceMode.join }
                }
            } else {
                Column(Modifier.padding(horizontal = WZ.Space.space6), verticalArrangement = Arrangement.spacedBy(WZ.Space.space6)) {
                    Field(tr("space.join.spaceId")) {
                        WizardTextField(
                            joinTarget,
                            { joinTarget = it },
                            "#spacename:server.org",
                            keyboardType = KeyboardType.Uri,
                            onSubmit = { if (!isWorking && joinTarget.isNotBlank()) join() },
                        )
                    }
                    PrimaryButton(
                        if (isWorking) tr("explore.joining") else tr("common.join"),
                        ::join,
                        enabled = !isWorking && joinTarget.isNotBlank(),
                    )
                }
            }
            errorMessage?.let {
                Text(it, Modifier.padding(horizontal = WZ.Space.space6), style = wizardFont(WZ.FontSize.sm), color = theme.error)
            }
        }
    }
}

/** A choice with its explanation under it, opening the next step */
@Composable
private fun Choice(icon: String, title: String, note: String, onClick: () -> Unit) {
    GroupedRow(title, icon = icon, subtitle = note, onClick = onClick) {
        PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
    }
}

@Composable
private fun Field(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Text(label, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        content()
    }
}
