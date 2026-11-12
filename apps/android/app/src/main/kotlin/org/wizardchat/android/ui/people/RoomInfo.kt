package org.wizardchat.android.ui.people

import org.wizardchat.android.ui.room.JumpToDateDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.room.PinnedMessagesScreen
import org.wizardchat.android.ui.room.RoomMediaScreen
import org.wizardchat.android.ui.search.RoomSearchScreen
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.SoundPack
import org.wizardchat.android.ui.voice.SoundPackEditorScreen
import org.wizardchat.android.ui.voice.RoomSoundPacksScreen
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** Pages pushed inside room info and space settings */
internal sealed interface PeoplePage {
    data class Members(val roomId: String) : PeoplePage
    data class Roles(val roomId: String) : PeoplePage
    data class Packs(val roomId: String) : PeoplePage
    data class PackEditor(val roomId: String, val key: String, val content: JsonObject, val canEdit: Boolean) : PeoplePage
    data class SoundPacks(val roomId: String) : PeoplePage
    data class SoundPackEditor(val roomId: String, val pack: SoundPack, val canEdit: Boolean) : PeoplePage
    data object Search : PeoplePage
    data object Media : PeoplePage
    data class Pinned(val canPin: Boolean) : PeoplePage
    data class Widgets(val canManage: Boolean) : PeoplePage
    data object Bridges : PeoplePage
}

/** The pages shared by room info and space settings; false for pages the caller shows itself */
@Composable
internal fun SharedPage(page: PeoplePage, push: (PeoplePage) -> Unit, pop: () -> Unit): Boolean {
    when (page) {
        is PeoplePage.Members -> MembersScreen(page.roomId, pop)
        is PeoplePage.Roles -> RolesPermissionsScreen(page.roomId, pop)
        is PeoplePage.Packs -> RoomPacksScreen(page.roomId, pop) { key, content, canEdit ->
            push(PeoplePage.PackEditor(page.roomId, key, content, canEdit))
        }
        is PeoplePage.PackEditor -> PackEditorScreen(page.roomId, page.key, page.content, page.canEdit, pop)
        is PeoplePage.SoundPacks -> RoomSoundPacksScreen(page.roomId, pop) { pack, canEdit ->
            push(PeoplePage.SoundPackEditor(page.roomId, pack, canEdit))
        }
        is PeoplePage.SoundPackEditor -> {
            val client = LocalSession.current.client
            SoundPackEditorScreen(page.roomId, page.pack, page.canEdit, pop, onDelete = {
                runCatching { client?.deleteSoundPack(page.roomId, page.pack.stateKey ?: "") }
            })
        }
        else -> return false
    }
    return true
}

/** Room details and settings; `onJump` opens a message */
@Composable
fun RoomInfoSheet(room: RoomSummary, client: WizardClient, onDismiss: () -> Unit, onJump: (String) -> Unit) {
    val context = LocalContext.current
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var stack by remember { mutableStateOf(listOf<PeoplePage>()) }
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var originalName by remember { mutableStateOf("") }
    var originalTopic by remember { mutableStateOf("") }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var hasCustomAvatar by remember { mutableStateOf(false) }
    var confirmResetAvatar by remember { mutableStateOf(false) }
    var memberCount by remember { mutableStateOf(0L) }
    var encrypted by remember { mutableStateOf(false) }
    var isFavourite by remember { mutableStateOf(false) }
    var alias by remember { mutableStateOf<String?>(null) }
    var canEditName by remember { mutableStateOf(false) }
    var canEditTopic by remember { mutableStateOf(false) }
    var canEditAvatar by remember { mutableStateOf(false) }
    var canInvite by remember { mutableStateOf(false) }
    var canPin by remember { mutableStateOf(false) }
    var canManageWidgets by remember { mutableStateOf(false) }
    var canEnableEncryption by remember { mutableStateOf(false) }
    var isPublic by remember { mutableStateOf(false) }
    var confirmEncryption by remember { mutableStateOf(false) }
    var bridges by remember { mutableStateOf<List<RoomBridge>>(emptyList()) }
    var pinnedCount by remember { mutableStateOf(0) }
    var showInvite by remember { mutableStateOf(false) }
    var showJumpToDate by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var reloads by remember { mutableIntStateOf(0) }
    val hasChanges = name != originalName || topic != originalTopic

    // Coming back from a page refreshes the counts
    LaunchedEffect(reloads, stack.isEmpty()) {
        if (stack.isNotEmpty()) return@LaunchedEffect
        val info = runCatching { client.roomDetails(room.id) }.getOrNull()
        if (!loaded) {
            name = info?.name ?: room.name ?: ""
            topic = info?.topic ?: ""
            originalName = name
            originalTopic = topic
            loaded = true
        }
        val custom = info?.avatarUrl
        hasCustomAvatar = custom != null
        val partner = room.dmUserId
        avatarUrl = when {
            custom != null -> custom
            room.isDirect && partner != null -> session.memberProfile(partner, room.id).avatarUrl ?: room.dmUserAvatar
            info == null -> room.avatarUrl
            else -> null
        }
        alias = info?.canonicalAlias
        pinnedCount = info?.pinnedEventIds?.size ?: 0
        isFavourite = info?.isFavourite ?: room.isFavourite
        memberCount = info?.memberCount ?: room.memberCount
        encrypted = info?.isEncrypted ?: room.isEncrypted
        info?.permissions?.let { permissions ->
            canEditName = permissions.changeName
            canEditTopic = permissions.changeTopic
            canEditAvatar = permissions.changeAvatar
            canInvite = permissions.invite
            canPin = permissions.pin
            canManageWidgets = permissions.manageWidgets
            canEnableEncryption = permissions.enableEncryption
        }
        isPublic = info?.isPublic ?: false
        bridges = loadBridges(session, room.id)
    }

    fun save() {
        scope.launch {
            saving = true
            try {
                if (name != originalName) client.setRoomName(room.id, name)
                if (topic != originalTopic) client.setRoomTopic(room.id, topic)
                originalName = name
                originalTopic = topic
                error = null
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                saving = false
            }
        }
    }

    val pickAvatar = rememberImagePicker { uri ->
        scope.launch {
            saving = true
            try {
                val jpeg = avatarJpeg(context, uri) ?: return@launch
                client.setRoomAvatar(room.id, jpeg, "image/jpeg")
                delay(500)
                avatarUrl = runCatching { client.roomDetails(room.id) }.getOrNull()?.avatarUrl
                hasCustomAvatar = avatarUrl != null
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                saving = false
            }
        }
    }

    val push = { page: PeoplePage -> stack = stack + page }
    val pop = { stack = stack.dropLast(1) }

    WizardSheet(onDismiss) {
        CompositionLocalProvider(LocalCloseParents provides onDismiss) {
            BackHandler(enabled = stack.isNotEmpty()) { pop() }
            val page = stack.lastOrNull()
            if (page != null) {
                if (!SharedPage(page, push, pop)) {
                    SheetPage {
                        when (page) {
                            PeoplePage.Search -> RoomSearchScreen(room, client, { eventId ->
                                onDismiss()
                                onJump(eventId)
                            }, pop)
                            PeoplePage.Media -> RoomMediaScreen(room, client, pop)
                            is PeoplePage.Pinned -> PinnedMessagesScreen(room, client, page.canPin, pop)
                            is PeoplePage.Widgets -> RoomWidgetsScreen(room.id, client, page.canManage, pop)
                            PeoplePage.Bridges -> RoomBridgesScreen(room.id, bridges, pop)
                            else -> {}
                        }
                    }
                }
            } else {
            SheetPage {
                SheetBar(
                    tr(if (room.isDirect) "room.info.conversation" else "room.info.title"),
                    trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) },
                )
                FormList(Modifier.weight(1f)) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(top = WZ.Space.space6, start = WZ.Space.space6, end = WZ.Space.space6),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                        ) {
                            AvatarWithBadge(room.displayName, avatarUrl, canEditAvatar, saving, pickAvatar)
                            if (room.isDirect && canEditAvatar && hasCustomAvatar) {
                                BarTextButton(tr("room.settings.general.resetAvatar"), { confirmResetAvatar = true }, enabled = !saving)
                            }
                            Text(
                                name.ifEmpty { room.displayName },
                                style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold),
                                color = theme.textPrimary,
                                textAlign = TextAlign.Center,
                            )
                            alias?.let { Text(it, style = wizardFont(WZ.FontSize.md), color = theme.textMuted) }
                        }
                    }

                    if (canEditName || canEditTopic) {
                        item {
                            GroupedSection(header = tr("settings.about.title")) {
                                if (canEditName) {
                                    LabeledFormField(tr("common.name")) { FormField(name, { name = it }, tr("common.name"), horizontalPadding = 0.dp, verticalPadding = WZ.Space.space1) }
                                }
                                if (canEditName && canEditTopic) RowDivider()
                                if (canEditTopic) {
                                    LabeledFormField(tr("room.topic")) {
                                        FormField(topic, { topic = it }, tr("room.topicPlaceholder"), maxLines = 4, horizontalPadding = 0.dp, verticalPadding = WZ.Space.space1)
                                    }
                                }
                            }
                        }
                        if (hasChanges) {
                            item {
                                PrimaryButton(
                                    tr("common.save"),
                                    ::save,
                                    Modifier.padding(horizontal = WZ.Space.space6),
                                    enabled = !saving,
                                )
                            }
                        }
                    } else if (topic.isNotEmpty()) {
                        item {
                            GroupedSection(header = tr("room.topic")) {
                                Text(
                                    topic,
                                    Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space5),
                                    style = wizardFont(WZ.FontSize.lg),
                                    color = theme.textPrimary,
                                )
                            }
                        }
                    }

                    item {
                        GroupedSection {
                            GroupedRow(
                                tr("room.settings.general.e2ee"),
                                Modifier.alpha(if (encrypted || canEnableEncryption) 1f else WZ.Opacity.disabled),
                                subtitle = tr(if (encrypted) "room.settings.general.encryptionEnabledNote" else "room.settings.general.encryptionNote"),
                            ) {
                                WizardSwitch(encrypted, { if (it && canEnableEncryption && !saving) confirmEncryption = true })
                            }
                        }
                    }

                    item {
                        GroupedSection {
                            NavRow(tr("common.members"), "users", { push(PeoplePage.Members(room.id)) }, value = "$memberCount")
                            RowDivider()
                            NavRow(tr("search.title"), "magnifying-glass", { push(PeoplePage.Search) })
                            RowDivider()
                            NavRow(tr("timeline.mediaLinksAndDocs"), "images", { push(PeoplePage.Media) })
                            RowDivider()
                            NavRow(tr("room.header.pinnedMessages"), "push-pin", { push(PeoplePage.Pinned(canPin)) }, value = "$pinnedCount")
                            RowDivider()
                            ActionRow(tr("room.header.jumpToDate"), "clock-counter-clockwise", { showJumpToDate = true })
                            if (!room.isDirect) {
                                RowDivider()
                                NavRow(tr("room.settings.permissions.title"), "shield-check", { push(PeoplePage.Roles(room.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.emojis.title"), "smiley", { push(PeoplePage.Packs(room.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.sounds.title"), "vinyl-record", { push(PeoplePage.SoundPacks(room.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.widgets.title"), "puzzle-piece", { push(PeoplePage.Widgets(canManageWidgets)) })
                                if (bridges.isNotEmpty()) {
                                    RowDivider()
                                    NavRow(tr("room.settings.bridges.title"), "plugs-connected", { push(PeoplePage.Bridges) }, value = "${bridges.size}")
                                }
                            }
                            if (canInvite) {
                                RowDivider()
                                ActionRow(tr("room.members.invite"), "user-plus", { showInvite = true })
                            }
                            RowDivider()
                            CopyRow(tr("room.info.copyLink"), "link-simple", "https://matrix.to/#/${alias ?: room.id}")
                            RowDivider()
                            ToggleRow(tr("room.favourite"), isFavourite, { value ->
                                isFavourite = value
                                scope.launch { runCatching { client.setFavourite(room.id, value) } }
                            }, icon = "star")
                        }
                    }

                    item {
                        GroupedSection {
                            ActionRow(
                                tr(if (room.isDirect) "room.info.leaveConversation" else "room.leaveRoom"),
                                "sign-out",
                                { confirmLeave = true },
                                theme.danger,
                            )
                        }
                    }
                    item { ErrorText(error) }
                }
            }

            if (confirmEncryption) {
                val confirm = tr("room.settings.general.encryptionConfirm")
                ConfirmDialog(
                    title = tr("room.settings.general.e2ee"),
                    confirmLabel = tr("common.confirm"),
                    message = if (isPublic) tr("room.settings.general.encryptionPublicRoomWarning") + "\n\n" + confirm else confirm,
                    onConfirm = {
                        scope.launch {
                            saving = true
                            try {
                                client.enableEncryption(room.id)
                                encrypted = true
                            } catch (e: Exception) {
                                error = L10n.format("room.settings.general.encryptionEnableFailed", errorText(e))
                            } finally {
                                saving = false
                            }
                        }
                    },
                    onDismiss = { confirmEncryption = false },
                )
            }
            if (confirmResetAvatar) {
                ConfirmDialog(
                    title = tr("room.dm.resetAvatarConfirm", room.dmUserName ?: room.displayName),
                    confirmLabel = tr("room.settings.general.resetAvatar"),
                    onConfirm = {
                        scope.launch {
                            saving = true
                            try {
                                client.removeRoomAvatar(room.id)
                                hasCustomAvatar = false
                                val partner = room.dmUserId
                                avatarUrl = if (partner != null) session.memberProfile(partner, room.id).avatarUrl ?: room.dmUserAvatar else null
                            } catch (e: Exception) {
                                error = errorText(e)
                            } finally {
                                saving = false
                            }
                        }
                    },
                    onDismiss = { confirmResetAvatar = false },
                )
            }
            if (confirmLeave) {
                ConfirmDialog(
                    title = L10n.format("room.info.leaveConfirm", room.displayName),
                    confirmLabel = tr("common.leave"),
                    onConfirm = {
                        scope.launch {
                            runCatching { client.leave(room.id) }
                            onDismiss()
                        }
                    },
                    onDismiss = { confirmLeave = false },
                )
            }
            if (showJumpToDate) {
        JumpToDateDialog(client, room.id, { showJumpToDate = false }, onJump)
    }
    if (showInvite) {
                UserPickerSheet(UserPickerMode.Invite, { showInvite = false }, room.id, onDone = { reloads++ })
            }
            }
        }
    }
}

@Composable
private fun LabeledFormField(label: String, field: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)) {
        Text(label, style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textMuted)
        field()
    }
}

@Composable
private fun RoomAvatar(name: String, url: String?, canEdit: Boolean, onPick: () -> Unit, cornerRadius: Dp?) {
    if (!canEdit) {
        Avatar(name, url, WZ.SizeAvatar.xl, cornerRadius)
        return
    }
    val label = tr("room.info.changePicture")
    Box(
        Modifier
            .clip(if (cornerRadius == null) CircleShape else RoundedCornerShape(cornerRadius))
            .clickable(onClick = onPick)
            .semantics { contentDescription = label },
    ) {
        Avatar(name, url, WZ.SizeAvatar.xl, cornerRadius)
    }
}

/** A room or space picture with a camera badge when it can be changed */
@Composable
internal fun AvatarWithBadge(
    name: String,
    url: String?,
    canEdit: Boolean,
    saving: Boolean,
    onPick: () -> Unit,
    cornerRadius: Dp? = null,
    badgeSize: Dp = WZ.Space.space9,
    bordered: Boolean = true,
) {
    Box {
        RoomAvatar(name, url, canEdit, onPick, cornerRadius)
        if (canEdit) {
            CameraBadge(
                saving,
                badgeSize,
                Modifier
                    .align(Alignment.BottomEnd)
                    .then(if (bordered) Modifier.border(WZ.BorderWidth.thick, theme.bgSecondary, CircleShape) else Modifier),
            )
        }
    }
}
