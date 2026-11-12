package org.wizardchat.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

/** Room the floating tab bar (and call bar) takes at the bottom */
val LocalBottomBarInset = compositionLocalOf { 0.dp }

/** A screen's title bar: a back button, the title (large on top-level screens) and trailing actions */
@Composable
fun WizardTopBar(
    title: String,
    modifier: Modifier = Modifier,
    large: Boolean = false,
    titleInRow: Boolean = false,
    onBack: (() -> Unit)? = null,
    backLabel: String? = null,
    background: Color = theme.bgPrimary,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Column(modifier.fillMaxWidth().background(background).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                BarButton("caret-left", tr("common.back"), onBack, weight = PhWeight.bold)
            }
            if (large && titleInRow) {
                Text(
                    title,
                    Modifier.weight(1f).padding(horizontal = WZ.Space.space3),
                    style = wizardFont(WZ.FontSize.display, FontWeight.Bold),
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            } else if (!large) {
                Text(
                    title,
                    Modifier.weight(1f).padding(horizontal = WZ.Space.space3),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            } else {
                Box(Modifier.weight(1f))
            }
            Row(verticalAlignment = Alignment.CenterVertically, content = actions)
        }
        if (large && !titleInRow) {
            Text(
                title,
                Modifier.padding(horizontal = WZ.Space.space6).padding(bottom = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.display, FontWeight.Bold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** An icon button for top bars and toolbars */
@Composable
fun BarButton(
    icon: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    weight: PhWeight = PhWeight.regular,
    tint: Color = theme.control,
    size: Dp = WZ.SizeIcon.lg,
    enabled: Boolean = true,
    badge: @Composable (() -> Unit)? = null,
) {
    Box(
        modifier
            .size(WZ.Space.space11)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, weight, size = size, tint = if (enabled) tint else tint.copy(alpha = 0.4f), contentDescription = label)
        if (badge != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(top = WZ.Space.space5, end = WZ.Space.space5)) { badge() }
        }
    }
}

/** A text button for top bars ("Done", "Cancel", "Save") */
@Composable
fun BarTextButton(text: String, onClick: () -> Unit, enabled: Boolean = true, bold: Boolean = false) {
    TextButton(onClick = onClick, enabled = enabled) {
        Text(
            text,
            style = wizardFont(WZ.FontSize.lg, if (bold) FontWeight.SemiBold else FontWeight.Normal),
            color = if (enabled) theme.control else theme.textMuted,
        )
    }
}

/**
 * A sheet's own title bar: leading and trailing items around a centred title (or custom title
 * content). Full-screen pages pass `statusBarPadding`.
 */
@Composable
fun SheetTopBar(
    title: String,
    leading: @Composable RowScope.() -> Unit = {},
    trailing: @Composable RowScope.() -> Unit = {},
    titleContent: (@Composable () -> Unit)? = null,
    statusBarPadding: Boolean = false,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(theme.bgPrimary)
            .then(if (statusBarPadding) Modifier.statusBarsPadding() else Modifier)
            .height(WZ.Space.space11)
            .padding(horizontal = WZ.Space.space3),
    ) {
        // The title stays centred but only gets the room between the buttons, so a long one ellipsizes instead of
        // running under them
        Layout(
            content = {
                Row(verticalAlignment = Alignment.CenterVertically, content = leading)
                Box(contentAlignment = Alignment.Center) {
                    if (titleContent != null) {
                        titleContent()
                    } else {
                        Text(
                            title,
                            style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
            },
            modifier = Modifier.fillMaxSize(),
        ) { measurables, constraints ->
            val loose = constraints.copy(minWidth = 0, minHeight = 0)
            val lead = measurables[0].measure(loose)
            val trail = measurables[2].measure(loose)
            val gap = WZ.Space.space4.roundToPx()
            val side = maxOf(lead.width, trail.width).let { if (it > 0) it + gap else 0 }
            val titlePlaceable = measurables[1].measure(loose.copy(maxWidth = (constraints.maxWidth - side * 2).coerceAtLeast(0)))
            val height = constraints.maxHeight
            layout(constraints.maxWidth, height) {
                lead.place(0, (height - lead.height) / 2)
                trail.place(constraints.maxWidth - trail.width, (height - trail.height) / 2)
                titlePlaceable.place((constraints.maxWidth - titlePlaceable.width) / 2, (height - titlePlaceable.height) / 2)
            }
        }
    }
}

/** A page that slides up over the current screen */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WizardSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = theme.bgPrimary,
        contentColor = theme.textPrimary,
        content = content,
    )
}

/** An item in a menu (long-press menus, "+" menus) */
data class MenuItem(
    val label: String,
    val icon: String? = null,
    val destructive: Boolean = false,
    val divider: Boolean = false,
    val checked: Boolean = false,
    val onClick: () -> Unit,
)

@Composable
fun WizardMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<MenuItem>) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss, containerColor = theme.bgTertiary) {
        items.forEach { item ->
            if (item.divider) HorizontalDivider(color = theme.border)
            val color = if (item.destructive) theme.danger else theme.textPrimary
            DropdownMenuItem(
                text = { Text(item.label, style = wizardFont(WZ.FontSize.lg), color = color) },
                leadingIcon = item.icon?.let { { PhIcon(it, tint = color) } },
                trailingIcon = if (item.checked) ({ PhIcon("check", PhWeight.bold, tint = theme.accent) }) else null,
                onClick = {
                    onDismiss()
                    item.onClick()
                },
            )
        }
    }
}

/** Asks before something destructive */
@Composable
fun ConfirmDialog(
    title: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    message: String? = null,
    destructive: Boolean = true,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = message?.let { { Text(it, style = wizardFont(WZ.FontSize.md), color = theme.textMuted) } },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) {
                Text(confirmLabel, color = if (destructive) theme.danger else theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg))
            }
        },
    )
}

/** Full-size screen container in the app's background colour */
@Composable
fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxSize().background(theme.bgPrimary), verticalArrangement = Arrangement.Top, content = content)
}
