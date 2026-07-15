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
