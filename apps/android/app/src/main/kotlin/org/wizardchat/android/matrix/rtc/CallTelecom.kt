package org.wizardchat.android.matrix.rtc

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallsManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import org.wizardchat.android.WizardApplication

object CallTelecom {
    private const val TAG = "WZCALL"
    private val ROUTE_ORDER = listOf(
        CallEndpointCompat.TYPE_BLUETOOTH,
        CallEndpointCompat.TYPE_WIRED_HEADSET,
        CallEndpointCompat.TYPE_SPEAKER,
        CallEndpointCompat.TYPE_EARPIECE,
    )
    private val context get() = WizardApplication.instance
    private val scope = MainScope() + CoroutineExceptionHandler { _, error -> Log.w(TAG, "telecom failed", error) }
    private val manager by lazy { CallsManager(context) }
    private var registered = false
    private class Call(var key: String, var onDisconnect: () -> Unit) {
        var control: CallControlScope? = null
        var job: Job? = null
        var active = false
        var endpoints: List<CallEndpointCompat> = emptyList()
    }

    private var call: Call? = null

    fun isCall(key: String): Boolean = call?.key == key

    fun incoming(key: String, roomId: String, name: String, video: Boolean, onAnswer: () -> Unit, onReject: () -> Unit) =
        add(key, roomId, name, CallAttributesCompat.DIRECTION_INCOMING, video, onAnswer, onReject)

    fun outgoing(key: String, roomId: String, name: String, video: Boolean, onEnd: () -> Unit) =
        add(key, roomId, name, CallAttributesCompat.DIRECTION_OUTGOING, video, {}, onEnd)

    /** A newer ring of the same call replaced [from] */
    fun rekey(from: String, to: String) {
        call?.takeIf { it.key == from }?.key = to
    }

    /** The ring [ringKey] was answered in the app: it becomes the joined call [joinedKey] */
    fun answered(ringKey: String, joinedKey: String, video: Boolean, onEnd: () -> Unit) {
        val call = call?.takeIf { it.key == ringKey } ?: return
        call.key = joinedKey
        call.onDisconnect = onEnd
        val control = call.control ?: return
        scope.launch { control.answer(callType(video)) }
    }

    fun active(key: String) {
        val call = call?.takeIf { it.key == key } ?: return
        val control = call.control ?: return
        call.active = true
        scope.launch { control.setActive() }
        route(call)
    }

    fun reroute() {
        call?.takeIf { it.active }?.let(::route)
    }

    private fun route(call: Call) {
        val control = call.control ?: return
        val order = pickedEndpointType().let { picked -> if (picked == null) ROUTE_ORDER else listOf(picked) + (ROUTE_ORDER - picked) }
        val wanted = order.firstNotNullOfOrNull { type -> call.endpoints.firstOrNull { it.type == type } } ?: return
        scope.launch { control.requestEndpointChange(wanted) }
    }

    private fun pickedEndpointType(): Int? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val id = context.getSharedPreferences("calls", Context.MODE_PRIVATE).getInt("voice.outputDevice", -1)
        if (id == -1) return null
        val device = context.getSystemService(AudioManager::class.java)?.availableCommunicationDevices?.firstOrNull { it.id == id }
        return when (device?.type) {
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> CallEndpointCompat.TYPE_EARPIECE
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> CallEndpointCompat.TYPE_SPEAKER
            AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET ->
                CallEndpointCompat.TYPE_WIRED_HEADSET
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> CallEndpointCompat.TYPE_BLUETOOTH
            else -> null
        }
    }

    fun end(key: String? = null, cause: Int = DisconnectCause.LOCAL) {
        val call = call ?: return
        if (key != null && call.key != key) return
        this.call = null
        val control = call.control
        if (control != null) {
            scope.launch {
                runCatching { control.disconnect(DisconnectCause(cause)) }
                call.job?.cancel()
            }
        } else {
            call.job?.cancel()
        }
    }

    @SuppressLint("MissingPermission")
    private fun register(): Boolean {
        if (registered) return true
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.MANAGE_OWN_CALLS) != PackageManager.PERMISSION_GRANTED) {
            return false
        }
        registered = runCatching {
            manager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE or CallsManager.CAPABILITY_SUPPORTS_VIDEO_CALLING)
        }.onFailure { Log.w(TAG, "couldn't register with telecom", it) }.isSuccess
        return registered
    }

    private fun callType(video: Boolean) =
        if (video) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL

    @SuppressLint("MissingPermission")
    private fun add(
        key: String,
        roomId: String,
        name: String,
        direction: Int,
        video: Boolean,
        onAnswer: () -> Unit,
        onDisconnect: () -> Unit,
    ) {
        if (!register()) return
        end()
        val call = Call(key, onDisconnect)
        this.call = call
        // Android 8 and 9 only take sip: addresses
        val attributes = CallAttributesCompat(name, Uri.fromParts("sip", roomId, null), direction, callType(video))
        call.job = scope.launch {
            try {
                manager.addCall(
                    attributes,
                    onAnswer = { if (this@CallTelecom.call === call) onAnswer() },
                    onDisconnect = {
                        if (this@CallTelecom.call === call) {
                            this@CallTelecom.call = null
                            call.onDisconnect()
                        }
                    },
                    onSetActive = {},
                    onSetInactive = {},
                ) {
                    call.control = this
                    launch {
                        availableEndpoints.collect { endpoints ->
                            call.endpoints = endpoints
                            if (call.active) route(call)
                        }
                    }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w(TAG, "telecom refused the call", error)
                if (this@CallTelecom.call === call) this@CallTelecom.call = null
            }
        }
    }
}
