package org.wizardchat.android.ui.room

import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.launch
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.tr
import org.wizardchat.core.WizardClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JumpToDateDialog(client: WizardClient, roomId: String, onDismiss: () -> Unit, onJump: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val state = rememberDatePickerState(
        initialSelectedDateMillis = System.currentTimeMillis(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= System.currentTimeMillis()
        },
    )
    val colors = DatePickerDefaults.colors(
        containerColor = theme.bgTertiary,
        selectedDayContainerColor = theme.accent,
        selectedDayContentColor = theme.textOnAccent,
        todayDateBorderColor = theme.accent,
        todayContentColor = theme.accent,
    )

    fun jump() {
        val day = Instant.ofEpochMilli(state.selectedDateMillis ?: return).atZone(ZoneOffset.UTC).toLocalDate()
        val start = day.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        busy = true
        scope.launch {
            val eventId = runCatching { client.eventAtTime(roomId, start) }
                .onFailure { CopyToast.show(L10n.format("room.jumpToDate.failed", it.message ?: it.toString())) }
                .getOrNull()
            busy = false
            if (eventId != null) {
                onDismiss()
                onJump(eventId)
            } else {
                CopyToast.show(L10n.format("room.jumpToDate.notFound"))
            }
        }
    }

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(::jump, enabled = !busy && state.selectedDateMillis != null) {
                Text(tr("room.jumpToDate.jump"), color = theme.accent)
            }
        },
        dismissButton = {
            TextButton(onDismiss) { Text(tr("common.cancel"), color = theme.textMuted) }
        },
        colors = colors,
    ) {
        DatePicker(state, colors = colors, title = null, showModeToggle = false)
    }
}
