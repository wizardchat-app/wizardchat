package org.wizardchat.android.ui.people

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.CreateRoomOptions
import org.wizardchat.core.Member
import org.wizardchat.core.UserProfile
import org.wizardchat.core.UserResult
import org.wizardchat.tokens.WZ

/** Closes the sheets this one was opened from, e.g. after opening a room from a profile inside room info */
internal val LocalCloseParents = compositionLocalOf<() -> Unit> { {} }

/** A member's power level; members without one are the room's creators */
internal val Member.level: Long get() = powerLevel ?: Long.MAX_VALUE
internal val Member.name: String get() = displayName ?: userId

internal fun errorText(error: Throwable): String = error.message ?: error.toString()

internal val JsonElement.number: Double? get() = (this as? JsonPrimitive)?.takeIf { it !is JsonNull && !it.isString }?.doubleOrNull
internal val JsonElement?.string: String? get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** Opens the photo picker and hands back the picked image's bytes */
@Composable
internal fun rememberImagePicker(onPicked: (Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) onPicked(uri)
    }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

internal suspend fun readBytes(context: android.content.Context, uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
    runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
}

/** A picked picture scaled down to `width` pixels as JPEG, for room and space avatars */
internal suspend fun avatarJpeg(context: android.content.Context, uri: Uri, width: Int = WZ.SizeDialog.md.value.toInt()): ByteArray? =
    withContext(Dispatchers.Default) {
        val data = readBytes(context, uri) ?: return@withContext null
        val image = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return@withContext null
        val height = (width.toFloat() * image.height / maxOf(image.width, 1)).toInt().coerceAtLeast(1)
        val scaled = Bitmap.createScaledBitmap(image, width, height, true)
        ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }

/** The title bar of a full-screen sheet page */
@Composable
internal fun SheetBar(title: String, leading: @Composable RowScope.() -> Unit = {}, trailing: @Composable RowScope.() -> Unit = {}) =
    SheetTopBar(title, leading, trailing, statusBarPadding = true)

/** A grouped page body that scrolls and clears the navigation bar and keyboard */
@Composable
internal fun FormList(modifier: Modifier = Modifier, content: LazyListScope.() -> Unit) {
    LazyColumn(
        modifier.fillMaxWidth().background(theme.groupedBackground).imePadding(),
        contentPadding = PaddingValues(bottom = WZ.Space.space6),
    ) {
        content()
        item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars)) }
    }
}

/** Full-height page inside a sheet */
@Composable
internal fun SheetPage(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(theme.groupedBackground), content = content)
}

/** A button row with an icon inside a grouped section */
@Composable
internal fun ActionRow(
    title: String,
    icon: String?,
    onClick: () -> Unit,
    color: Color = theme.control,
    enabled: Boolean = true,
) {
    GroupedRow(
        title,
        Modifier.alpha(if (enabled) 1f else WZ.Opacity.disabled),
        icon = icon,
        iconTint = color,
        titleColor = color,
        onClick = if (enabled) onClick else null,
    )
}

/** A row that opens a page: icon, title, an optional value and a chevron */
@Composable
internal fun NavRow(title: String, icon: String, onClick: () -> Unit, value: String? = null) {
    GroupedRow(title, icon = icon, iconTint = theme.control, onClick = onClick) {
        if (value != null) Text(value, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
        PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
    }
}

/** A row with a switch */
@Composable
internal fun ToggleRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, icon: String? = null, subtitle: String? = null) {
    GroupedRow(title, icon = icon, iconTint = theme.control, subtitle = subtitle, onClick = { onChange(!checked) }) {
        WizardSwitch(checked, onChange)
    }
}

@Composable
internal fun WizardSwitch(checked: Boolean, onChange: (Boolean) -> Unit) {
    Switch(
        checked,
        onChange,
        colors = SwitchDefaults.colors(
            checkedTrackColor = theme.accent,
            checkedThumbColor = theme.textOnAccent,
            uncheckedTrackColor = theme.fill,
            uncheckedBorderColor = theme.border,
            uncheckedThumbColor = theme.textMuted,
        ),
    )
}

/** Copies `value` and briefly shows "Copied" */
@Composable
internal fun CopyRow(title: String, icon: String, value: String) {
    var copied by remember { mutableStateOf(false) }
    val copiedText = tr("common.copied")
    LaunchedEffect(copied) {
        if (copied) {
            delay(1600)
            copied = false
        }
    }
    if (copied) {
        GroupedRow(copiedText, icon = "check", iconTint = theme.accent, titleColor = theme.accent)
    } else {
        ActionRow(title, icon, {
            copyToClipboard(value, copiedText)
            copied = true
        })
    }
}

/** A plain text field row inside a grouped section */
@Composable
internal fun FormField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    maxLines: Int = 1,
    plain: Boolean = false,
    horizontalPadding: Dp = WZ.Space.space5,
    verticalPadding: Dp = WZ.Space.space5,
    onSubmit: (() -> Unit)? = null,
) {
    BasicTextField(
        value,
        onValueChange,
        modifier
            .fillMaxWidth()
            .heightIn(min = if (verticalPadding == WZ.Space.space5) WZ.Space.space11 else 0.dp)
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
        singleLine = maxLines == 1,
        maxLines = maxLines,
        cursorBrush = SolidColor(theme.accent),
        keyboardOptions = KeyboardOptions(
            capitalization = if (plain) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
            autoCorrectEnabled = !plain,
            imeAction = if (maxLines == 1) ImeAction.Done else ImeAction.Default,
        ),
        keyboardActions = KeyboardActions(onDone = { onSubmit?.invoke() }),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(placeholder, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
                inner()
            }
        },
    )
}

@Composable
internal fun ErrorText(error: String?) {
    if (error == null) return
    Text(
        error,
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space8, vertical = WZ.Space.space4),
        style = wizardFont(WZ.FontSize.sm),
        color = theme.error,
    )
}

/** An icon and a title in the middle of an empty page */
@Composable
internal fun EmptyState(title: String, icon: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(WZ.Space.space9),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        PhIcon(icon, size = WZ.SizeIcon.xxl, tint = theme.textMuted)
        Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
    }
}

/** The small role capsule next to admins, moderators and creators */
@Composable
internal fun RoleBadge(level: Long) {
    val (key, color) = when {
        level == Long.MAX_VALUE -> "room.members.founder" to theme.roleFounder
        level >= 100 -> "room.members.admin" to theme.roleAdmin
        level >= 50 -> "room.members.moderator" to theme.roleModerator
        else -> "room.members.member" to theme.roleMember
    }
    Text(
        tr(key),
        Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
        style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
        color = color,
    )
}

/** A circle badge in an avatar's corner showing it can be changed */
@Composable
internal fun CameraBadge(saving: Boolean, size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).clip(CircleShape).background(theme.bgTertiary),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(if (saving) "hourglass" else "camera", size = WZ.SizeIcon.xs, tint = theme.accent)
    }
}

/** A menu item that can be disabled or show a check */
internal data class PickItem(val label: String, val checked: Boolean = false, val enabled: Boolean = true, val onClick: () -> Unit)

@Composable
internal fun PickMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<PickItem>) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss, containerColor = theme.bgTertiary) {
        items.forEach { item ->
            DropdownMenuItem(
                text = {
                    Text(
                        item.label,
                        style = wizardFont(WZ.FontSize.lg),
                        color = if (item.enabled) theme.textPrimary else theme.textMuted,
                    )
                },
                leadingIcon = {
                    if (item.checked) PhIcon("check", PhWeight.bold, tint = theme.textPrimary) else Spacer(Modifier.size(WZ.SizeIcon.md))
                },
                enabled = item.enabled,
                onClick = {
                    onDismiss()
                    item.onClick()
                },
            )
        }
    }
}

/** An alert with a text field */
@Composable
internal fun TextFieldDialog(
    title: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
    showField: Boolean = true,
    plain: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = if (showField) {
            {
                Box(Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(WZ.Radius.md)).background(theme.fill)) {
                    FormField(value, onValueChange, placeholder, plain = plain)
                }
            }
        } else {
            null
        },
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

/** A person: avatar, name and Matrix ID (member lists and the user picker) */
@Composable
internal fun PersonRow(
    name: String?,
    userId: String,
    avatarUrl: String?,
    onClick: (() -> Unit)?,
    enabled: Boolean = true,
    trailing: @Composable () -> Unit = {},
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(enabled = enabled, onClick = onClick) else Modifier)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        org.wizardchat.android.ui.Avatar(name ?: userId, avatarUrl, WZ.SizeAvatar.md)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space0)) {
            Text(
                name ?: userId,
                style = wizardFont(WZ.FontSize.lg, FontWeight.Medium),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (name != null) {
                Text(userId, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing()
    }
}
