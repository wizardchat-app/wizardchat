package org.wizardchat.android.ui.room

import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import java.time.Instant
import org.wizardchat.core.MessageVersion
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToastView
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** The room's pinned messages, newest first */
@Composable
fun PinnedMessagesScreen(room: RoomSummary, client: WizardClient, canPin: Boolean, onBack: () -> Unit) {
    val timeline = remember(room.id) { TimelineModel(client, room.id, pinnedOnly = true) }
    DisposableEffect(timeline) { onDispose { timeline.close() } }
    LaunchedEffect(timeline) { timeline.start() }
    val scope = rememberCoroutineScope()
    val messages = timeline.entries
        .filter { it.kind !is ChatEntry.Kind.DateDivider && it.kind !is ChatEntry.Kind.System && it.kind !is ChatEntry.Kind.Call }
        .map { it.copy(isGrouped = false) }
        .asReversed()

    Column(Modifier.fillMaxSize().background(theme.bgSecondary)) {
        WizardTopBar(tr("room.header.pinnedMessages"), onBack = onBack)
        Box(Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = LocalBottomBarInset.current)) {
                items(messages, key = { it.id }) { entry ->
                    if (canPin) {
                        val state = rememberSwipeToDismissBoxState(
                            confirmValueChange = { value ->
                                if (value == SwipeToDismissBoxValue.EndToStart) scope.launch { timeline.togglePin(entry) }
                                false
                            },
                        )
                        SwipeToDismissBox(
                            state,
                            enableDismissFromStartToEnd = false,
                            backgroundContent = {
                                Row(
                                    Modifier.fillMaxSize().background(theme.accent).padding(horizontal = WZ.Space.space8),
                                    horizontalArrangement = Arrangement.End,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(tr("timeline.unpin"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
                                }
                            },
                        ) {
                            Box(Modifier.background(theme.bgSecondary).padding(vertical = WZ.Space.space2)) {
                                MessageRow(entry, isPrivateRoom = room.isDirect)
                            }
                        }
                    } else {
                        Box(Modifier.padding(vertical = WZ.Space.space2)) { MessageRow(entry, isPrivateRoom = room.isDirect) }
                    }
                }
            }
            if (messages.isEmpty()) {
                EmptyState(
                    tr("timeline.pinnedEmpty"),
                    "push-pin",
                    Modifier.align(Alignment.Center),
                    description = tr("timeline.pinImportantMessagesFrom"),
                )
            }
        }
    }
}

/** An event's JSON */
@Composable
fun SourceSheet(json: String, onDismiss: () -> Unit) {
    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).background(theme.bgSecondary)) {
            Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
                Box(Modifier.align(Alignment.CenterStart)) { BarButton("copy", tr("common.copy"), { copyToClipboard(json) }) }
                Text(
                    tr("timeline.viewSource"),
                    Modifier.align(Alignment.Center),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    textAlign = TextAlign.Center,
                )
                Box(Modifier.align(Alignment.CenterEnd)) { BarTextButton(tr("common.done"), onDismiss, bold = true) }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                SelectionContainer {
                    Text(
                        json,
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .horizontalScroll(rememberScrollState())
                            .padding(WZ.Space.space6)
                            .navigationBarsPadding(),
                        style = wizardFont(WZ.SizeIcon.xs.value.sp).copy(fontFamily = FontFamily.Monospace),
                        color = theme.textPrimary,
                        softWrap = false,
                    )
                }
                CopyToastView(Modifier.align(Alignment.TopCenter).padding(top = WZ.Space.space2))
            }
        }
    }
}

@Composable
fun EditHistorySheet(versions: List<MessageVersion>, onDismiss: () -> Unit) {
    val newestFirst = versions.reversed()
    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).background(theme.bgSecondary)) {
            Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
                Text(
                    tr("timeline.editHistory"),
                    Modifier.align(Alignment.Center),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    textAlign = TextAlign.Center,
                )
                Box(Modifier.align(Alignment.CenterEnd)) { BarTextButton(tr("common.done"), onDismiss, bold = true) }
            }
            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(WZ.Space.space6),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                items(newestFirst.size) { index ->
                    val version = newestFirst[index]
                    val label = when (index) {
                        0 -> tr("timeline.editHistoryCurrent")
                        newestFirst.lastIndex -> tr("timeline.editHistoryOriginal")
                        else -> null
                    }
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(WZ.Radius.md))
                            .background(theme.bgTertiary)
                            .padding(WZ.Space.space5),
                        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                    ) {
                        Text(
                            listOfNotNull(label, Formats.abbreviatedDateTime(Instant.ofEpochMilli(version.timestamp))).joinToString(" · "),
                            style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
                            color = theme.textMuted,
                        )
                        SelectionContainer {
                            Text(version.body, style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                        }
                    }
                }
            }
        }
    }
}
