package org.wizardchat.android.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role

/** Material 3 Expressive press feedback: the control squishes in on press and springs back */
@Composable
fun Modifier.expressiveClickable(onClick: () -> Unit, role: Role = Role.Button, pressedScale: Float = 0.9f): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) pressedScale else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }.clickable(interaction, ripple(), role = role, onClick = onClick)
}

/** Round when off, a rounded square when on, morphing between the two like Expressive toggle buttons */
@Composable
fun rememberMorphShape(active: Boolean): RoundedCornerShape {
    val percent by animateIntAsState(
        if (active) 30 else 50,
        spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "morph",
    )
    return RoundedCornerShape(percent)
}
