import Shell from 'gi://Shell';

const EFFECT_NAME = 'liquid-glass-blur';

function _setBlurAmount(effect, amount) {
    if (!effect)
        return;
    if (effect.sigma !== undefined)
        effect.sigma = amount;
    else if (effect.radius !== undefined)
        effect.radius = amount;
}

/**
 * Backdrop blur for an INNER clipped actor only.
 * Never attach this to the chrome root — BACKGROUND blur expands by
 * `sigma` pixels and, with brightness < 1, paints a dark halo around
 * the widget.
 */
export function applyBackgroundBlur(actor, { sigma = 20, brightness = 1.0 } = {}) {
    if (!actor)
        return null;

    let effect = null;
    try {
        effect = actor.get_effect(EFFECT_NAME);
    } catch (_) {
        effect = null;
    }

    if (sigma <= 0) {
        if (effect) {
            try { actor.remove_effect(effect); } catch (_) {}
        }
        return null;
    }

    if (!effect) {
        try {
            const params = { brightness: 1.0 };
            if (Shell.BlurMode !== undefined)
                params.mode = Shell.BlurMode.BACKGROUND;
            effect = new Shell.BlurEffect(params);
            _setBlurAmount(effect, sigma);
            actor.add_effect_with_name(EFFECT_NAME, effect);
        } catch (e) {
            logError(e, 'Widgets: liquid glass blur unavailable');
            return null;
        }
    } else {
        try {
            effect.brightness = 1.0;
            _setBlurAmount(effect, sigma);
        } catch (_) {}
    }

    return effect;
}

export function removeBackgroundBlur(actor) {
    if (!actor)
        return;
    try {
        const effect = actor.get_effect(EFFECT_NAME);
        if (effect)
            actor.remove_effect(effect);
    } catch (_) {}
}

/**
 * Translucent glass fill + top specular. Keep fill low so wallpaper
 * shows through; do not stack this on the same actor as BlurEffect.
 */
export function glassTintStyle(isDark, opacity, { playing = false } = {}) {
    const o = Math.max(0.12, Math.min(0.95, opacity ?? 0.55));

    if (!isDark) {
        const spec = Math.min(0.70, 0.35 + o * 0.30);
        const fill = Math.min(0.55, 0.28 + o * 0.28);
        return [
            'background-gradient-direction: vertical;',
            `background-gradient-start: rgba(255,255,255,${spec.toFixed(3)});`,
            `background-gradient-end: rgba(255,255,255,${fill.toFixed(3)});`,
        ].join(' ');
    }

    const spec = Math.min(0.22, 0.08 + o * 0.16);
    let fill = Math.min(0.38, 0.14 + o * 0.22);
    let endRgb = '16,18,24';
    if (playing) {
        fill = Math.min(0.42, fill + 0.06);
        endRgb = '28,18,40';
    }

    return [
        'background-gradient-direction: vertical;',
        `background-gradient-start: rgba(255,255,255,${spec.toFixed(3)});`,
        `background-gradient-end: rgba(${endRgb},${fill.toFixed(3)});`,
    ].join(' ');
}
