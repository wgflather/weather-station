// Shared sun-altitude → color model. Single source of truth for the live
// page background (fetch-data.js) and anything else that wants to render
// "the color of the sky right now" — e.g. the sun modal chart's curve.
//
// Anchor table: each row defines, for a given sun altitude (degrees), the
// top/bottom sky gradient colors plus the card surface and accent (border +
// divider) colors. Callers linearly interpolate between bracketing anchors.
//
// Symmetric in altitude — dawn and dusk render identically because they hit
// the same altitude values on the way up vs the way down.
export const SKY_ANCHORS = [
    // alt   sky top              sky bottom            card bg (used for modal --card-bg-strong)
    //                                                                        card accent          sky-rgb (ambient glow / accent tint)
    { alt: -18, top: [  8,  13,  26], bottom: [ 19,  26,  46], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [ 90, 110, 200] },  // astronomical night
    { alt: -12, top: [ 14,  26,  54], bottom: [ 29,  42,  82], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [ 90, 120, 215] },  // nautical twilight
    { alt:  -6, top: [ 29,  38,  73], bottom: [ 61,  58, 110], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [105, 100, 210] },  // civil twilight
    { alt:  -1, top: [ 42,  59, 106], bottom: [196, 122,  82], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [255, 150,  90] },  // horizon (rise/set)
    { alt:   5, top: [ 62,  90, 142], bottom: [232, 160, 106], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [255, 165,  80] },  // golden hour
    { alt:  15, top: [ 38,  85, 155], bottom: [100, 160, 200], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [120, 190, 255] },  // morning / late afternoon
    { alt:  30, top: [ 25,  95, 175], bottom: [ 80, 160, 205], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [100, 180, 255] },  // mid-day blue
    { alt:  50, top: [ 22,  90, 170], bottom: [ 65, 145, 210], cardBg: [18, 24, 52], cardAcc: [255, 255, 255], skyRgb: [ 80, 165, 245] },  // bright midday
];

function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
}

export function lerpTriplet(a, b, t) {
    return [lerpChannel(a[0], b[0], t), lerpChannel(a[1], b[1], t), lerpChannel(a[2], b[2], t)];
}

// Smoothstep with the input clamped to [0,1] — eases both ends so ramps
// driven by altitude never snap at their boundaries.
export function smoothstep01(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
}

// Shifts a color toward its own perceptual luminance (neutral grey), reducing
// saturation without changing perceived brightness. ratio=0: unchanged;
// ratio=1: fully grey.
export function desaturateColor([r, g, b], ratio) {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [
        Math.round(r + (luma - r) * ratio),
        Math.round(g + (luma - g) * ratio),
        Math.round(b + (luma - b) * ratio),
    ];
}

// Normalized sky brightness from sun altitude: 0 = night, 0.5 = twilight,
// 1 = bright daytime. Smoothstepped so adaptations ease in rather than
// snapping. Mirrors the perceptual reality that the moon only washes out
// once the sun is genuinely up — civil twilight and below read dark.
export function skyBrightnessForAltitude(altitudeDeg) {
    if (altitudeDeg == null) return 0;
    if (altitudeDeg <= -6) return 0;            // civil twilight and below: dark
    if (altitudeDeg >= 12) return 1;            // sun well up: full daylight
    if (altitudeDeg <= 0) return 0.5 * smoothstep01((altitudeDeg + 6) / 6);  // -6°→0° : 0 → 0.5
    return 0.5 + 0.5 * smoothstep01(altitudeDeg / 12);                       // 0°→12° : 0.5 → 1
}

// ==========================================
// APPARENT SUN COLOUR
// ==========================================

// Apparent color of the solar disk itself (not the sky around it) as seen
// through the atmosphere at a given altitude: deep red-orange low on the
// horizon, where the light path through the atmosphere is longest and blue
// wavelengths scatter out, warming to near-white overhead.
const SUN_DISK_ANCHORS = [
    { alt: -10, rgb: [140,  45,  20] },
    { alt:  -1, rgb: [220,  70,  25] },
    { alt:   3, rgb: [255, 110,  40] },
    { alt:  10, rgb: [255, 165,  80] },
    { alt:  20, rgb: [255, 205, 130] },
    { alt:  40, rgb: [255, 240, 210] },
    { alt:  60, rgb: [255, 250, 240] },
];

// Base tint of the solar body before atmosphere: never pure #fff, so every
// altitude still reads as the same physical object.
const SUN_IVORY = [255, 253, 246];

export function sunDiskColorAt(altDeg) {
    const first = SUN_DISK_ANCHORS[0];
    const last  = SUN_DISK_ANCHORS[SUN_DISK_ANCHORS.length - 1];
    if (altDeg == null || altDeg <= first.alt) return first.rgb.slice();
    if (altDeg >= last.alt) return last.rgb.slice();
    for (let i = 0; i < SUN_DISK_ANCHORS.length - 1; i++) {
        const lo = SUN_DISK_ANCHORS[i];
        const hi = SUN_DISK_ANCHORS[i + 1];
        if (altDeg >= lo.alt && altDeg <= hi.alt) {
            return lerpTriplet(lo.rgb, hi.rgb, (altDeg - lo.alt) / (hi.alt - lo.alt));
        }
    }
    return last.rgb.slice();
}

/**
 * Full layered appearance of the "now" sun marker at a given altitude —
 * shared by the sun card (CSS custom properties on a div) and the sun modal
 * chart (SVG gradient stops), so both render the same object.
 *
 * The atmospheric colour is *spatially distributed* rather than applied as
 * one tint over the whole marker — that separation is what makes it read as
 * a luminous body seen through air instead of a coloured dot. Each layer
 * mixes SUN_IVORY toward the apparent atmospheric colour by its own amount,
 * always increasing outward:
 *
 *   centre/core  — least tinted; stays predominantly ivory at every altitude
 *   inner halo   — moderately tinted; where the scattering first shows
 *   outer bloom  — most tinted; carries the strongest atmospheric colour
 *
 * `warmth` (0 high → 1 at the horizon) drives all three continuously, so
 * hue, saturation and intensity evolve smoothly with no discrete steps. The
 * core rides a gentler curve (warmth^1.6) so it lags behind the halo and a
 * bright pale centre survives even against an orange-red bloom.
 *
 * Below the horizon the tint stops deepening — instead `lum` scales every
 * layer's RGB toward black, so a set sun dims to a dark warm ember rather
 * than blending into the card and reading grey.
 */
export function sunAppearanceAt(altitude) {
    const rgb    = sunDiskColorAt(altitude);
    const warmth = 1 - smoothstep01((altitude - 2) / 48);   // 1 at ≤2°, 0 at ≥50°
    const sphere = smoothstep01((altitude - 2) / 18);       // volumetric only when high
    const lum    = 0.5 + 0.5 * smoothstep01((altitude + 9) / 9);  // dim below horizon

    // Per-layer tint fractions — strictly increasing outward.
    const coreMix  = 0.04 + 0.30 * Math.pow(warmth, 1.6);   // 0.04 → 0.34
    const haloMix  = 0.12 + 0.70 * warmth;                  // 0.12 → 0.82
    const bloomMix = 0.18 + 0.80 * warmth;                  // 0.18 → 0.98

    const dim = (c) => c.map((v) => Math.round(v * lum));
    const glowLum = 0.55 + 0.45 * lum;

    return {
        centre: dim(lerpTriplet(SUN_IVORY, rgb, coreMix * 0.45)),
        core:   dim(lerpTriplet(SUN_IVORY, rgb, coreMix)),
        halo:   dim(lerpTriplet(SUN_IVORY, rgb, haloMix)),
        bloom:  dim(lerpTriplet(SUN_IVORY, rgb, bloomMix)),
        edgeAlpha:      0.30 + 0.68 * sphere,
        edgeStopPct:    64 + 28 * sphere,
        highlightAlpha: 0.03 + 0.42 * sphere,
        glowInnerAlpha: (0.42 + 0.20 * warmth) * glowLum,
        glowMidAlpha:   (0.20 + 0.16 * warmth) * glowLum,
        glowOuterAlpha: (0.07 + 0.10 * warmth) * glowLum,
        spikeAlpha:     0.10 + 0.26 * sphere,
    };
}

/**
 * Colour for a fixed event marker (sunrise / sunset / solar noon) plotted at
 * `altitude`: the sun's own apparent colour at that moment, desaturated and
 * darkened. They are reference points on the curve, not the live reading, so
 * they stay quiet — the full-saturation sun is reserved for the "now"
 * marker. Rendered as one flat colour across the whole dot (no ring), so the
 * darkening is capped: pushed much further the dots read as hollow holes,
 * and the top end has to stay clearly below the white curve they sit on.
 */
export function sunEventMarkerColor(altitude) {
    // Heavy desaturation: rise/set are always plotted at altitude 0, where the
    // sun's true colour is a saturated terracotta. Left near full saturation
    // that dot reads as a foreign warm accent on the cool and dark card
    // states, since the marker colour tracks the event's altitude and not the
    // sky currently behind it. Pulling most of the chroma out keeps a hint of
    // the sun's hue while letting the dot sit in any background.
    const muted = desaturateColor(sunDiskColorAt(altitude), 0.85).map((v) => v * 0.95);

    // A high sun's apparent colour is nearly white, and these dots sit
    // directly on the white curve — without this cap the solar-noon marker
    // washes out completely on a summer day. Only the bright end is pulled
    // down; warm low-sun colours are already well under it.
    const LUMA_CAP = 170;
    const luma = 0.2126 * muted[0] + 0.7152 * muted[1] + 0.0722 * muted[2];
    const k = luma > LUMA_CAP ? LUMA_CAP / luma : 1;

    const [r, g, b] = muted.map((v) => Math.round(v * k));
    return `rgb(${r}, ${g}, ${b})`;
}

// Interpolated bottom-of-sky RGB at a given altitude — the live background hue
// visible near the horizon. Used to tint anything that should track the real
// sky regardless of the page's dynamic/static background preference (the moon
// disc's daylight wash, the sun modal chart's curve).
export function skyBottomRgbAt(altitudeDeg) {
    if (altitudeDeg == null) return null;
    const first = SKY_ANCHORS[0];
    const last  = SKY_ANCHORS[SKY_ANCHORS.length - 1];
    if (altitudeDeg <= first.alt) return first.bottom.slice();
    if (altitudeDeg >= last.alt)  return last.bottom.slice();
    for (let i = 0; i < SKY_ANCHORS.length - 1; i++) {
        const lo = SKY_ANCHORS[i];
        const hi = SKY_ANCHORS[i + 1];
        if (altitudeDeg >= lo.alt && altitudeDeg <= hi.alt) {
            const t = (altitudeDeg - lo.alt) / (hi.alt - lo.alt);
            return lerpTriplet(lo.bottom, hi.bottom, t);
        }
    }
    return last.bottom.slice();
}
