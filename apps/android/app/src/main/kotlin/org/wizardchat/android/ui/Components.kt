package org.wizardchat.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.ui.theme.WizardTheme
import org.wizardchat.android.ui.theme.hueColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

@Composable
fun Avatar(
    name: String,
    url: String?,
    size: Dp = WZ.SizeAvatar.md,
    cornerRadius: Dp? = null,
    modifier: Modifier = Modifier,
    fallback: Bitmap? = null,
) {
    val media = LocalMedia.current
    var image by remember(url, fallback) { mutableStateOf(url?.let { media?.cachedThumbnail(it) } ?: fallback) }
    LaunchedEffect(url, media) {
        if (url == null || media == null) {
            image = fallback
            return@LaunchedEffect
        }
        media.thumbnail(url, (size.value * 3).toInt())?.let { image = it }
    }
    val shape: Shape = if (cornerRadius == null) CircleShape else RoundedCornerShape(cornerRadius)
    Box(
        modifier
            .size(size)
            .clip(shape)
            // The colour is only for the placeholder; transparent pictures show what's behind them
            .background(if (image == null) hueColor(name) else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = image
        if (bitmap != null) {
            Image(bitmap.asImageBitmap(), null, Modifier.size(size), contentScale = ContentScale.Crop)
        } else {
            WizardMark(theme.textOnAccent, Modifier.size(size * 0.58f))
        }
    }
}

@Composable
fun WizardMark(color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val scale = minOf(this.size.width, this.size.height) / 400f
        val path = Path().apply {
            moveTo(logoOutline[0].x * scale, logoOutline[0].y * scale)
            logoOutline.drop(1).forEach { lineTo(it.x * scale, it.y * scale) }
            close()
        }
        drawPath(path, color)
    }
}

// The polygons' outline as one path, so a single-colour mark has no seams between them
private val logoOutline = listOf(
    0 to 280, 100 to 230, 200 to 70, 300 to 0, 260 to 75, 300 to 230, 400 to 280, 300 to 320, 100 to 320,
).map { (x, y) -> Offset(x.toFloat(), y + 40f) }

private val logoPolygons = listOf(
    listOf(0 to 280, 100 to 320, 200 to 270, 100 to 230),
    listOf(100 to 320, 300 to 320, 200 to 270),
    listOf(400 to 280, 300 to 320, 200 to 270, 300 to 230),
    listOf(100 to 230, 200 to 270, 230 to 80, 200 to 70),
    listOf(200 to 270, 300 to 230, 260 to 75, 230 to 80),
    listOf(200 to 70, 230 to 80, 260 to 75, 300 to 0),
).map { points -> points.map { (x, y) -> Offset(x.toFloat(), y + 40f) } }

@Composable
fun WizardLogo(size: Dp = WZ.SizeAvatar.xl, modifier: Modifier = Modifier) {
    val prefs = LocalPrefs.current
    // Theme colours only when the themed app icon is on, so it matches the launcher icon
    val colors = if (prefs.themedAppIcon) theme.logo else WizardTheme.baseLogo
    val label = tr("app.name")
    Canvas(modifier.size(size).semantics { contentDescription = label }) {
        val scale = this.size.width / 400f
        logoPolygons.forEachIndexed { index, points ->
            val path = Path().apply {
                moveTo(points[0].x * scale, points[0].y * scale)
                points.drop(1).forEach { lineTo(it.x * scale, it.y * scale) }
                close()
            }
            drawPath(path, colors[index])
        }
    }
}

/** A filled capsule button */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = theme.accent,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .scale(if (pressed) 0.98f else 1f)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .background(if (pressed) theme.accentHover else color)
            .clickable(interaction, null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textOnAccent)
    }
}

/** A tinted capsule button */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = theme.accent,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .background(color.copy(alpha = if (pressed) 0.24f else 0.14f))
            .clickable(interaction, null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = color)
    }
}

/** A rounded filled text field */
@Composable
fun WizardTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    onSubmit: (() -> Unit)? = null,
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().heightIn(min = WZ.Space.space11),
        placeholder = { Text(placeholder, color = theme.textMuted, style = wizardFont(WZ.FontSize.lg)) },
        textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
        singleLine = singleLine,
        enabled = enabled,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (password) KeyboardType.Password else keyboardType,
            autoCorrectEnabled = !password && keyboardType == KeyboardType.Text,
            imeAction = if (onSubmit != null) ImeAction.Done else if (singleLine) ImeAction.Next else ImeAction.Default,
        ),
        keyboardActions = KeyboardActions(onDone = { onSubmit?.invoke() }, onGo = { onSubmit?.invoke() }),
        shape = RoundedCornerShape(WZ.Radius.lg),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = theme.fill,
            unfocusedContainerColor = theme.fill,
            disabledContainerColor = theme.fill,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            cursorColor = theme.accent,
        ),
    )
}

@Composable
fun LineDivider(text: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
        HorizontalDivider(Modifier.weight(1f), color = theme.border)
        Text(text, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        HorizontalDivider(Modifier.weight(1f), color = theme.border)
    }
}

@Composable
fun UnreadBadge(count: Int, isMention: Boolean) {
    Box(
        Modifier
            .widthIn(min = WZ.Space.space6)
            .clip(CircleShape)
            .background(if (isMention) theme.mention else theme.accent)
            .padding(horizontal = WZ.Space.space3, vertical = 1.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else "$count", style = wizardFont(WZ.FontSize.xs, FontWeight.Bold), color = theme.textOnAccent)
    }
}

/** A small round dot for unread state (tab bar, inbox button) */
@Composable
fun UnreadDot(mention: Boolean, modifier: Modifier = Modifier) {
    Box(modifier.size(WZ.Space.space4).clip(CircleShape).background(if (mention) theme.mention else theme.accent))
}

@Composable
fun SkeletonRow() {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(0.5f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "pulse")
    Row(
        Modifier.padding(vertical = WZ.Space.space3).alpha(alpha),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Box(Modifier.size(WZ.Space.space10).clip(CircleShape).background(theme.fill))
        Box(Modifier.size(WZ.SizeAvatar.xxl, WZ.Space.space5).clip(CircleShape).background(theme.fill))
    }
}

@Composable
fun Spinner(modifier: Modifier = Modifier, size: Dp = WZ.SizeIcon.lg, color: Color = theme.accent) {
    CircularProgressIndicator(modifier.size(size), color = color, strokeWidth = 2.dp)
}

/** Muted centred text for empty states and notes */
@Composable
fun Note(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier.fillMaxWidth(),
        style = wizardFont(WZ.FontSize.sm),
        color = theme.textMuted,
        textAlign = TextAlign.Center,
    )
}

object CopyToast {
    var message by mutableStateOf<String?>(null)
        private set
    private var shownAt = 0L

    fun show(text: String) {
        message = text
        shownAt = System.currentTimeMillis()
    }

    internal fun hideIfStale(at: Long) {
        if (shownAt == at) message = null
    }

    internal val stamp get() = shownAt
}

fun copyToClipboard(text: String, message: String = L10n.format("common.copied")) {
    val clipboard = WizardApplication.instance.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(null, text))
    CopyToast.show(message)
}

@Composable
fun CopyToastView(modifier: Modifier = Modifier) {
    val message = CopyToast.message
    LaunchedEffect(message) {
        if (message != null) {
            val stamp = CopyToast.stamp
            delay(1600)
            CopyToast.hideIfStale(stamp)
        }
    }
    AnimatedVisibility(message != null, modifier, enter = slideInVertically() + fadeIn(), exit = slideOutVertically() + fadeOut()) {
        Surface(shape = CircleShape, color = theme.bgTertiary, shadowElevation = 6.dp) {
            Row(
                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                PhIcon("check-circle", PhWeight.fill, tint = theme.success)
                Text(message ?: "", style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
            }
        }
    }
}

@Composable
fun ConnectionBanner(modifier: Modifier = Modifier) {
    val session = LocalSession.current
    AnimatedVisibility(session.connectionLost, modifier, enter = slideInVertically() + fadeIn(), exit = slideOutVertically() + fadeOut()) {
        Row(
            Modifier
                .clip(CircleShape)
                .background(theme.warningColor)
                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            Spinner(size = 14.dp, color = theme.textOnAccent)
            Text(tr("common.offlineReconnecting"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
        }
    }
}

/** A row in grouped settings-style lists */
@Composable
fun GroupedSection(
    header: String? = null,
    footer: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6)) {
        if (header != null) {
            Text(
                header,
                Modifier.padding(start = WZ.Space.space5, bottom = WZ.Space.space3, top = WZ.Space.space6),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
        } else {
            Spacer(Modifier.height(WZ.Space.space6))
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.groupedRow)) {
            content()
        }
        if (footer != null) {
            Text(
                footer,
                Modifier.padding(start = WZ.Space.space5, end = WZ.Space.space5, top = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
        }
    }
}

/** A tappable row inside a GroupedSection: optional icon, title, trailing content */
@Composable
fun GroupedRow(
    title: String,
    modifier: Modifier = Modifier,
    icon: String? = null,
    iconTint: Color? = null,
    subtitle: String? = null,
    titleColor: Color? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        if (icon != null) PhIcon(icon, tint = iconTint ?: theme.textMuted, size = WZ.SizeIcon.lg)
        Column(Modifier.weight(1f)) {
            Text(title, style = wizardFont(WZ.FontSize.lg), color = titleColor ?: theme.textPrimary)
            if (subtitle != null) Text(subtitle, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
        trailing()
    }
}

@Composable
fun RowDivider() {
    HorizontalDivider(Modifier.padding(start = WZ.Space.space5), color = theme.border.copy(alpha = 0.5f))
}

/** The verification nudge at the top of the room list */
@Composable
fun VerificationBanner(onVerify: () -> Unit) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    if (session.encryption?.deviceVerified != false || prefs.verificationBannerDismissed) return
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .background(theme.fill)
            .clickable(onClick = onVerify)
            .padding(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        PhIcon("shield-warning", size = WZ.SizeIcon.lg, tint = theme.danger)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(tr("verification.session.title"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
            Text(tr("common.useAnotherDeviceOr"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
        Box(
            Modifier.size(WZ.Space.space9).clip(CircleShape).clickable { prefs.verificationBannerDismissed = true },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("x", size = WZ.SizeIcon.xs, tint = theme.textMuted, contentDescription = tr("common.dismiss"))
        }
    }
}

/** Plain bordered chip, e.g. filters and tags */
@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(CircleShape)
            .background(if (selected) theme.accent.copy(alpha = 0.14f) else Color.Transparent)
            .border(1.dp, if (selected) theme.accent else theme.border, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
    ) {
        Text(text, style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = if (selected) theme.accent else theme.textPrimary)
    }
}
