package org.wizardchat.android.ui.settings

import android.text.format.DateFormat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.PackageInfoCompat
import java.util.Date
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.AppPreferences
import org.wizardchat.android.matrix.Density
import org.wizardchat.android.matrix.MediaVisibility
import org.wizardchat.android.matrix.MessageLayout
import org.wizardchat.android.matrix.MessageMention
import org.wizardchat.android.matrix.ReducedMotion
import org.wizardchat.android.matrix.deviceId
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardLogo
import org.wizardchat.android.ui.room.MentionColors
import org.wizardchat.android.ui.room.MessageText
import org.wizardchat.android.ui.theme.ThemeSetting
import org.wizardchat.android.ui.theme.WizardTheme
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ
import org.wizardchat.core.SoundCredit

@Composable
internal fun AppearanceSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val themeHasIcon = (prefs.theme as? ThemeSetting.Fixed)?.theme != WZ.Theme.CARBON && prefs.theme is ThemeSetting.Fixed

    SettingsPage(tr("settings.appearance.title"), onBack) {
        SettingsSection { ChatPreview() }

        SettingsSection {
            // Ten themes don't fit beside the label, so it sits above them
            SettingsItem {
                Text(tr("settings.appearance.theme"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    ThemeSetting.allCases.forEach { setting ->
                        val selected = prefs.theme == setting
                        val label = setting.label()
                        Box(
                            Modifier
                                .padding(WZ.Space.space1)
                                .size(WZ.Space.space9)
                                .clip(CircleShape)
                                .background(swatch(setting))
                                .border(if (selected) 2.5.dp else 1.dp, if (selected) theme.accent else theme.border, CircleShape)
                                .clickable { prefs.theme = setting }
                                .semantics {
                                    contentDescription = label
                                    this.selected = selected
                                    role = Role.RadioButton
                                },
                        )
                    }
                }
            }
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.themedAppIcon"),
                themeHasIcon && prefs.themedAppIcon,
                { prefs.themedAppIcon = it },
                disabled = !themeHasIcon,
            )
        }

        SettingsSection(tr("settings.appearance.chat")) {
            PickerRow(
                tr("settings.appearance.messageLayout"),
                prefs.messageLayout,
                listOf(
                    MessageLayout.modern to tr("settings.appearance.modern"),
                    MessageLayout.classic to tr("settings.appearance.classic"),
                    MessageLayout.compact to tr("settings.appearance.compact"),
                ),
                { prefs.messageLayout = it },
            )
            SettingsDivider()
            SettingsItem {
                Row(
                    Modifier.pointerInput(Unit) {
                        detectTapGestures(onDoubleTap = { prefs.chatFontSize = AppPreferences.DEFAULT_CHAT_FONT_SIZE })
                    },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tr("settings.appearance.textSize"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Text(
                        tr("settings.appearance.textSizePx", "${prefs.chatFontSize.toInt()}"),
                        style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
                        color = theme.textMuted,
                    )
                }
                val sizes = AppPreferences.CHAT_FONT_SIZES
                Slider(
                    value = sizes.indexOf(prefs.chatFontSize).takeIf { it >= 0 }?.toFloat() ?: 2f,
                    onValueChange = { prefs.chatFontSize = sizes[Math.round(it).coerceIn(0, sizes.lastIndex)] },
                    valueRange = 0f..sizes.lastIndex.toFloat(),
                    steps = sizes.size - 2,
                    colors = SliderDefaults.colors(
                        thumbColor = theme.accent,
                        activeTrackColor = theme.accent,
                        inactiveTrackColor = theme.fill,
                        activeTickColor = theme.textOnAccent.copy(alpha = 0.5f),
                        inactiveTickColor = theme.textMuted.copy(alpha = 0.5f),
                    ),
                )
            }
            SettingsDivider()
            PickerRow(tr("settings.appearance.density"), prefs.chatDensity, densityOptions(), { prefs.chatDensity = it })
            SettingsDivider()
            ToggleRow(tr("settings.appearance.colorUsernames"), prefs.colorUsernames, { prefs.colorUsernames = it })
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.groupImages"),
                prefs.groupImages,
                { prefs.groupImages = it },
                note = tr("settings.appearance.groupImagesNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.largeEmoji"),
                prefs.largeEmoji,
                { prefs.largeEmoji = it },
                note = tr("settings.appearance.largeEmojiNote"),
            )
            SettingsDivider()
            ToggleRow(tr("settings.appearance.showJoinLeave"), prefs.showJoinLeave, { prefs.showJoinLeave = it })
            SettingsDivider()
            ToggleRow(tr("settings.appearance.showProfileChanges"), prefs.showProfileChanges, { prefs.showProfileChanges = it })
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.emoticonsToEmoji"),
                prefs.emoticonsToEmoji,
                { prefs.emoticonsToEmoji = it },
                note = tr("settings.appearance.emoticonsToEmojiNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.appearance.prettifyLinks"),
                prefs.prettifyLinks,
                { prefs.prettifyLinks = it },
                note = tr("settings.appearance.prettifyLinksNote"),
            )
        }

        SettingsSection {
            PickerRow(
                tr("settings.appearance.uiDensity"),
                prefs.uiDensity,
                densityOptions(),
                { prefs.uiDensity = it },
                note = tr("settings.appearance.uiDensityNote"),
            )
            SettingsDivider()
            ToggleRow(tr("settings.appearance.showRoomAvatars"), prefs.showRoomAvatars, { prefs.showRoomAvatars = it })
        }
    }
}

@Composable
private fun densityOptions() = listOf(
    Density.compact to tr("settings.appearance.densityCompact"),
    Density.default to tr("settings.appearance.densityDefault"),
    Density.spacious to tr("settings.appearance.densitySpacious"),
)

private fun swatch(setting: ThemeSetting): Brush {
    val (first, second) = when (setting) {
        ThemeSetting.System -> WizardTheme(setting.resolved(false)).bgSecondary to WizardTheme(setting.resolved(true)).bgSecondary
        is ThemeSetting.Fixed -> WizardTheme(setting.theme).let { it.bgSecondary to it.accent }
    }
    return Brush.linearGradient(0f to first, 0.5f to first, 0.5f to second, 1f to second)
}

/** Two sample messages in the current theme, text size, density and layout */
@Composable
private fun ChatPreview() {
    val session = LocalSession.current
    val now = remember { System.currentTimeMillis() }
    val ownName = session.displayName ?: session.userId ?: "You"
    Column(Modifier.fillMaxWidth().padding(vertical = WZ.Space.space4)) {
        PreviewMessage(
            "Merlin",
            null,
            "settings.appearance.previewOtherMessage",
            mention = mentionLabel(ownName),
            mentionsMe = true,
            isOwn = false,
            senderId = "@merlin:wizardchat.org",
            timestamp = now - 120_000,
        )
        PreviewMessage(
            ownName,
            session.avatarUrl,
            "settings.appearance.previewOwnMessage",
            mention = mentionLabel("Merlin"),
            mentionsMe = false,
            senderId = session.userId ?: "@you:wizardchat.org",
            isOwn = true,
            timestamp = now - 60_000,
        )
    }
}

private fun mentionLabel(name: String) = if (name.startsWith("@")) name else "@$name"

@Composable
private fun PreviewMessage(
    sender: String,
    avatarUrl: String?,
    textKey: String,
    mention: String,
    mentionsMe: Boolean,
    isOwn: Boolean,
    senderId: String,
    timestamp: Long,
) {
    val body = tr(textKey, mention)
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val scale = prefs.chatScale
    val spacing = prefs.chatSpacing
    val isClassic = prefs.messageLayout == MessageLayout.classic
    val linkColor = if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.linkColor
    val text = MessageText.attributed(
        body,
        prefs.prettifyLinks,
        linkColor,
        mentions = listOf(MessageMention(mention, "", isOwn = mentionsMe)),
        mentionColors = MentionColors(theme.mention, if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.accent),
        onMention = {},
    )
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6)
            .padding(top = (6 * spacing).dp, bottom = (2 * spacing).dp),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Avatar(sender, avatarUrl, size = WZ.SizeAvatar.md, modifier = Modifier.padding(top = WZ.Space.space1))
        Column(Modifier.weight(1f).padding(end = WZ.Space.space5)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                Text(
                    sender,
                    Modifier.weight(1f, fill = false),
                    style = wizardFont(WZ.FontSize.md * scale, FontWeight.SemiBold),
                    color = nameColor(senderId),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    DateFormat.getTimeFormat(context).format(Date(timestamp)),
                    style = wizardFont(WZ.FontSize.sm * scale),
                    color = theme.textMuted,
                )
            }
            Text(
                text,
                Modifier
                    .then(
                        if (isClassic) {
                            Modifier
                                .clip(RoundedCornerShape(WZ.Radius.xl))
                                .background(if (isOwn) theme.msgMineBg else theme.msgOtherBg)
                                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)
                        } else {
                            Modifier
                        },
                    ),
                style = wizardFont(WZ.FontSize.lg * scale).copy(lineHeight = WZ.FontSize.lg * scale * 1.25f),
                color = if (isClassic && isOwn && theme.isDark) theme.textOnAccent else theme.textPrimary,
            )
        }
    }
}

@Composable
internal fun AccessibilitySettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.accessibility.title"), onBack) {
        SettingsSection {
            PickerRow(
                tr("settings.accessibility.reducedMotion"),
                prefs.reducedMotion,
                listOf(
                    ReducedMotion.system to tr("settings.accessibility.reducedMotionSystem"),
                    ReducedMotion.on to tr("settings.accessibility.reducedMotionOn"),
                    ReducedMotion.off to tr("settings.accessibility.reducedMotionOff"),
                ),
                { prefs.reducedMotion = it },
                note = tr("settings.accessibility.reducedMotionNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.accessibility.autoplayGifs"),
                prefs.autoplayGifs,
                { prefs.autoplayGifs = it },
                note = tr("settings.accessibility.autoplayGifsNote"),
            )
        }
    }
}

@Composable
internal fun PrivacySettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    var presenceChanged by remember { mutableStateOf(false) }
    LaunchedEffect(prefs.showPresence) {
        if (presenceChanged) session.applyPresence(prefs.showPresence)
        presenceChanged = true
    }
    SettingsPage(tr("settings.privacy.title"), onBack) {
        SettingsSection(tr("settings.privacy.chat")) {
            ToggleRow(
                tr("settings.privacy.typingIndicators"),
                prefs.typingIndicators,
                { prefs.typingIndicators = it },
                note = tr("settings.privacy.typingIndicatorsNote"),
            )
            SettingsDivider()
            ToggleRow(tr("settings.privacy.readReceipts"), prefs.sendReadReceipts, { prefs.sendReadReceipts = it }, note = tr("settings.privacy.readReceiptsNote"))
        }
        SettingsSection(tr("settings.privacy.media")) {
            PickerRow(
                tr("settings.privacy.mediaVisibility"),
                prefs.mediaVisibility,
                listOf(
                    MediaVisibility.always to tr("settings.privacy.mediaVisibilityAlways"),
                    MediaVisibility.private to tr("settings.privacy.mediaVisibilityPrivate"),
                    MediaVisibility.never to tr("settings.privacy.mediaVisibilityNever"),
                ),
                { prefs.mediaVisibility = it },
            )
        }
        SettingsSection(tr("settings.privacy.other")) {
            ToggleRow(tr("settings.privacy.presence"), prefs.showPresence, { prefs.showPresence = it }, note = tr("settings.privacy.presenceNote"))
        }
    }
}

/** The app language; Android applies it right away (per-app languages), so there's no "reopen" note */
@Composable
internal fun LanguageSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    SettingsPage(tr("settings.language.title"), onBack) {
        SettingsSection {
            PickerRow(
                tr("settings.language.languageDisplay"),
                prefs.language,
                listOf(
                    "" to tr("settings.language.languageSystem"),
                    "en" to tr("settings.language.languageEn"),
                    "de" to tr("settings.language.languageDe"),
                ),
                { prefs.language = it },
            )
        }
    }
}

@Composable
internal fun DeveloperSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    var tokenExpanded by remember { mutableStateOf(false) }
    var showAccountData by remember { mutableStateOf(false) }
    SettingsPage(tr("developer.title"), onBack) {
        SettingsSection {
            ToggleRow(
                tr("developer.enable"),
                prefs.developerMode,
                { prefs.developerMode = it },
                note = tr("developer.enableDescription"),
            )
        }
        if (prefs.developerMode) {
            SettingsSection {
                val rotation by animateFloatAsState(if (tokenExpanded) 90f else 0f, label = "disclosure")
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = WZ.Space.space11)
                        .clickable { tokenExpanded = !tokenExpanded }
                        .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(tr("developer.accessToken"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Box(Modifier.rotate(rotation)) {
                        PhIcon("caret-right", org.wizardchat.android.ui.PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.accent)
                    }
                }
                AnimatedVisibility(tokenExpanded) {
                    Column {
                        Row(
                            Modifier.padding(horizontal = WZ.Space.space5),
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                        ) {
                            PhIcon("warning", size = WZ.SizeIcon.sm, tint = theme.warningColor)
                            Text(tr("developer.accessTokenWarning"), style = wizardFont(WZ.FontSize.sm), color = theme.warningColor)
                        }
                        CopyRow(tr("developer.accessToken"), session.client?.session?.accessToken ?: "", secret = true)
                    }
                }
                SettingsDivider()
                CopyRow(tr("developer.homeserverUrl"), session.client?.session?.homeserverUrl ?: "")
                session.deviceId?.let { deviceId ->
                    SettingsDivider()
                    CopyRow(tr("settings.sessions.deviceId"), deviceId)
                }
            }
            SettingsSection {
                Text(
                    tr("developer.accountData.title"),
                    Modifier
                        .fillMaxWidth()
                        .clickable { showAccountData = true }
                        .heightIn(min = WZ.Space.space11)
                        .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textPrimary,
                )
            }
        }
    }
    if (showAccountData) AccountDataSheet(onDismiss = { showAccountData = false })
}

@Composable
internal fun AboutSettings(onBack: () -> Unit) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val whatsNew = remember { WhatsNew.latest(context) }
    var showWhatsNew by remember { mutableStateOf(false) }
    val version = remember {
        runCatching {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            "v${info.versionName ?: "?"} (${PackageInfoCompat.getLongVersionCode(info)})"
        }.getOrDefault("v? (?)")
    }
    SettingsPage(tr("settings.about.title"), onBack) {
        SettingsSection {
            SettingsItem(horizontalAlignment = Alignment.CenterHorizontally) {
                WizardLogo(size = WZ.Space.space12)
                Text(tr("app.name"), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary)
                Text(tr("auth.tagline"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                Text(version, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            SettingsItem {
                LabelButton(
                    tr("settings.about.viewSourceOnGitLab"),
                    "code",
                    { uriHandler.openUri("https://gitlab.com/wizardchat/wizardchat") },
                )
            }
        }

        SettingsSection(tr("settings.about.credits")) {
            SettingsItem {
                Credit("matrix-rust-sdk", "https://github.com/matrix-org/matrix-rust-sdk", tr("settings.about.creditMatrix"))
                Credit("Roboto", "https://fonts.google.com/specimen/Roboto", tr("settings.about.creditRoboto"))
            }
            SoundCredits()
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space7),
        ) {
            if (whatsNew != null) FooterLink(tr("whatsNew.title"), "sparkle") { showWhatsNew = true }
            FooterLink(tr("settings.about.privacyPolicy"), "shield-check") { uriHandler.openUri("https://wizardchat.org/privacy/") }
        }
    }
    if (showWhatsNew && whatsNew != null) WhatsNewSheet(whatsNew) { showWhatsNew = false }
}

@Composable
private fun FooterLink(text: String, icon: String, onClick: () -> Unit) {
    Row(
        Modifier.clickable(onClick = onClick).padding(vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = theme.textMuted)
        Text(text, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
    }
}

@Composable
private fun SoundCredits() {
    val client = LocalSession.current.client
    var expanded by remember { mutableStateOf(false) }
    var credits by remember { mutableStateOf<List<SoundCredit>>(emptyList()) }
    LaunchedEffect(expanded, client) {
        if (expanded && credits.isEmpty() && client != null) credits = runCatching { client.soundboardCredits() }.getOrDefault(emptyList())
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded }
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(tr("settings.about.sounds"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
        PhIcon("caret-down", size = WZ.SizeIcon.sm, tint = theme.textMuted, modifier = Modifier.rotate(if (expanded) 180f else 0f))
    }
    AnimatedVisibility(expanded) {
        SettingsItem {
            credits.forEach { Credit(it.title, it.url, tr("settings.about.creditSound", it.author)) }
        }
    }
}

@Composable
private fun Credit(name: String, url: String, text: String) {
    val accent = theme.accent
    val muted = theme.textMuted
    Text(
        buildAnnotatedString {
            withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = accent)))) { append(name) }
            withStyle(SpanStyle(color = muted)) { append(" $text") }
        },
        style = wizardFont(WZ.FontSize.sm),
    )
}
