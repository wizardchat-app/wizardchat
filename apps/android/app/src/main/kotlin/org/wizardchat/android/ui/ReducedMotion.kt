package org.wizardchat.android.ui

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.platform.compositionContext
import androidx.compose.ui.platform.createLifecycleAwareWindowRecomposer
import org.wizardchat.android.WizardApplication

fun ComponentActivity.followReducedMotion() {
    val view = window.decorView
    view.compositionContext = view.createLifecycleAwareWindowRecomposer(AppMotionScale, lifecycle)
}

private object AppMotionScale : MotionDurationScale {
    private val resolver = WizardApplication.instance.contentResolver
    private var systemScale = readSystemScale()

    init {
        resolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    systemScale = readSystemScale()
                }
            },
        )
    }

    private fun readSystemScale() = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)

    override val scaleFactor: Float
        get() = when {
            WizardApplication.instance.prefs.reducesMotion(systemScale == 0f) -> 0f
            systemScale > 0f -> systemScale
            else -> 1f
        }
}
