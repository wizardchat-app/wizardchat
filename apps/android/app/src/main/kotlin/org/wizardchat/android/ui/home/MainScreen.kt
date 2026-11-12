package org.wizardchat.android.ui.home

import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.wizardchat.android.matrix.SessionStore
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.RecentEmoji
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.UnreadState
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.ConnectionBanner
import org.wizardchat.android.ui.CopyToastView
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.UnreadDot
import org.wizardchat.android.ui.room.RoomScreen
import org.wizardchat.android.ui.settings.SettingsScreen
import org.wizardchat.android.ui.settings.VerificationRequests
import org.wizardchat.android.ui.settings.VerificationSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.voice.CallBar
import org.wizardchat.android.ui.voice.CallErrorBanner
import org.wizardchat.android.ui.voice.DMCallScreen
import org.wizardchat.android.ui.voice.IncomingCallBanner
import org.wizardchat.android.ui.voice.VoiceRoomScreen
import org.wizardchat.tokens.WZ

enum class Tab { home, dms, spaces, me }

sealed interface Route {
    /** A room: its voice view for voice rooms, otherwise the chat */
    data class Room(val id: String) : Route
    data class Space(val id: String) : Route
    /** A voice room's text chat */
    data class Chat(val id: String) : Route
    data class Thread(val roomId: String, val rootEventId: String) : Route
}

/** Opens rooms and spaces from anywhere in the main screen (inbox, search, links, notifications) */
class Navigator(
    val openRoom: (String) -> Unit,
    val openSpace: (String) -> Unit,
    val push: (Route) -> Unit,
    val pop: () -> Unit,
)

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("no navigator") }
val LocalCalls = staticCompositionLocalOf<CallManager> { error("no call manager") }
val LocalNotifier = staticCompositionLocalOf<MessageNotifier> { error("no notifier") }

private val islandHeight = WZ.Size.tabBar + WZ.Space.space5 + WZ.Space.space1
private val callBarHeight = WZ.Size.callControl + WZ.Space.space5

@Composable
fun MainScreen(roomList: RoomListModel) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val calls = remember { CallManager.shared }
    val notifier = remember { MessageNotifier.shared }

    var tab by remember { mutableStateOf(Tab.home) }
    val paths = remember { mutableStateMapOf<Tab, List<Route>>() }
    var showInbox by remember { mutableStateOf(false) }
    var showCreateSpace by remember { mutableStateOf(false) }
    var showExplore by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current
    var whatsNew by remember { mutableStateOf<org.wizardchat.android.ui.settings.WhatsNew.Entry?>(null) }
    LaunchedEffect(roomList.isLoaded) {
        if (roomList.isLoaded && whatsNew == null) whatsNew = org.wizardchat.android.ui.settings.WhatsNew.unseen(context)
    }
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0

    fun show(roomId: String) {
        val room = roomList.room(roomId)
        val space = roomList.spaceContaining(roomId)
        when {
            room?.isDirect == true -> {
                tab = Tab.dms
                paths[Tab.dms] = listOf(Route.Room(roomId))
            }
            space != null -> {
                tab = Tab.spaces
                paths[Tab.spaces] = listOf(Route.Space(space.id), Route.Room(roomId))
            }
            else -> {
                tab = Tab.home
                paths[Tab.home] = listOf(Route.Room(roomId))
            }
        }
    }

    fun showThread(roomId: String, rootEventId: String) {
        show(roomId)
        paths[tab] = paths[tab].orEmpty() + Route.Thread(roomId, rootEventId)
    }

    fun showSpace(spaceId: String) {
        tab = Tab.spaces
        paths[Tab.spaces] = listOf(Route.Space(spaceId))
    }

    fun select(item: Tab) {
        if (item == tab) paths[item] = emptyList() else tab = item
    }

    fun showsIsland(item: Tab) = !keyboardVisible && paths[item].orEmpty().none { it is Route.Room || it is Route.Chat || it is Route.Thread }

    fun showsCallBar(item: Tab): Boolean {
        val callRoom = calls.room ?: return false
        return calls.isInCall && !keyboardVisible && paths[item]?.lastOrNull() != Route.Room(callRoom.id)
    }

    val navigator = remember(tab) {
        Navigator(
            openRoom = ::show,
            openSpace = ::showSpace,
            push = { route -> paths[tab] = paths[tab].orEmpty() + route },
            pop = { paths[tab] = paths[tab].orEmpty().dropLast(1) },
        )
    }

    LaunchedEffect(session.userId, session.avatarUrl, session.media) {
        val userId = session.userId ?: return@LaunchedEffect
        val url = session.avatarUrl
        if (url == null) {
            SessionStore.saveAvatar(null, userId)
        } else {
            session.media?.thumbnail(url)?.let { withContext(Dispatchers.IO) { SessionStore.saveAvatar(it, userId) } }
        }
    }

    LaunchedEffect(session.client) {
        val client = session.client ?: return@LaunchedEffect
        session.loadSyncedSettings()?.let(prefs::applySynced)
        prefs.onSyncedSettingsChange = { settings -> launch { session.saveSyncedSettings(settings) } }
        session.applyPresence(prefs.showPresence)
        notifier.start(roomList, prefs)
        calls.watchIncoming(client)
        RecentEmoji.shared.start(client)
        VerificationRequests.shared.start(client)
    }
    // Also runs when the activity is recreated (rotation), so calls end on sign-out instead (MatrixSession)
    DisposableEffect(Unit) {
        onDispose {
            notifier.stop()
            RecentEmoji.shared.stop()
            VerificationRequests.shared.stop()
            prefs.onSyncedSettingsChange = null
        }
    }
    LaunchedEffect(notifier.roomToOpen, notifier.accountToOpen, roomList.isLoaded) {
        val roomId = notifier.roomToOpen ?: return@LaunchedEffect
        if (!roomList.isLoaded || notifier.accountToOpen != null) return@LaunchedEffect
        notifier.roomToOpen = null
        showInbox = false
        showCreateSpace = false
        showExplore = false
        show(roomId)
    }
    val totalUnread = roomList.joinedRooms.sumOf { it.unreadCount }
    LaunchedEffect(totalUnread) { notifier.updateBadge(totalUnread) }

    BackHandler(enabled = paths[tab].orEmpty().isNotEmpty()) {
        paths[tab] = paths[tab].orEmpty().dropLast(1)
    }
    BackHandler(enabled = paths[tab].orEmpty().isEmpty() && tab != Tab.home) { tab = Tab.home }

    val stateHolder = rememberSaveableStateHolder()
    CompositionLocalProvider(LocalNavigator provides navigator, LocalCalls provides calls, LocalNotifier provides notifier) {
        Box(Modifier.fillMaxSize().background(theme.bgPrimary)) {
            val inset = (if (showsIsland(tab)) islandHeight else 0.dp) + (if (showsCallBar(tab)) callBarHeight else 0.dp)
            CompositionLocalProvider(LocalBottomBarInset provides inset) {
                stateHolder.SaveableStateProvider(tab) {
                    TabContent(
                        tab,
                        paths[tab].orEmpty(),
                        roomList,
                        onOpenInbox = { showInbox = true },
                        onCreateSpace = { showCreateSpace = true },
                        onExplore = { showExplore = true },
                    )
                }
            }

            Column(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = WZ.Space.space1),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                AnimatedVisibility(showsCallBar(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    CallBar(
                        onClick = {
                            val room = calls.room
                            if (room?.isDirect == true) calls.showCallScreen = true else room?.let { show(it.id) }
                        },
                        modifier = Modifier.padding(horizontal = WZ.Space.space6),
                    )
                }
                AnimatedVisibility(showsIsland(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    TabIsland(roomList, tab, ::select, Modifier.padding(horizontal = WZ.Space.space6))
                }
            }

            Column(
                Modifier.align(Alignment.TopCenter).statusBarsPadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                ConnectionBanner(Modifier.padding(top = WZ.Space.space1))
                CopyToastView(Modifier.padding(top = WZ.Space.space2))
                IncomingCallBanner(Modifier.padding(top = WZ.Space.space2))
                CallErrorBanner(Modifier.padding(top = WZ.Space.space2))
            }
        }

        if (calls.showCallScreen) DMCallScreen(onDismiss = { calls.showCallScreen = false })
        whatsNew?.let { entry ->
            org.wizardchat.android.ui.settings.WhatsNewSheet(entry) {
                org.wizardchat.android.ui.settings.WhatsNew.markSeen(context, entry)
                whatsNew = null
            }
        }
        if (showInbox) InboxSheet(roomList, { showInbox = false }, onOpenRoom = ::show, onOpenSpace = ::showSpace, onOpenThread = ::showThread)
        if (showCreateSpace) CreateSpaceSheet({ showCreateSpace = false }, onCreated = ::showSpace)
        if (showExplore) {
            ExploreSheet(roomList, { showExplore = false }) { roomId ->
                if (roomList.room(roomId) != null) show(roomId) else showSpace(roomId)
            }
        }
        VerificationRequests.shared.presented?.let { model ->
            VerificationSheet(model) { VerificationRequests.shared.presented = null }
        }
    }
}

@Composable
private fun TabContent(
    tab: Tab,
    path: List<Route>,
    roomList: RoomListModel,
    onOpenInbox: () -> Unit,
    onCreateSpace: () -> Unit,
    onExplore: () -> Unit,
) {
    if (tab == Tab.me) {
        SettingsScreen(isTab = true)
        return
    }
    val navigator = LocalNavigator.current
    val stateHolder = rememberSaveableStateHolder()
    AnimatedContent(
        targetState = path,
        transitionSpec = {
            if (targetState.size >= initialState.size) {
                slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 3 }
            } else {
                slideInHorizontally { -it / 3 } togetherWith slideOutHorizontally { it }
            }
        },
        contentKey = { it.size to it.lastOrNull() },
        label = "navigation",
    ) { stack ->
        val route = stack.lastOrNull()
        stateHolder.SaveableStateProvider(route?.toString() ?: "root-$tab") {
            when (route) {
                null -> when (tab) {
                    Tab.home -> RoomListScreen(roomList, SidebarSelection.Home, onOpenInbox)
                    Tab.dms -> RoomListScreen(roomList, SidebarSelection.Dms, onOpenInbox)
                    else -> SpacesScreen(roomList, onCreateSpace = onCreateSpace, onExplore = onExplore)
                }
                is Route.Space -> RoomListScreen(roomList, SidebarSelection.Space(route.id), null)
                is Route.Room, is Route.Chat -> {
                    val id = if (route is Route.Room) route.id else (route as Route.Chat).id
                    val room = roomList.room(id)
                    when {
                        room == null -> Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) { Spinner() }
                        room.isVoice && route is Route.Room -> VoiceRoomScreen(room, onBack = navigator.pop, onOpenChat = { navigator.push(Route.Chat(id)) })
                        else -> RoomScreen(room, roomList.client, onBack = navigator.pop)
                    }
                }
                is Route.Thread -> {
                    val room = roomList.room(route.roomId)
                    if (room == null) {
                        Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) { Spinner() }
                    } else {
                        RoomScreen(room, roomList.client, onBack = navigator.pop, threadRoot = route.rootEventId)
                    }
                }
            }
        }
    }
}

@Composable
private fun TabIsland(roomList: RoomListModel, selected: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    val spacesUnread = roomList.spaces.fold(UnreadState()) { state, space ->
        val unread = roomList.unreadState(SidebarSelection.Space(space.id))
        UnreadState(state.unread || unread.unread, state.mention || unread.mention)
    }
    Surface(modifier.fillMaxWidth(), shape = CircleShape, color = theme.bgTertiary.copy(alpha = 0.96f), shadowElevation = 8.dp) {
        Row(Modifier.padding(WZ.Space.space2)) {
            TabItem(Tab.home, selected, tr("nav.home"), "house", roomList.unreadState(SidebarSelection.Home), onSelect)
            TabItem(Tab.dms, selected, tr("search.switcher.prefixDms"), "chat-circle", roomList.unreadState(SidebarSelection.Dms), onSelect)
            TabItem(Tab.spaces, selected, tr("room.settings.permissions.groups.spaces"), "stack", spacesUnread, onSelect)
            val isSelected = selected == Tab.me
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = WZ.Space.space11)
                    .clip(CircleShape)
                    .background(if (isSelected) theme.accent.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onSelect(Tab.me) }
                    .padding(vertical = WZ.Space.space2),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                Avatar(
                    session.displayName ?: session.userId ?: "",
                    session.avatarUrl,
                    WZ.SizeAvatar.sm,
                    modifier = Modifier.border(WZ.BorderWidth.thick, if (isSelected) theme.accent else androidx.compose.ui.graphics.Color.Transparent, CircleShape),
                )
                Text(tr("nav.you"), style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = if (isSelected) theme.accent else theme.textMuted)
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(
    tab: Tab,
    selected: Tab,
    title: String,
    icon: String,
    unread: UnreadState,
    onSelect: (Tab) -> Unit,
) {
    val isSelected = selected == tab
    val color = if (isSelected) theme.accent else theme.textMuted
    Column(
        Modifier
            .weight(1f)
            .heightIn(min = WZ.Space.space11)
            .clip(CircleShape)
            .background(if (isSelected) theme.accent.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent)
            .clickable { onSelect(tab) }
            .padding(vertical = WZ.Space.space2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        Box {
            PhIcon(icon, if (isSelected) PhWeight.fill else PhWeight.regular, size = WZ.SizeIcon.lg, tint = color)
            if (unread.unread) UnreadDot(unread.mention, Modifier.align(Alignment.TopEnd).offset(x = WZ.Space.space3))
        }
        Text(title, style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = color, maxLines = 1)
    }
}

