package org.wizardchat.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Subscription
import org.wizardchat.core.VerificationEmoji
import org.wizardchat.core.VerificationFlow
import org.wizardchat.core.VerificationStatus
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

internal class VerificationModel(val start: Start) {
    sealed interface Start {
        data object OwnDevice : Start
        data class Device(val deviceId: String) : Start
        class Incoming(val flow: VerificationFlow) : Start
    }

    sealed interface Step {
        data object Starting : Step
        data object WaitingForOtherDevice : Step
        data object WaitingForEmojis : Step
        data class Incoming(val otherUser: String, val isSelf: Boolean) : Step
        data class Compare(val emojis: List<VerificationEmoji>) : Step
        data object Done : Step
        data class Failed(val message: String) : Step
        data object Cancelled : Step
    }

    var step by mutableStateOf<Step>(
        if (start is Start.Incoming) Step.Incoming(start.flow.otherUserId, start.flow.isSelfVerification) else Step.Starting,
    )
        private set
    private var flow: VerificationFlow? = null
    private var subscription: Subscription? = null
    private var begun = false
    private var accepted = false
    private var sasStarted = false
    private var sasAccepted = false
    private var scope: CoroutineScope? = null

    suspend fun begin(client: WizardClient?, scope: CoroutineScope) {
        if (begun) return
        begun = true
        this.scope = scope
        try {
            val flow = when (start) {
                Start.OwnDevice -> requireNotNull(client).requestSelfVerification()
                is Start.Device -> requireNotNull(client).requestDeviceVerification(start.deviceId)
                is Start.Incoming -> start.flow
            }
            this.flow = flow
            subscription = flow.watch(::update)
        } catch (error: Exception) {
            step = Step.Failed(error.text)
        }
    }

    fun accept() {
        accepted = true
        step = Step.WaitingForEmojis
        run { it.accept() }
    }

    private fun update(status: VerificationStatus) {
        when (status) {
            VerificationStatus.Requested -> step = Step.WaitingForOtherDevice
            // Waits for Accept; a request you started never arrives as incoming
            is VerificationStatus.Incoming -> if (!accepted) step = Step.Incoming(status.otherUser, status.isSelf)
            VerificationStatus.Ready -> {
                step = Step.WaitingForEmojis
                // The side that sent the request starts comparing; answering one, wait for it
                if (start is Start.Incoming || sasStarted) return
                sasStarted = true
                run { it.startSas() }
            }
            VerificationStatus.SasIncoming -> {
                step = Step.WaitingForEmojis
                if (sasAccepted) return
                sasAccepted = true
                run { it.acceptSas() }
            }
            VerificationStatus.SasStarted, VerificationStatus.Confirmed -> step = Step.WaitingForEmojis
            is VerificationStatus.Emojis -> step = Step.Compare(status.emojis)
            VerificationStatus.Done -> step = Step.Done
            is VerificationStatus.Cancelled -> {
                if (step == Step.Done) return
                step = if (status.reason.isEmpty()) Step.Cancelled else Step.Failed(status.reason)
            }
        }
    }

    private fun run(action: suspend (VerificationFlow) -> Unit) {
        val flow = flow ?: return
        scope?.launch {
            try {
                action(flow)
            } catch (error: Exception) {
                step = Step.Failed(error.text)
            }
        }
    }

    suspend fun confirm(matches: Boolean) {
        try {
            if (matches) flow?.confirm() else flow?.mismatch()
        } catch (error: Exception) {
            step = Step.Failed(error.text)
        }
    }

    suspend fun cancel() {
        if (step != Step.Done) runCatching { flow?.cancel() }
        subscription?.cancel()
    }

    fun stopWatching() = subscription?.cancel()
}

@Composable
internal fun VerificationSheet(model: VerificationModel, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(model) { model.begin(session.client, scope) }
    DisposableEffect(model) { onDispose { model.stopWatching() } }
    val title = if (model.start is VerificationModel.Start.OwnDevice) tr("settings.encryption.verifyWithDevice") else tr("verification.verifyDevice")
    // Swiping away mid-comparison would leave the other device waiting, so Cancel is the way out
    val waitingOnYou = model.step is VerificationModel.Step.Incoming || model.step is VerificationModel.Step.Compare

    WizardSheet(onDismiss = { if (!waitingOnYou) onDismiss() }) {
        SheetTopBar(
            "",
            leading = {
                BarTextButton(tr("common.cancel"), {
                    scope.launch { model.cancel() }
                    onDismiss()
                })
            },
        )
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = WZ.Space.space7)
                .padding(bottom = WZ.Space.space7, top = WZ.Space.space4),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            val body = wizardFont(WZ.FontSize.md)
            Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
            when (val step = model.step) {
                VerificationModel.Step.Starting, VerificationModel.Step.WaitingForOtherDevice -> {
                    Spinner()
                    val waiting = if (model.start is VerificationModel.Start.OwnDevice) "verification.otherDeviceHint" else "verification.waitingForOther"
                    Text(tr(waiting), style = body, color = theme.textMuted, textAlign = TextAlign.Center)
                }
                is VerificationModel.Step.Incoming -> {
                    PhIcon("shield-warning", size = WZ.SizeIcon.xxl, tint = theme.warningColor)
                    val text = if (step.isSelf) {
                        L10n.format("verification.newSignInDetected", step.otherUser)
                    } else {
                        L10n.format("verification.verificationRequestFrom", step.otherUser)
                    }
                    Text(text, style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        SecondaryButton(tr("common.decline"), {
                            scope.launch { model.cancel() }
                            onDismiss()
                        }, Modifier.weight(1f))
                        PrimaryButton(tr("common.accept"), { model.accept() }, Modifier.weight(1f))
                    }
                }
                VerificationModel.Step.WaitingForEmojis -> {
                    Spinner()
                    Text(tr("verification.waitingForOtherDevice"), style = body, color = theme.textMuted, textAlign = TextAlign.Center)
                }
                is VerificationModel.Step.Compare -> {
                    Text(tr("verification.compareEmojis"), style = body, color = theme.textMuted, textAlign = TextAlign.Center)
                    step.emojis.chunked(4).forEach { row ->
                        Row(Modifier.fillMaxWidth()) {
                            row.forEach { emoji ->
                                Column(
                                    Modifier.weight(1f).padding(vertical = WZ.Space.space2),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                                ) {
                                    Text(emoji.symbol, style = TextStyle(fontSize = WZ.FontSize.display))
                                    Text(
                                        emoji.description,
                                        style = wizardFont(WZ.FontSize.xs),
                                        color = theme.textMuted,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        textAlign = TextAlign.Center,
                                    )
                                }
                            }
                            repeat(4 - row.size) { Box(Modifier.weight(1f)) }
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        PrimaryButton(tr("verification.theyMatch"), { scope.launch { model.confirm(true) } })
                        SecondaryButton(tr("verification.theyDontMatch"), { scope.launch { model.confirm(false) } })
                    }
                }
                VerificationModel.Step.Done -> {
                    PhIcon("shield-check", size = WZ.SizeIcon.xxl, tint = theme.success)
                    Text(tr("verification.complete"), style = wizardFont(WZ.FontSize.lg, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
                    Text(tr("verification.deviceVerifiedOther"), style = body, color = theme.textMuted, textAlign = TextAlign.Center)
                    PrimaryButton(tr("common.done"), onDismiss)
                }
                is VerificationModel.Step.Failed -> {
                    PhIcon("x-circle", size = WZ.SizeIcon.xxl, tint = theme.error)
                    Text(step.message, style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                    SecondaryButton(tr("common.done"), onDismiss)
                }
                VerificationModel.Step.Cancelled -> {
                    PhIcon("x-circle", size = WZ.SizeIcon.xxl, tint = theme.textMuted)
                    Text(tr("verification.cancelled"), style = wizardFont(WZ.FontSize.lg, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
                    Text(tr("verification.cancelledNote"), style = body, color = theme.textMuted, textAlign = TextAlign.Center)
                    SecondaryButton(tr("common.done"), onDismiss)
                }
            }
        }
    }
}

internal class VerificationRequests private constructor() {
    var presented by mutableStateOf<VerificationModel?>(null)
    private val scope = MainScope()
    private var subscription: Subscription? = null

    fun start(client: WizardClient) {
        subscription = client.watchVerificationRequests { flow -> scope.launch { received(flow) } }
    }

    fun stop() {
        subscription?.cancel()
        subscription = null
        presented = null
    }

    private fun received(flow: VerificationFlow) {
        // Only the first status counts: whether the request is still waiting for an answer
        var seen = false
        var first: Subscription? = null
        first = flow.watch { status ->
            scope.launch {
                if (seen) return@launch
                seen = true
                first?.cancel()
                if (status is VerificationStatus.Incoming && presented == null) {
                    presented = VerificationModel(VerificationModel.Start.Incoming(flow))
                }
            }
        }
    }

    companion object {
        val shared = VerificationRequests()
    }
}
