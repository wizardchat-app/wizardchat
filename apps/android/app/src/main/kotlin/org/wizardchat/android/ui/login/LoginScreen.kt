package org.wizardchat.android.ui.login

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.BrowserLogin
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LineDivider
import org.wizardchat.android.ui.Note
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardLogo
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.IdentityProvider
import org.wizardchat.core.RegistrationInfo
import org.wizardchat.core.ServerInfo
import org.wizardchat.core.WizardClient
import org.wizardchat.core.WizardError
import org.wizardchat.tokens.WZ

private enum class Mode { Login, Register }
private enum class UsernameState { Idle, Checking, Available, Taken, Reserved, Invalid }

private val PRESETS = listOf("https://matrix.org", "https://mozilla.org", "https://unredacted.org")
private const val CUSTOM = "custom"
private const val SERVER_LIST_URL = "https://servers.joinmatrix.org"
private val LOCALPART = Regex("^[a-z0-9._=\\-/+]+$")

/**
 * Sign in or create an account. Asks the server what it supports first and only offers that: the
 * server's own page (OIDC), a password form, or single sign-on.
 */
@Composable
fun LoginScreen() {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var mode by remember { mutableStateOf(Mode.Login) }
    var serverChoice by remember { mutableStateOf(PRESETS[0]) }
    var customServer by remember { mutableStateOf("") }
    var info by remember { mutableStateOf<ServerInfo?>(null) }
    var registration by remember { mutableStateOf<RegistrationInfo?>(null) }
    var registrationRateLimited by remember { mutableStateOf(false) }
    var unreachable by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var usernameState by remember { mutableStateOf(UsernameState.Idle) }
    var busy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val server = if (serverChoice == CUSTOM) customServer.trim() else serverChoice
    val serverName = runCatching { android.net.Uri.parse(if ("://" in server) server else "https://$server").host }.getOrNull().orEmpty()

    fun message(error: Throwable): String = when {
        error is WizardError && error.code == "invalidCredentials" -> L10n.format("auth.errors.credentials")
        error is WizardError && error.code == "homeserver" -> L10n.format("auth.errors.homeserver", server)
        error is WizardError -> L10n.format("auth.errors.generic", error.message)
        else -> L10n.format("auth.loginFailed", error.message ?: error.toString())
    }

    fun signInWithBrowser(sso: IdentityProvider? = null, createAccount: Boolean = false) = scope.launch {
        busy = true
        errorMessage = null
        try {
            val url = session.startBrowserLogin(server, sso, createAccount)
            val callback = BrowserLogin.open(context, url)
            if (callback == null) session.cancelBrowserLogin() else session.finishBrowserLogin(callback.toString())
        } catch (error: Exception) {
            session.cancelBrowserLogin()
            errorMessage = message(error)
        } finally {
            busy = false
        }
    }

    fun logInWithPassword() = scope.launch {
        if (username.isEmpty() || password.isEmpty()) {
            errorMessage = L10n.format("auth.fillAllFields")
            return@launch
        }
        busy = true
        errorMessage = null
        try {
            session.login(server, username, password)
        } catch (error: Exception) {
            errorMessage = message(error)
        } finally {
            busy = false
        }
    }

    val usernameError = usernameState in listOf(UsernameState.Taken, UsernameState.Reserved, UsernameState.Invalid)
    val canRegister = username.isNotEmpty() && password.length >= 8 && !usernameError && usernameState != UsernameState.Checking

    fun register() = scope.launch {
        if (!canRegister) return@launch
        // Only flows without extra steps (dummy, terms) can be completed here
        val flows = registration?.flows.orEmpty()
        val supported = { stage: String -> stage == "m.login.dummy" || stage == "m.login.terms" }
        if (flows.isNotEmpty() && flows.none { flow -> flow.all(supported) }) {
            errorMessage = L10n.format("auth.additionalVerification", flows.joinToString(", ") { it.joinToString(" -> ") })
            return@launch
        }
        busy = true
        errorMessage = null
        try {
            session.register(server, username, password)
        } catch (error: WizardError) {
            errorMessage = when (error.errcode) {
                "M_USER_IN_USE" -> L10n.format("auth.usernameTaken")
                "M_INVALID_USERNAME" -> L10n.format("auth.invalidUsername")
                "M_EXCLUSIVE" -> L10n.format("auth.usernameReserved")
                "M_WEAK_PASSWORD" -> L10n.format("auth.weakPassword", error.message)
                else -> L10n.format("auth.registrationFailed", error.message)
            }
        } catch (error: Exception) {
            errorMessage = L10n.format("auth.registrationFailed", error.message ?: "")
        } finally {
            busy = false
        }
    }

    LaunchedEffect(server) {
        info = null
        registration = null
        registrationRateLimited = false
        unreachable = false
        errorMessage = null
        if (serverName.isEmpty()) return@LaunchedEffect
        checking = true
        try {
            delay(400)
            val discovered = session.discover(server)
            try {
                registration = WizardClient.registrationInfo(discovered.homeserverUrl)
            } catch (error: WizardError) {
                registrationRateLimited = error.errcode == "M_LIMIT_EXCEEDED"
            } catch (_: Exception) {
            }
            info = discovered
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (_: Exception) {
            unreachable = true
        } finally {
            checking = false
        }
    }

    LaunchedEffect(server, username, mode, registration?.enabled) {
        if (mode != Mode.Register || username.isEmpty() || registration?.enabled != true) {
            usernameState = UsernameState.Idle
            return@LaunchedEffect
        }
        if (!LOCALPART.matches(username)) {
            usernameState = UsernameState.Invalid
            return@LaunchedEffect
        }
        usernameState = UsernameState.Checking
        delay(500)
        usernameState = try {
            if (WizardClient.usernameAvailable(server, username)) UsernameState.Available else UsernameState.Taken
        } catch (error: WizardError) {
            when (error.errcode) {
                "M_USER_IN_USE" -> UsernameState.Taken
                "M_INVALID_USERNAME" -> UsernameState.Invalid
                "M_EXCLUSIVE" -> UsernameState.Reserved
                else -> UsernameState.Idle
            }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (_: Exception) {
            UsernameState.Idle
        }
    }

    Box(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = WZ.Space.space8, vertical = WZ.Space.space10),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6, Alignment.CenterVertically),
        ) {
            WizardLogo(WZ.SizeAvatar.xl)
            Column(
                Modifier.padding(bottom = WZ.Space.space4),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                Text(tr("auth.title"), style = wizardFont(WZ.FontSize.display, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
                Text(tr("auth.tagline"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
            }

            Column(
                Modifier.widthIn(max = WZ.SizeMedia.maxWidth).fillMaxWidth().animateContentSize(),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            ) {
                Text(
                    tr(if (mode == Mode.Login) "auth.login" else "auth.register"),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                )

                ServerPicker(serverChoice, { serverChoice = it }, customServer, { customServer = it })

                if (mode == Mode.Register) {
                    val uriHandler = LocalUriHandler.current
                    Text(
                        tr("auth.whichServer"),
                        Modifier.fillMaxWidth().clickable { uriHandler.openUri(SERVER_LIST_URL) },
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.accent,
                        textAlign = TextAlign.Center,
                    )
                }

                val discovered = info
                when {
                    checking -> Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3, Alignment.CenterHorizontally),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Spinner(size = WZ.SizeIcon.md)
                        Text(tr("auth.checkingServer"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                    }
                    unreachable -> Note(tr("auth.serverUnreachable"))
                    discovered != null && mode == Mode.Login -> {
                        if (discovered.oauth) {
                            PrimaryButton(tr(if (busy) "auth.redirecting" else "auth.oidcLogin"), { signInWithBrowser() }, enabled = !busy)
                        }
                        if (discovered.password) {
                            WizardTextField(username, { username = it }, tr("auth.username"))
                            WizardTextField(password, { password = it }, tr("auth.password"), password = true, onSubmit = { logInWithPassword() })
                            PrimaryButton(
                                tr(if (busy) "auth.loggingIn" else "auth.login"),
                                { logInWithPassword() },
                                enabled = !busy && username.isNotEmpty() && password.isNotEmpty(),
                            )
                        }
                        SsoButtons(discovered, afterPassword = discovered.password, busy) { signInWithBrowser(sso = it) }
                        if (!discovered.oauth && !discovered.password && discovered.sso.isEmpty()) Note(tr("auth.noLoginMethod"))
                    }
                    discovered != null -> {
                        val passwordRegister = !discovered.oauth && registration?.enabled == true
                        if (discovered.oauth) {
                            PrimaryButton(
                                tr(if (busy) "auth.redirecting" else "auth.oidcRegister"),
                                { signInWithBrowser(createAccount = true) },
                                enabled = !busy,
                            )
                        }
                        if (passwordRegister) {
                            WizardTextField(username, { username = it }, tr("auth.username"))
                            usernameHint(usernameState, username, serverName)?.let { hint ->
                                Text(hint, style = wizardFont(WZ.FontSize.sm), color = if (usernameError) theme.error else theme.textMuted)
                            }
                            WizardTextField(password, { password = it }, tr("auth.password"), password = true, onSubmit = { register() })
                            if (password.isNotEmpty() && password.length < 8) {
                                Text(tr("auth.passwordTooShort"), style = wizardFont(WZ.FontSize.sm), color = theme.error)
                            }
                            PrimaryButton(tr(if (busy) "auth.registering" else "auth.registerSubmit"), { register() }, enabled = !busy && canRegister)
                        }
                        if (!discovered.oauth) SsoButtons(discovered, afterPassword = passwordRegister, busy) { signInWithBrowser(sso = it) }
                        if (!discovered.oauth && !passwordRegister && discovered.sso.isEmpty()) {
                            Note(tr(if (registrationRateLimited) "auth.registrationRateLimited" else "auth.registrationUnavailable"))
                        }
                    }
                }

                errorMessage?.let {
                    Text(it, Modifier.fillMaxWidth(), style = wizardFont(WZ.FontSize.sm), color = theme.error, textAlign = TextAlign.Center)
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterHorizontally)) {
                    Text(tr(if (mode == Mode.Login) "auth.noAccount" else "auth.haveAccount"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                    Text(
                        tr(if (mode == Mode.Login) "auth.register" else "auth.login"),
                        Modifier.clickable {
                            mode = if (mode == Mode.Login) Mode.Register else Mode.Login
                            errorMessage = null
                            password = ""
                        },
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = theme.accent,
                    )
                }
            }
        }
    }
}

@Composable
private fun ServerPicker(choice: String, onChoice: (String) -> Unit, custom: String, onCustom: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Box {
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space11)
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill)
                    .clickable { open = true }
                    .padding(horizontal = WZ.Space.space5),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (choice == CUSTOM) tr("auth.customServer") else android.net.Uri.parse(choice).host ?: choice,
                    Modifier.weight(1f),
                    style = wizardFont(WZ.FontSize.lg),
                    color = theme.textPrimary,
                )
                PhIcon("caret-up-down", tint = theme.textMuted)
            }
            DropdownMenu(open, { open = false }, containerColor = theme.bgTertiary) {
                (PRESETS + CUSTOM).forEach { preset ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                if (preset == CUSTOM) tr("auth.customServer") else android.net.Uri.parse(preset).host ?: preset,
                                style = wizardFont(WZ.FontSize.lg),
                                color = theme.textPrimary,
                            )
                        },
                        onClick = {
                            onChoice(preset)
                            open = false
                        },
                    )
                }
            }
        }
        if (choice == CUSTOM) {
            WizardTextField(custom, onCustom, tr("auth.serverUrl"), keyboardType = KeyboardType.Uri)
        }
    }
}

@Composable
private fun SsoButtons(info: ServerInfo, afterPassword: Boolean, busy: Boolean, onClick: (IdentityProvider) -> Unit) {
    if (info.sso.isEmpty()) return
    if (afterPassword) LineDivider(tr("common.or"))
    info.sso.forEach { provider ->
        SecondaryButton(
            if (provider.id == null) tr("common.continueWithSso") else tr("auth.continueWithIdp", provider.name),
            { onClick(provider) },
            enabled = !busy,
        )
    }
}

@Composable
private fun usernameHint(state: UsernameState, username: String, serverName: String): String? {
    if (username.isEmpty() || serverName.isEmpty()) return null
    val fullId = "@$username:$serverName"
    return when (state) {
        UsernameState.Taken -> tr("auth.usernameTaken")
        UsernameState.Reserved -> tr("auth.usernameReserved")
        UsernameState.Invalid -> tr("auth.usernameInvalidChars")
        UsernameState.Available -> tr("auth.usernameAvailable", fullId)
        UsernameState.Checking -> tr("auth.usernameChecking", fullId)
        UsernameState.Idle -> tr("auth.usernameHint", fullId)
    }
}
