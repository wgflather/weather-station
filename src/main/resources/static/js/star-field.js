// Mulberry32 PRNG — deterministic star layout across every load.
function createRng(seed) {
    return function () {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ==========================================
// STAR DATA — generated once, reused for every canvas redraw
// ==========================================

const BG_COUNT = 140;
const HL_COUNT = 11;

let bgStars = null;
let hlStars = null;

function generateStars() {
    const rng = createRng(0xCAFEBABE);

    bgStars = [];
    for (let i = 0; i < BG_COUNT; i++) {
        // Power-curve bias toward small stars (more realistic distribution)
        const rNorm = rng();
        bgStars.push({
            x:           rng(),
            y:           rng(),
            r:           0.4 + Math.pow(rNorm, 2.2) * 2.0,  // 0.4–2.4px, skewed small
            baseOpacity: 0.24 + rng() * 0.76,               // 0.24–1.0, slightly lifted floor
        });
    }

    hlStars = [];
    for (let i = 0; i < HL_COUNT; i++) {
        hlStars.push({
            x:            rng(),
            y:            rng(),
            r:            1.8 + rng() * 2.4,       // 1.8–4.2px
            animDuration: 3.5 + rng() * 5.5,       // 3.5–9s
            animDelay:    rng() * 13.0,             // 0–13s start offset (negative → mid-cycle)
        });
    }
}

// ==========================================
// CANVAS DRAWING
// ==========================================

function drawSoftStar(ctx, x, y, r, opacity) {
    // Outer bloom — large, faint radial glow
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, r * 5.5);
    bloom.addColorStop(0, `rgba(215, 230, 255, ${(opacity * 0.17).toFixed(3)})`);
    bloom.addColorStop(1, 'rgba(215, 230, 255, 0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(x, y, r * 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft defocused core — slightly blue-white, fades to transparent
    const core = ctx.createRadialGradient(x, y, 0, x, y, r * 2.0);
    core.addColorStop(0,    `rgba(248, 252, 255, ${opacity.toFixed(3)})`);
    core.addColorStop(0.45, `rgba(228, 242, 255, ${(opacity * 0.62).toFixed(3)})`);
    core.addColorStop(1,   'rgba(200, 225, 255, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
    ctx.fill();
}

function drawStarsOnCanvas(canvas) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !bgStars) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    for (const star of bgStars) {
        drawSoftStar(ctx, star.x * w, star.y * h, star.r, star.baseOpacity);
    }
}

// ==========================================
// HIGHLIGHT STARS — CSS-animated DOM elements
// ==========================================

function buildHighlightStars(container) {
    container.innerHTML = '';
    for (const star of hlStars) {
        const el = document.createElement('div');
        el.className = 'star-hl';
        const size = (star.r * 2).toFixed(1);
        el.style.cssText = [
            `left:${(star.x * 100).toFixed(2)}%`,
            `top:${(star.y * 100).toFixed(2)}%`,
            `width:${size}px`,
            `height:${size}px`,
            `--star-duration:${star.animDuration.toFixed(1)}s`,
            `--star-delay:-${star.animDelay.toFixed(1)}s`,
        ].join(';');
        container.appendChild(el);
    }
}

// ==========================================
// OPACITY — sun altitude → star visibility
// ==========================================

// Star visibility ramp. The fade begins at -4° (a few bright stars become
// visible near the end of civil twilight) rather than exactly -6°, so that
// the "Twilight" static preset (-6°) shows a handful of faint stars instead
// of none. The "Because background stars have base opacities 0.24–1.0, the
// global opacity multiplication naturally tiers density: at ~5% only the
// brightest handful show; at 60% roughly half the field; at 100% all stars.
//
//   > -4°:          0      — full daylight
//   -4° → -12°:  0 → 0.22  — first stars emerging through civil twilight
//  -12° → -18°:  0.22 → 0.62  — nautical twilight, half the field visible
//       < -18°:  0.62 → 1.00  — astronomical night, full density at ~-27°
function altToStarOpacity(alt) {
    if (alt == null || alt > -4)  return 0;
    if (alt >= -12) return ((-alt - 4)  / 8) * 0.22;
    if (alt >= -18) return 0.22 + ((-alt - 12) / 6) * 0.40;
    return 0.62 + Math.min(1, (-alt - 18) / 9) * 0.38;
}

// ==========================================
// MODULE STATE
// ==========================================

let _container  = null;
let _canvas     = null;
let _baseOpacity = 0;
let _dimmed     = false;
let _resizeTimer = null;

function applyOpacity() {
    if (!_container) return;
    const effective = _baseOpacity * (_dimmed ? 0.22 : 1.0);
    _container.style.opacity = effective.toFixed(4);
}

// ==========================================
// PUBLIC API
// ==========================================

export function initStarField() {
    generateStars();

    _container = document.createElement('div');
    _container.id = 'star-field';
    _container.setAttribute('aria-hidden', 'true');

    _canvas = document.createElement('canvas');
    _canvas.id = 'star-canvas';

    const highlights = document.createElement('div');
    highlights.id = 'star-highlights';

    _container.appendChild(_canvas);
    _container.appendChild(highlights);

    // Prepend so it paints under all dashboard content (same z-level, earlier in DOM).
    document.body.prepend(_container);

    buildHighlightStars(highlights);

    // ResizeObserver fires once immediately with initial dimensions, then on every resize.
    const obs = new ResizeObserver(() => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => drawStarsOnCanvas(_canvas), 120);
    });
    obs.observe(_canvas);
}

// Called on every astronomy poll tick (~30 s). Sun altitude drives visibility.
export function updateStarField(sunAltDeg) {
    if (!_container) return;
    const cloudCover = window.getCurrentCloudCover?.() ?? 0;
    const cloudMul   = 1 - (cloudCover / 100) * 0.85;
    _baseOpacity     = altToStarOpacity(sunAltDeg) * cloudMul;
    applyOpacity();
}

// Call when any modal opens / closes to dim stars behind the overlay.
// Uses an instant transition so the modal feel isn't delayed.
export function setStarFieldModalDim(dimmed) {
    if (!_container) return;
    _dimmed = dimmed;
    // Bypass the slow sky-transition for instant modal feedback.
    _container.style.transition = 'none';
    applyOpacity();
    void _container.offsetWidth;
    _container.style.transition = '';
}
