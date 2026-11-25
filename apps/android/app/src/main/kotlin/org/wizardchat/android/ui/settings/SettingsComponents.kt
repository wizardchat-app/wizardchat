package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The message of an error */
internal val Throwable.text: String get() = message ?: toString()

/** A settings sub-page: an inline title bar with a back button over a grouped, scrolling form */
@Composable
internal fun SettingsPage(
    title: String,
    onBack: (() -> Unit)?,
    onDone: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(theme.groupedBackground)) {
        if (onDone != null) {
            // In a sheet: no status bar to pad, Done at the end
            SheetTopBar(title, trailing = { BarTextButton(tr("common.done"), onDone, bold = true) })
        } else {
            WizardTopBar(title, onBack = onBack, background = theme.groupedBackground)
        }
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState()),
        ) {
            content()
            Spacer(Modifier.height(LocalBottomBarInset.current + WZ.Space.space8))
        }
    }
}

/** A titled group of rows, separated with SettingsDivider */
@Composable
internal fun SettingsSection(
    title: String? = null,
    note: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    GroupedSection(header = title, footer = note) {
        Column(Modifier.fillMaxWidth(), content = content)
    }
}

/** A free-form row inside a section, padded like a list row */
@Composable
internal fun SettingsItem(
    modifier: Modifier = Modifier,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(WZ.Space.space4),
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalArrangement = verticalArrangement,
        horizontalAlignment = horizontalAlignment,
        content = content,
    )
}

/** Loose content in a form, in a card of its own */
@Composable
internal fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    SettingsSection { SettingsItem(content = content) }
}

@Composable
internal fun SettingsDivider() = RowDivider()

@Composable
private fun RowLabel(label: String, note: String?, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
        Text(label, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
        if (note != null) Text(note, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
    }
}

@Composable
private fun RowFrame(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .then(if (onClick != null) Modifier.clickable(enabled = enabled, onClick = onClick) else Modifier)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)
            .alpha(if (enabled) 1f else 0.5f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        content = content,
    )
}

@Composable
internal fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    note: String? = null,
    disabled: Boolean = false,
) {
    RowFrame(onClick = { onCheckedChange(!checked) }, enabled = !disabled) {
        RowLabel(label, note, Modifier.weight(1f))
        WizardSwitch(checked, onCheckedChange, enabled = !disabled)
    }
}

@Composable
internal fun WizardSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, enabled: Boolean = true, color: Color = theme.accent) {
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedTrackColor = color,
            checkedThumbColor = Color.White,
            checkedBorderColor = color,
            uncheckedTrackColor = theme.fill,
            uncheckedThumbColor = Color.White,
            uncheckedBorderColor = theme.fill,
            disabledCheckedTrackColor = color.copy(alpha = 0.4f),
            disabledUncheckedTrackColor = theme.fill,
        ),
    )
}

@Composable
internal fun CheckRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    RowFrame(
        Modifier.semantics { selected = checked; role = Role.Checkbox },
        onClick = { onCheckedChange(!checked) },
    ) {
        RowLabel(label, null, Modifier.weight(1f))
        PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.sm, tint = if (checked) theme.accent else Color.Transparent)
    }
}

/** A menu picker with its current choice at the end */
@Composable
internal fun <T> PickerRow(
    label: String,
    selection: T,
    options: List<Pair<T, String>>,
    onSelect: (T) -> Unit,
    note: String? = null,
    enabled: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    RowFrame(onClick = { open = true }, enabled = enabled) {
        RowLabel(label, note, Modifier.weight(1f))
        Box {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                Text(
                    options.firstOrNull { it.first == selection }?.second ?: "",
                    style = wizardFont(WZ.FontSize.lg),
                    color = theme.textMuted,
                    maxLines = 1,
                )
                PhIcon("caret-up-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
            }
            WizardMenu(
                open,
                { open = false },
                options.map { (value, title) ->
                    MenuItem(title, icon = if (value == selection) "check" else null) { onSelect(value) }
                },
            )
        }
    }
}

/** A value with copy (and reveal, for secrets) buttons */
@Composable
internal fun CopyRow(label: String, value: String, secret: Boolean = false) {
    var revealed by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
    ) {
        Text(label, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
            Text(
                if (secret && !revealed) "•".repeat(24) else value,
                Modifier.weight(1f),
                style = TextStyle(fontSize = WZ.FontSize.md, fontFamily = FontFamily.Monospace),
                color = theme.textPrimary,
                maxLines = if (secret && revealed) Int.MAX_VALUE else 1,
                overflow = if (secret && revealed) TextOverflow.Clip else TextOverflow.MiddleEllipsis,
            )
            if (secret) {
                IconAction(
                    if (revealed) "eye-slash" else "eye",
                    if (revealed) tr("common.hide") else tr("common.show"),
                ) { revealed = !revealed }
            }
            IconAction(
                if (copied) "check" else "copy",
                tr("common.copy"),
                weight = if (copied) PhWeight.bold else PhWeight.regular,
            ) {
                copyToClipboard(value)
                copied = true
            }
        }
    }
}

@Composable
internal fun IconAction(
    icon: String,
    label: String,
    weight: PhWeight = PhWeight.regular,
    tint: Color = theme.accent,
    onClick: () -> Unit,
) {
    Box(
        Modifier.size(WZ.Space.space9).clip(CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, weight, size = WZ.SizeIcon.sm, tint = tint, contentDescription = label)
    }
}

/** An error (or success) line under a section */
@Composable
internal fun StatusText(text: String, isError: Boolean = true) {
    Text(
        text,
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6 + WZ.Space.space5, vertical = WZ.Space.space3),
        style = wizardFont(WZ.FontSize.sm),
        color = if (isError) theme.error else theme.success,
    )
}

/** A primary or secondary capsule button with an icon */
@Composable
internal fun LabelButton(
    text: String,
    icon: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    enabled: Boolean = true,
    color: Color? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val background = if (primary) {
        if (pressed && color == null) theme.accentHover else color ?: theme.accent
    } else {
        if (pressed) theme.bgActive else theme.fill
    }
    val content = if (primary) theme.textOnAccent else color ?: theme.control
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .background(background)
            .clickable(interaction, null, enabled = enabled, onClick = onClick)
            .padding(horizontal = WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            PhIcon(icon, size = WZ.SizeIcon.md, tint = content)
            Spacer(Modifier.width(WZ.Space.space4))
        }
        Text(text, style = wizardFont(WZ.FontSize.lg, if (primary) FontWeight.SemiBold else FontWeight.Medium), color = content, maxLines = 1)
    }
}

/** A filled red button for destructive confirmations (deactivate, remove session) */
@Composable
internal fun DangerButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space10)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(RoundedCornerShape(WZ.Radius.md))
            .background(theme.danger)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
    }
}

