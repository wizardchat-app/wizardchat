package org.wizardchat.android.ui.settings

import org.wizardchat.android.matrix.MediaMetadata
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.Pronouns
import org.wizardchat.android.matrix.StatusEmoji
import org.wizardchat.android.matrix.accountManagementUrl
import org.wizardchat.android.matrix.addEmail
import org.wizardchat.android.matrix.canSetPronouns
import org.wizardchat.android.matrix.changePassword
import org.wizardchat.android.matrix.deactivateAccount
import org.wizardchat.android.matrix.emailAddresses
import org.wizardchat.android.matrix.isOAuthAccount
import org.wizardchat.android.matrix.pronouns
import org.wizardchat.android.matrix.removeAvatar
import org.wizardchat.android.matrix.removeEmail
import org.wizardchat.android.matrix.requestEmailToken
import org.wizardchat.android.matrix.setAvatar
import org.wizardchat.android.matrix.setDisplayName
import org.wizardchat.android.matrix.setPronouns
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.Chip
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.composer.EmojiGrid
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.WizardMenu
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.border
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import org.wizardchat.tokens.WZ

/** Reads a picked image as bytes (off the main thread) */
internal suspend fun readBytes(context: Context, uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
    runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
}

/** Re-encodes an image */
internal suspend fun reencode(data: ByteArray, format: Bitmap.CompressFormat, quality: Int): ByteArray? = withContext(Dispatchers.Default) {
    val bitmap = MediaMetadata.decodeImage(data, null) ?: return@withContext null
    ByteArrayOutputStream().use { out ->
        bitmap.compress(format, quality, out)
        out.toByteArray()
    }
}

@Composable
internal fun ProfileSettings(onBack: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var displayName by remember { mutableStateOf(session.displayName ?: "") }
    var savingName by remember { mutableStateOf(false) }
    var canSetPronouns by remember { mutableStateOf(false) }
    var savedPronouns by remember { mutableStateOf("") }
    var pronouns by remember { mutableStateOf("") }
    var savingPronouns by remember { mutableStateOf(false) }
    var banner by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var editingStatus by remember { mutableStateOf(false) }
    var confirmRemoveAvatar by remember { mutableStateOf(false) }
    var confirmRemoveBanner by remember { mutableStateOf(false) }

    fun run(work: suspend () -> Unit) = scope.launch {
        status = null
        try {
            work()
        } catch (error: Exception) {
            status = error.text to true
        }
    }

    LaunchedEffect(session.userId) {
        val id = session.userId ?: return@LaunchedEffect
        banner = runCatching { session.client?.banner(id) }.getOrNull()
        canSetPronouns = session.canSetPronouns()
        savedPronouns = session.pronouns(id) ?: ""
        pronouns = savedPronouns
    }

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        run {
            val data = readBytes(context, uri) ?: return@run
            val jpeg = reencode(data, Bitmap.CompressFormat.JPEG, 85) ?: return@run
            session.setAvatar(jpeg, "image/jpeg")
        }
    }
    val bannerPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        run {
            val client = session.client ?: return@run
            val id = session.userId ?: return@run
            val data = readBytes(context, uri) ?: return@run
            val jpeg = reencode(data, Bitmap.CompressFormat.JPEG, 85) ?: return@run
            client.setBanner(jpeg, "image/jpeg")
            banner = client.banner(id)
        }
    }
    val imageOnly = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)

    SettingsPage(tr("settings.profile.title"), onBack) {
        SettingsSection {
            ProfileCard(
                banner = banner,
                pronouns = savedPronouns,
                onAvatar = { avatarPicker.launch(imageOnly) },
                onRemoveAvatar = if (session.avatarUrl != null) ({ confirmRemoveAvatar = true }) else null,
                onBanner = { bannerPicker.launch(imageOnly) },
                onRemoveBanner = if (banner != null) ({ confirmRemoveBanner = true }) else null,
                onStatus = { editingStatus = true },
            )
        }

        SettingsSection {
            SettingsItem {
                Text(tr("settings.account.displayName"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    WizardTextField(displayName, { displayName = it }, tr("settings.account.displayNamePlaceholder"), Modifier.weight(1f))
                    val trimmed = displayName.trim()
                    PrimaryButton(
                        if (savingName) "..." else tr("common.save"),
                        {
                            scope.launch {
                                savingName = true
                                status = null
                                try {
                                    session.setDisplayName(trimmed)
                                } catch (error: Exception) {
                                    status = error.text to true
                                }
                                savingName = false
                            }
                        },
                        Modifier.width(WZ.SizeAvatar.xl),
                        enabled = !savingName && trimmed.isNotEmpty() && displayName != session.displayName,
                    )
                }
            }
            if (canSetPronouns) {
                SettingsDivider()
                SettingsItem {
                    Text(tr("profile.pronouns"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        WizardTextField(
                            pronouns,
                            { pronouns = it.take(Pronouns.MAX_LENGTH) },
                            tr("profile.pronounsPlaceholder"),
                            Modifier.weight(1f),
                        )
                        PrimaryButton(
                            if (savingPronouns) "..." else tr("common.save"),
                            {
                                scope.launch {
                                    savingPronouns = true
                                    status = null
                                    try {
                                        session.setPronouns(pronouns)
                                        savedPronouns = pronouns.trim()
                                        pronouns = savedPronouns
                                    } catch (error: Exception) {
                                        status = error.text to true
                                    }
                                    savingPronouns = false
                                }
                            },
                            Modifier.width(WZ.SizeAvatar.xl),
                            enabled = !savingPronouns && pronouns.trim() != savedPronouns,
                        )
                    }
                }
            }
        }

        status?.let { StatusText(it.first, it.second) }
    }

    if (editingStatus) CustomStatusSheet(onDismiss = { editingStatus = false })
    if (confirmRemoveAvatar) {
        ConfirmDialog(
            tr("common.removeAvatar"),
            tr("common.remove"),
            onConfirm = { run { session.removeAvatar() } },
            onDismiss = { confirmRemoveAvatar = false },
            message = tr("common.removeAvatarConfirm"),
        )
    }
    if (confirmRemoveBanner) {
        ConfirmDialog(
            tr("profile.removeBanner"),
            tr("common.remove"),
            onConfirm = {
                run {
                    session.client?.setBanner()
                    banner = null
                }
            },
            onDismiss = { confirmRemoveBanner = false },
            message = tr("profile.removeBannerConfirm"),
        )
    }
}

@Composable
private fun ProfileCard(
    banner: String?,
    pronouns: String,
    onAvatar: () -> Unit,
    onRemoveAvatar: (() -> Unit)?,
    onBanner: () -> Unit,
    onRemoveBanner: (() -> Unit)?,
    onStatus: () -> Unit,
) {
    val session = LocalSession.current
    val media = LocalMedia.current
    val clipboard = LocalClipboardManager.current
    val name = session.displayName ?: session.userId ?: ""
    var bannerImage by remember(banner) { mutableStateOf<Bitmap?>(null) }
    var bannerMenu by remember { mutableStateOf(false) }
    var avatarMenu by remember { mutableStateOf(false) }
    LaunchedEffect(banner, media) {
        bannerImage = if (banner != null && media != null) media.thumbnail(banner, 1200) else null
    }
    val bannerHeight = 112.dp
    val avatarSize = WZ.SizeAvatar.xxl
    val ring = 5.dp

    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(bannerHeight)
                    .background(Brush.linearGradient(listOf(theme.accent, theme.accent.copy(alpha = 0.45f)))),
            ) {
                bannerImage?.let {
                    Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
                Box(Modifier.align(Alignment.TopEnd).padding(WZ.Space.space4)) {
                    EditBadge(Modifier.clickable { bannerMenu = true })
                    WizardMenu(
                        bannerMenu,
                        { bannerMenu = false },
                        listOfNotNull(
                            MenuItem(L10n.format("settings.profile.changeBanner"), "image", onClick = onBanner),
                            onRemoveBanner?.let { MenuItem(L10n.format("profile.removeBanner"), "trash", destructive = true, onClick = it) },
                        ),
                    )
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(start = WZ.Space.space6 - ring, end = WZ.Space.space6, top = bannerHeight - avatarSize / 2 - ring),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                Box {
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(theme.groupedRow)
                            .padding(ring)
                            .clickable { avatarMenu = true },
                    ) {
                        Avatar(name, session.avatarUrl, size = avatarSize)
                    }
                    EditBadge(Modifier.align(Alignment.BottomEnd).padding(ring))
                    WizardMenu(
                        avatarMenu,
                        { avatarMenu = false },
                        listOfNotNull(
                            MenuItem(L10n.format("settings.profile.changeAvatar"), "image", onClick = onAvatar),
                            onRemoveAvatar?.let { MenuItem(L10n.format("common.removeAvatar"), "trash", destructive = true, onClick = it) },
                        ),
                    )
                }
                StatusBubble(session.customStatus?.text, onStatus, Modifier.weight(1f).padding(top = avatarSize / 2 + ring + WZ.Space.space3))
            }
        }
        Column(
            Modifier.padding(start = WZ.Space.space6, end = WZ.Space.space6, top = WZ.Space.space4, bottom = WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
        ) {
            Text(name, style = wizardFont(WZ.FontSize.xxl, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (pronouns.isNotEmpty()) {
                Text(pronouns, style = wizardFont(WZ.FontSize.md), color = theme.textSecondary, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Text(session.userId ?: "", Modifier.weight(1f, fill = false), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                PhIcon(
                    "copy",
                    size = WZ.SizeIcon.xs,
                    tint = theme.control,
                    modifier = Modifier.clickable { clipboard.setText(AnnotatedString(session.userId ?: "")) },
                )
            }
        }
    }
}

@Composable
private fun EditBadge(modifier: Modifier = Modifier) {
    Box(
        modifier.size(WZ.Space.space9).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon("pencil-simple", PhWeight.fill, size = WZ.SizeIcon.xs, tint = Color.White)
    }
}

private val bubbleTail = 5.dp

private object StatusBubbleShape : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density) =
        Outline.Generic(Path().apply { bubble(size, density.density) })
}

private fun Path.bubble(size: Size, density: Float) {
    val tail = bubbleTail.value * density
    val left = minOf(10f * density, size.height / 2)
    val right = minOf(16f * density, size.height / 2)
    val half = 4.5f * density
    val x0 = tail
    val mid = size.height / 2
    moveTo(x0 + left, 0f)
    lineTo(size.width - right, 0f)
    arcTo(Rect(size.width - 2 * right, 0f, size.width, 2 * right), -90f, 90f, false)
    lineTo(size.width, size.height - right)
    arcTo(Rect(size.width - 2 * right, size.height - 2 * right, size.width, size.height), 0f, 90f, false)
    lineTo(x0 + left, size.height)
    arcTo(Rect(x0, size.height - 2 * left, x0 + 2 * left, size.height), 90f, 90f, false)
    lineTo(x0, mid + half)
    lineTo(0f, mid)
    lineTo(x0, mid - half)
    lineTo(x0, left)
    arcTo(Rect(x0, 0f, x0 + 2 * left, 2 * left), 180f, 90f, false)
    close()
}

@Composable
private fun StatusBubble(text: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val emojiOnly = text != null && StatusEmoji.split(text).let { it.first.isNotEmpty() && it.second.isEmpty() }
    Box(modifier, contentAlignment = Alignment.CenterStart) {
        Row(
            Modifier
                .clip(StatusBubbleShape)
                .background(theme.bgSecondary)
                .border(1.dp, theme.border, StatusBubbleShape)
                .clickable(onClick = onClick)
                .padding(
                    start = bubbleTail + WZ.Space.space4,
                    end = WZ.Space.space5,
                    top = if (emojiOnly) WZ.Space.space1 else WZ.Space.space3,
                    bottom = if (emojiOnly) WZ.Space.space1 else WZ.Space.space3,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        ) {
            if (text != null) {
                Text(
                    text,
                    style = if (emojiOnly) wizardFont(WZ.FontSize.sm).copy(fontSize = 26.sp) else wizardFont(WZ.FontSize.sm),
                    color = theme.textPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            } else {
                PhIcon("plus-circle", PhWeight.fill, size = WZ.SizeIcon.xs, tint = theme.textMuted)
                Text(
                    tr("status.addStatus"),
                    style = wizardFont(WZ.FontSize.sm).copy(fontStyle = FontStyle.Italic),
                    color = theme.textMuted,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
internal fun AccountSettings(onBack: () -> Unit) {
    val session = LocalSession.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var showDeactivate by remember { mutableStateOf(false) }

    fun open() = scope.launch {
        val url = session.accountManagementUrl()
        if (url != null) {
            uriHandler.openUri(url)
        } else {
            status = L10n.format("settings.account.authMethodUnsupported") to true
        }
    }

    SettingsPage(tr("settings.account.title"), onBack) {
        if (session.isOAuthAccount) {
            SettingsSection {
                Text(
                    tr("settings.account.externalManagement"),
                    Modifier.padding(start = WZ.Space.space5, end = WZ.Space.space5, top = WZ.Space.space5),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
                ActionRow(tr("settings.account.manageAccount"), "arrow-square-out") { open() }
            }
        } else {
            PasswordSection()
            EmailSection()
            SettingsSection {
                ActionRow(tr("settings.account.deactivateAccount"), "user-minus", destructive = true) { showDeactivate = true }
            }
        }
        status?.let { StatusText(it.first, it.second) }
    }

    if (showDeactivate) DeactivateSheet { showDeactivate = false }
}

@Composable
private fun ActionRow(title: String, icon: String, destructive: Boolean = false, onClick: () -> Unit) {
    val color = if (destructive) theme.error else theme.textPrimary
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = color)
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = color)
    }
}

@Composable
private fun PasswordSection() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    fun change() = scope.launch {
        if (new.length < 8) {
            status = L10n.format("settings.account.passwordTooShort") to true
            return@launch
        }
        if (new != confirm) {
            status = L10n.format("common.passwordMismatch") to true
            return@launch
        }
        busy = true
        try {
            session.changePassword(current, new)
            current = ""
            new = ""
            confirm = ""
            status = L10n.format("settings.account.passwordChanged") to false
        } catch (error: Exception) {
            status = error.text to true
        } finally {
            busy = false
        }
    }

    SettingsSection(tr("auth.password")) {
        SettingsItem {
            WizardTextField(current, { current = it }, tr("auth.password"), password = true)
            WizardTextField(new, { new = it }, tr("settings.account.newPassword"), password = true)
            WizardTextField(confirm, { confirm = it }, tr("settings.account.confirmNewPassword"), password = true)
            PrimaryButton(
                tr("settings.account.changePassword"),
                { change() },
                enabled = !busy && current.isNotEmpty() && new.isNotEmpty() && confirm.isNotEmpty(),
            )
            status?.let { InlineStatus(it.first, it.second) }
        }
    }
}

@Composable
private fun EmailSection() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var emails by remember { mutableStateOf(listOf<String>()) }
    var newEmail by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf<Pair<String, String>?>(null) }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    LaunchedEffect(Unit) { emails = runCatching { session.emailAddresses() }.getOrDefault(emptyList()) }

    fun requestToken() = scope.launch {
        busy = true
        try {
            pending = session.requestEmailToken(newEmail)
            status = null
        } catch (error: Exception) {
            status = error.text to true
        } finally {
            busy = false
        }
    }

    fun finish() = scope.launch {
        val (sid, secret) = pending ?: return@launch
        busy = true
        try {
            session.addEmail(sid, secret, password)
            pending = null
            newEmail = ""
            password = ""
            emails = runCatching { session.emailAddresses() }.getOrDefault(emails)
            status = L10n.format("settings.account.emailAdded") to false
        } catch (error: Exception) {
            status = error.text to true
        } finally {
            busy = false
        }
    }

    fun remove(email: String) = scope.launch {
        try {
            session.removeEmail(email)
            emails = emails - email
            status = L10n.format("settings.account.emailRemoved") to false
        } catch (error: Exception) {
            status = error.text to true
        }
    }

    SettingsSection(tr("settings.account.emailTitle")) {
        SettingsItem {
            if (emails.isEmpty()) {
                Text(tr("settings.account.noEmails"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            emails.forEach { email ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(email, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Text(
                        tr("settings.account.removeEmail"),
                        Modifier.clickable { remove(email) },
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = theme.error,
                    )
                }
            }
            if (pending == null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    WizardTextField(
                        newEmail,
                        { newEmail = it },
                        tr("settings.account.emailPlaceholder"),
                        Modifier.weight(1f),
                        keyboardType = KeyboardType.Email,
                    )
                    PrimaryButton(
                        tr("settings.account.addEmail"),
                        { requestToken() },
                        Modifier.width(WZ.SizeAvatar.xxl),
                        enabled = !busy && newEmail.contains("@"),
                    )
                }
            } else {
                Text(tr("settings.account.checkEmail"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                Text(tr("settings.account.emailLinkHint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                WizardTextField(password, { password = it }, tr("auth.password"), password = true)
                PrimaryButton(tr("settings.account.verify"), { finish() }, enabled = !busy)
            }
            status?.let { InlineStatus(it.first, it.second) }
        }
    }
}

/** StatusText inside a row (no extra inset) */
@Composable
internal fun InlineStatus(text: String, isError: Boolean = true) {
    Text(text, style = wizardFont(WZ.FontSize.sm), color = if (isError) theme.error else theme.success)
}

@Composable
private fun DeactivateSheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var erase by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("settings.account.deactivateAccount"),
            leading = { BarTextButton(tr("common.cancel"), onDismiss) },
        )
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
                .padding(WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Text(tr("settings.account.deactivateConfirm"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
            Row(
                Modifier.fillMaxWidth().clickable { erase = !erase },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(tr("settings.account.eraseData"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                WizardSwitch(erase, { erase = it }, color = theme.danger)
            }
            WizardTextField(password, { password = it }, tr("auth.password"), password = true)
            DangerButton(
                tr("settings.account.deactivateAccount"),
                {
                    scope.launch { deactivate(session, password, erase, { busy = it }) { error = it } }
                },
                enabled = !busy && password.isNotEmpty(),
            )
            error?.let { InlineStatus(it) }
        }
    }
}

private suspend fun deactivate(session: MatrixSession, password: String, erase: Boolean, setBusy: (Boolean) -> Unit, onError: (String) -> Unit) {
    setBusy(true)
    try {
        session.deactivateAccount(password, erase)
    } catch (failure: Exception) {
        onError(failure.text)
    } finally {
        setBusy(false)
    }
}

private enum class ClearAfter { Today, FourHours, OneHour, ThirtyMinutes, Never }

@Composable
private fun CustomStatusSheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val initial = remember { StatusEmoji.split(session.customStatus?.text ?: "") }
    var emoji by remember { mutableStateOf(initial.first) }
    var text by remember { mutableStateOf(initial.second) }
    var clearAfter by remember {
        mutableStateOf(if (session.customStatus != null && session.customStatus?.expiresAt == null) ClearAfter.Never else ClearAfter.Today)
    }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pickingEmoji by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    fun label(choice: ClearAfter) = when (choice) {
        ClearAfter.Today -> L10n.format("status.clearToday")
        ClearAfter.FourHours -> L10n.plural("status.clearHours", 4, 4)
        ClearAfter.OneHour -> L10n.plural("status.clearHours", 1, 1)
        ClearAfter.ThirtyMinutes -> L10n.plural("status.clearMinutes", 30, 30)
        ClearAfter.Never -> L10n.format("status.clearNever")
    }
    fun expiry(choice: ClearAfter): Long? {
        val now = System.currentTimeMillis()
        return when (choice) {
            ClearAfter.Today -> java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
                add(java.util.Calendar.DAY_OF_YEAR, 1)
            }.timeInMillis
            ClearAfter.FourHours -> now + 4 * 3_600_000L
            ClearAfter.OneHour -> now + 3_600_000L
            ClearAfter.ThirtyMinutes -> now + 30 * 60_000L
            ClearAfter.Never -> null
        }
    }
    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("status.setCustomStatus"),
            leading = { BarTextButton(tr("common.cancel"), onDismiss) },
        )
        Column(
            Modifier.fillMaxWidth().padding(WZ.Space.space6).imePadding().navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Text(tr("status.whatsUp"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Box {
                    Box(
                        Modifier
                            .size(WZ.Space.space11)
                            .clip(CircleShape)
                            .background(if (pickingEmoji) theme.bgActive else theme.bgTertiary)
                            .clickable(onClickLabel = tr(if (emoji.isEmpty()) "status.addEmoji" else "status.changeEmoji")) {
                                focus.clearFocus()
                                pickingEmoji = !pickingEmoji
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (emoji.isEmpty()) {
                            PhIcon("smiley", size = WZ.SizeIcon.md, tint = if (pickingEmoji) theme.textPrimary else theme.textMuted)
                        } else {
                            Text(emoji, fontSize = 22.sp)
                        }
                    }
                    if (emoji.isNotEmpty()) {
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(theme.bgTertiary)
                                .clickable(onClickLabel = tr("status.removeEmoji")) { emoji = "" },
                            contentAlignment = Alignment.Center,
                        ) {
                            PhIcon("x", size = 10.dp, tint = theme.textMuted)
                        }
                    }
                }
                WizardTextField(
                    text,
                    { text = it.take(128 - if (emoji.isEmpty()) 0 else emoji.length + 1) },
                    tr("status.placeholder"),
                    Modifier.weight(1f),
                )
            }
            if (pickingEmoji) {
                Box(Modifier.fillMaxWidth().height(320.dp)) {
                    EmojiGrid(emptyList(), unicodeOnly = true) { picked, image ->
                        if (image == null) emoji = picked
                        pickingEmoji = false
                    }
                }
            }
            Text(tr("status.clearAfter"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                ClearAfter.entries.forEach { choice -> Chip(label(choice), clearAfter == choice, { clearAfter = choice }) }
            }
            error?.let { StatusText(it, true) }
            PrimaryButton(tr("common.save"), {
                saving = true
                scope.launch {
                    try {
                        session.setCustomStatus(StatusEmoji.join(emoji, text), expiry(clearAfter))
                        onDismiss()
                    } catch (e: Exception) {
                        error = e.text
                    }
                    saving = false
                }
            }, enabled = !saving)
            if (session.customStatus != null) {
                Text(
                    tr("status.clearStatus"),
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(WZ.Radius.md))
                        .clickable(enabled = !saving) {
                            saving = true
                            scope.launch {
                                try {
                                    session.setCustomStatus("", null)
                                    onDismiss()
                                } catch (e: Exception) {
                                    error = e.text
                                }
                                saving = false
                            }
                        }
                        .padding(vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.error,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
