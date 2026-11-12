package org.wizardchat.android.ui.settings

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.view.Surface
import android.view.TextureView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlin.math.log10
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.rtc.CallSounds
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight

private val SOUND_TOGGLES = listOf(
    "mute", "deafen", "camera", "screenshare", "join", "leave",
    "ringtone", "ringback", "callEnded", "raiseHand", "reaction", "watchTogether",
)

@Composable
internal fun VoiceVideoSettings(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val calls = CallManager.shared
    val defaults = remember { context.getSharedPreferences("calls", Context.MODE_PRIVATE) }
    var outputDevice by remember { mutableStateOf(defaults.getInt("voice.outputDevice", -1)) }
    var outputVolume by remember { mutableFloatStateOf(defaults.getFloat("voice.outputVolume", 1f)) }
    var cameraPosition by remember { mutableStateOf(defaults.getString("voice.cameraPosition", "front") ?: "front") }
    var previewing by remember { mutableStateOf(false) }
    var sounds by remember { mutableStateOf(SOUND_TOGGLES.associateWith(CallSounds::isOn)) }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) previewing = true
    }
    val outputs = remember { communicationDevices(context) }

    SettingsPage(tr("settings.voiceVideo.title"), onBack) {
        SettingsSection(tr("settings.voiceVideo.voice")) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PickerRow(
                    tr("call.outputDevice"),
                    outputDevice,
                    listOf(-1 to tr("call.systemDefault")) + outputs,
                    {
                        outputDevice = it
                        defaults.edit().putInt("voice.outputDevice", it).apply()
                        calls.applyAudioDevice()
                    },
                )
                SettingsDivider()
            }
            Column(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)) {
                Text(tr("call.outputVolume"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                Slider(
                    value = outputVolume,
                    onValueChange = { outputVolume = it },
                    onValueChangeFinished = { calls.setOutputVolume(outputVolume.toDouble()) },
                    colors = SliderDefaults.colors(
                        thumbColor = theme.accent,
                        activeTrackColor = theme.accent,
                        inactiveTrackColor = theme.fill,
                    ),
                )
            }
            SettingsDivider()
            MicTest()
        }
        SettingsSection(tr("settings.voiceVideo.inputMode")) {
            ToggleRow(
                tr("settings.keybinds.pushToTalk"),
                prefs.pushToTalk,
                {
                    prefs.pushToTalk = it
                    calls.applyMic()
                },
                note = tr("settings.voiceVideo.pushToTalkNote"),
            )
        }
        SettingsSection(tr("settings.voiceVideo.video")) {
            PickerRow(
                tr("call.camera"),
                cameraPosition,
                listOf("front" to tr("call.frontCamera"), "back" to tr("call.backCamera")),
                {
                    cameraPosition = it
                    defaults.edit().putString("voice.cameraPosition", it).apply()
                },
            )
            if (previewing) {
                CameraPreview(
                    cameraPosition == "back",
                    Modifier.padding(WZ.Space.space4).fillMaxWidth().aspectRatio(3f / 4f).clip(RoundedCornerShape(WZ.Radius.lg)),
                )
            }
            SettingsDivider()
            LabelButton(tr(if (previewing) "settings.voiceVideo.stopPreview" else "settings.voiceVideo.previewCamera"), "video-camera", modifier = Modifier.padding(WZ.Space.space4), primary = !previewing, onClick = {
                when {
                    previewing -> previewing = false
                    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED -> previewing = true
                    else -> cameraPermission.launch(Manifest.permission.CAMERA)
                }
            })
        }
        SettingsSection(tr("settings.voiceVideo.sounds")) {
            SOUND_TOGGLES.forEachIndexed { index, key ->
                if (index > 0) SettingsDivider()
                CheckRow(tr("settings.voiceVideo.sound.$key"), sounds[key] != false, { on ->
                    CallSounds.setOn(key, on)
                    sounds = sounds + (key to on)
                })
            }
        }
        SoundboardSettingsSection()
    }
}

@Composable
internal fun SoundboardSettingsSection() {
    var volume by remember { mutableFloatStateOf(Soundboard.volume) }
    SettingsSection(tr("settings.voiceVideo.soundboard.title")) {
        Column(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)) {
            Text(tr("settings.voiceVideo.soundboard.volume"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
            Slider(
                value = volume,
                onValueChange = { volume = it },
                onValueChangeFinished = { Soundboard.volume = volume },
                colors = SliderDefaults.colors(
                    thumbColor = theme.accent,
                    activeTrackColor = theme.accent,
                    inactiveTrackColor = theme.fill,
                ),
            )
        }
    }
}

private fun communicationDevices(context: Context): List<Pair<Int, String>> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptyList()
    val manager = context.getSystemService(AudioManager::class.java) ?: return emptyList()
    return manager.availableCommunicationDevices.map { it.id to it.productName.toString() }
}

@Composable
private fun MicTest() {
    val context = LocalContext.current
    val calls = CallManager.shared
    var testing by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var level by remember { mutableFloatStateOf(0f) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        failed = !granted
        testing = granted
    }

    LaunchedEffect(testing) {
        if (!testing) return@LaunchedEffect
        calls.setMicTesting(true)
        try {
            withContext(Dispatchers.IO) { measure { level = it } }
        } catch (_: Exception) {
            failed = true
        } finally {
            calls.setMicTesting(false)
            level = 0f
            testing = false
        }
    }

    Column(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)) {
        Text(tr("settings.voiceVideo.inputLevel"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
        Box(Modifier.padding(vertical = WZ.Space.space3).fillMaxWidth().height(WZ.Space.space3).clip(CircleShape).background(theme.fill)) {
            Box(Modifier.fillMaxWidth(level).height(WZ.Space.space3).clip(CircleShape).background(theme.success))
        }
        LabelButton(tr(if (testing) "settings.voiceVideo.stopTest" else "settings.voiceVideo.startTest"), "microphone", primary = !testing, onClick = {
            when {
                testing -> testing = false
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> {
                    failed = false
                    testing = true
                }
                else -> permission.launch(Manifest.permission.RECORD_AUDIO)
            }
        })
        Text(
            tr(if (failed) "settings.voiceVideo.testFailed" else "settings.voiceVideo.testNote"),
            style = wizardFont(WZ.FontSize.sm),
            color = if (failed) theme.danger else theme.textMuted,
        )
    }
}

@SuppressLint("MissingPermission")
private suspend fun measure(onLevel: (Float) -> Unit) {
    val rate = 16_000
    val size = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(1024)
    val record = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
    val buffer = ShortArray(size / 2)
    try {
        record.startRecording()
        while (kotlin.coroutines.coroutineContext.isActive) {
            val read = record.read(buffer, 0, buffer.size)
            if (read <= 0) continue
            var sum = 0.0
            for (i in 0 until read) sum += buffer[i] * buffer[i].toDouble()
            val rms = sqrt(sum / read) / Short.MAX_VALUE
            val db = 20 * log10(rms.coerceAtLeast(1e-5))
            onLevel(((db + 50) / 50).toFloat().coerceIn(0f, 1f))
        }
    } finally {
        record.stop()
        record.release()
    }
}

@Composable
private fun CameraPreview(back: Boolean, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var view by remember { mutableStateOf<TextureView?>(null) }
    AndroidView(factory = { TextureView(it).also { texture -> view = texture } }, modifier = modifier)
    val texture = view ?: return
    DisposableEffect(texture, back) {
        val manager = context.getSystemService(CameraManager::class.java)
        val facing = if (back) CameraCharacteristics.LENS_FACING_BACK else CameraCharacteristics.LENS_FACING_FRONT
        val id = manager?.cameraIdList?.firstOrNull { manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == facing }
        var camera: CameraDevice? = null
        var closed = false

        @SuppressLint("MissingPermission")
        fun open(surfaceTexture: SurfaceTexture) {
            if (manager == null || id == null) return
            manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    if (closed) return device.close()
                    camera = device
                    surfaceTexture.setDefaultBufferSize(1280, 720)
                    val surface = Surface(surfaceTexture)
                    val request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(surface) }
                    @Suppress("DEPRECATION")
                    device.createCaptureSession(listOf(surface), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(session: CameraCaptureSession) {
                            if (!closed) runCatching { session.setRepeatingRequest(request.build(), null, null) }
                        }
                        override fun onConfigureFailed(session: CameraCaptureSession) {}
                    }, null)
                }
                override fun onDisconnected(device: CameraDevice) = device.close()
                override fun onError(device: CameraDevice, error: Int) = device.close()
            }, null)
        }

        texture.surfaceTexture?.let(::open) ?: run {
            texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) = open(surface)
                override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
                override fun onSurfaceTextureDestroyed(surface: SurfaceTexture) = true
                override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
            }
        }
        onDispose {
            closed = true
            camera?.close()
        }
    }
}
