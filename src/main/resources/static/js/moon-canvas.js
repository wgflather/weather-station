// Canvas-based 3D moon renderer.
// Renders a photorealistic lunar phase with a procedural surface (mare + craters)
// and an accurate terminator that rotates by the observer's parallactic angle.
// Place moon-texture.webp (preferred) or moon-texture.png at /img/; procedural
// sphere is the fallback if neither loads.

// Full-resolution ImageData of the texture (2048×1024) extracted once at load time
// and sampled pixel-by-pixel during sphere projection via software bilinear.
//
// Why no mip pyramid: pre-downscaled mips (e.g. 2048→1024 via ctx.drawImage) apply
// the browser's smoothing kernel, then _sphereProject applies bilinear on top.
// Double-smoothing makes the disc look soft even at near-1:1 sampling ratios —
// this was the root cause of softness at DPR<3 (which selected the 1024 mip) vs
// sharpness at DPR≥3 (which selected the unmodified 2048 mip).
// Always sampling the raw 2048 source avoids pre-blurring. The disc diameters used
// in this app (140px card, 84px modal) hit at most 2.5:1 bilinear downsampling at
// their lowest DPR, which is visually cleaner than a pre-blurred 1:1 mip.
let _texMips = null;

function _loadTexture(src) {
    const img = new Image();
    img.onload = () => {
        const W = 2048, H = 1024;
        const c   = document.createElement('canvas');
        c.width   = W;
        c.height  = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, W, H);
        const id  = ctx.getImageData(0, 0, W, H);
        // Pre-sharpen the texture once so bilinear oversampling at lower DPRs
        // (e.g. DPR=2.5 where ~2 texels average per output pixel) doesn't
        // produce a visibly soft disc compared to higher-DPR views.
        _texMips = [{ data: _sharpenTexture(id.data, W, H, 0.38), w: W, h: H }];
    };
    img.onerror = () => {
        if (src.endsWith('.webp')) _loadTexture('/img/moon-texture.png');
    };
    img.src = src;
}

// One-time unsharp-mask pass on the equirectangular texture.
// Kernel: center*(1+a) − each of 4 neighbours*(a/4). Sums to 1 — no brightness shift.
// Wraps horizontally (equirectangular seam), clamps vertically (poles).
function _sharpenTexture(src, w, h, amount) {
    const dst = new Uint8ClampedArray(src.length);
    const cw  = 1 + amount;
    const nw  = amount * 0.25;
    for (let y = 0; y < h; y++) {
        const yn = Math.max(0, y - 1);
        const yp = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
            const xn = (x - 1 + w) % w;
            const xp = (x + 1)     % w;
            const ic = (y  * w + x)  * 4;
            const il = (y  * w + xn) * 4;
            const ir = (y  * w + xp) * 4;
            const it = (yn * w + x)  * 4;
            const ib = (yp * w + x)  * 4;
            dst[ic    ] = Math.min(255, Math.max(0, cw*src[ic  ] - nw*(src[il  ]+src[ir  ]+src[it  ]+src[ib  ])));
            dst[ic + 1] = Math.min(255, Math.max(0, cw*src[ic+1] - nw*(src[il+1]+src[ir+1]+src[it+1]+src[ib+1])));
            dst[ic + 2] = Math.min(255, Math.max(0, cw*src[ic+2] - nw*(src[il+2]+src[ir+2]+src[it+2]+src[ib+2])));
            dst[ic + 3] = src[ic + 3];
        }
    }
    return dst;
}
_loadTexture('/img/moon-texture.webp');

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Render the moon on canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} phaseDeg   0–360 (0=new moon, 90=first quarter, 180=full, 270=last quarter)
 * @param {number} parallacticAngle  rotation in degrees; tilts the terminator for observer latitude
 * @param {object} [ambient]  sky adaptation. Leaves the moon astronomically unchanged but
 *                            modulates its *appearance* to match the surrounding sky:
 *                            `{ brightness: 0..1, skyTint: [r,g,b] }`. brightness 0 = night
 *                            (crisp, full detail/glow — the default), 0.5 = twilight,
 *                            1 = bright daytime (low contrast, pale blue-grey, faint halo).
 *                            skyTint is the current sky colour the lit disc is nudged toward.
 */
export function drawMoon(canvas, phaseDeg, parallacticAngle = 0, ambient = null) {
    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth  || 64;
    const cssH = canvas.offsetHeight || 64;
    const bufW = Math.round(cssW * dpr);
    const bufH = Math.round(cssH * dpr);

    if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width  = bufW;
        canvas.height = bufH;
    }

    const brightness = Math.max(0, Math.min(1, ambient?.brightness ?? 0));

    // The atmospheric halo is part of the appearance, not the geometry — fade it
    // with sky brightness so the daytime moon never looks self-illuminated, while
    // the night moon keeps a tight corona.
    //
    // Drive the glow through CSS custom properties read by the wrapper's ::before
    // pseudo-element (a box-shadow corona behind the disc) — NOT via a `filter` on
    // the canvas or any ancestor. A CSS filter forces the browser to rasterize the
    // filtered element's whole subtree (the canvas) into an intermediate buffer
    // whose resolution tracks page zoom; at 100% zoom that buffer is coarser than
    // the canvas's own backing store, so the sharp disc gets resampled down and
    // looks soft, while 200% zoom (a denser buffer) stays crisp. Keeping the canvas
    // out of every filtered subtree makes it composite 1:1 at all zoom levels.
    const wrap = canvas.closest('.moon-disk-wrapper');
    if (wrap) {
        const k = 1 - 0.78 * brightness;
        wrap.style.setProperty('--moon-glow-a1', (0.20  * k).toFixed(3));
        wrap.style.setProperty('--moon-glow-a2', (0.085 * k).toFixed(3));
        wrap.style.setProperty('--moon-glow-a3', (0.03  * k).toFixed(3));
    }

    const ctx = canvas.getContext('2d');

    if (_texMips) {
        // Sharpness: render the lit sphere straight into an ImageData the exact
        // size of the canvas backing store (integer device pixels) and blit it 1:1
        // with putImageData. There is NO CSS-unit transform, NO drawImage rescale
        // and NO fractional destination rect, so the disc is pixel-perfect at every
        // devicePixelRatio (1x / 1.5x / 2x / 3x) and at 100% browser zoom — the case
        // where the previous downscale-on-draw looked soft and pixelated. Parallactic
        // rotation is baked into the per-pixel sampling and the limb is analytically
        // feathered, so neither a canvas transform nor a separate AA pass is needed.
        ctx.putImageData(
            _sphereProject(bufW, bufH, phaseDeg, parallacticAngle, brightness, ambient?.skyTint),
            0, 0,
        );
    } else {
        // Procedural fallback (texture not yet loaded): vector drawing needs the
        // dpr transform to stay crisp.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        _renderProcedural(ctx, cssW, cssH, phaseDeg, parallacticAngle, brightness, ambient?.skyTint);
    }
}

// ==========================================
// SHARED HELPERS
// ==========================================

// Milky "haze" the lit disc is nudged toward in daylight. It IS the live sky
// colour, only modestly lightened toward white — so the moon ends up just a touch
// brighter than the sky around it (low contrast, embedded) while keeping the sky's
// blue/grey hue. Only consumed when brightness > 0.
function _hazeFromSky(skyTint) {
    const tint = skyTint ?? [120, 150, 190];
    return [
        Math.round(tint[0] + (255 - tint[0]) * 0.28),
        Math.round(tint[1] + (255 - tint[1]) * 0.28),
        Math.round(tint[2] + (255 - tint[2]) * 0.28),
    ];
}

// Hermite smoothstep with explicit edges.
function _smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

// ==========================================
// PROCEDURAL FALLBACK RENDER
// (used only until the texture PNG has loaded)
// ==========================================

function _renderProcedural(ctx, W, H, phaseDeg, parallacticAngle, brightness, skyTint) {
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) * 0.46;
    const haze = _hazeFromSky(skyTint);

    // Rotate the whole moon by the parallactic angle so the terminator tilts
    // correctly for the observer's latitude and the moon's position in the sky.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-parallacticAngle * Math.PI / 180);
    ctx.translate(-cx, -cy);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    _drawProceduralSurface(ctx, cx, cy, r);
    _drawTerminator(ctx, cx, cy, r, phaseDeg);

    const vignette = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r * 1.01);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Daylight wash: a translucent haze veil flattens contrast and tints the disc
    // toward the sky. Mirrors the per-pixel treatment of the texture path.
    if (brightness > 0) {
        ctx.fillStyle = `rgba(${haze[0]},${haze[1]},${haze[2]},${(0.52 * brightness).toFixed(3)})`;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
}

// ==========================================
// SPHERICAL TEXTURE PROJECTION
//
// For each pixel on the output disk we compute its selenographic coordinates
// using an orthographic (parallel) projection — the same projection the eye
// uses when looking at the moon from Earth — then sample the equirectangular
// texture at those coordinates.
//
// Coordinate system (selenographic / IAU):
//   longitude 0°  = center of near side (Sinus Medii)
//   longitude +90° = east limb (rising limb for waxing phases, right edge of disk)
//   latitude  +90° = north pole (top of disk, north-up)
//
// The lroc_color_2k.jpg equirectangular layout:
//   u = (lon + 180°) / 360°  →  0 = -180° (far side), 0.5 = 0° (near-side center)
//   v = (90° - lat) / 180°   →  0 = north pole, 1 = south pole
// ==========================================

/**
 * Build and return an ImageData sized exactly to the canvas backing store (device
 * pixels), with the texture spherically projected and per-pixel lit. Blitted 1:1
 * by the caller via putImageData, so the result is resolution-independent and crisp
 * at every devicePixelRatio. Runs once per 30 s poll — performance is not critical.
 *
 * Sun-direction convention for phase angle φ:
 *   sunDir = (sin φ, 0, -cos φ)
 *   φ=0   new moon       → (0,0,-1)  sun behind moon, near side dark
 *   φ=90  first quarter  → (1,0,0)   sun to the west, right half lit
 *   φ=180 full moon      → (0,0,1)   sun behind viewer, near side fully lit
 *   φ=270 last quarter   → (-1,0,0)  sun to the east, left half lit
 *
 * Parallactic rotation is baked into the per-pixel sampling (each screen pixel is
 * rotated into the projection frame) rather than applied as a canvas transform, so
 * nothing is resampled and the disc stays pixel-sharp.
 *
 * Visual treatment is tuned for a premium weather-app aesthetic: the full disc is a
 * lit sphere with a soft Lambertian terminator and a faint earthshine floor on the
 * shadow side (a real body, not a floating crescent). Everything adapts to
 * `brightness`: night is crisp, cool and high-contrast with raking-light relief at
 * the terminator and a dim, mostly-dark earthshine side; twilight brightens the
 * earthshine; daylight flattens contrast, fades the earthshine into the sky via the
 * alpha, and tints the disc toward `skyTint` so it embeds naturally.
 */
function _sphereProject(W, H, phaseDeg, parallacticAngle, brightness = 0, skyTint = null) {
    const imgData = new ImageData(W, H);
    const buf     = imgData.data;

    const r  = Math.min(W, H) * 0.46;

    // Pick the smallest mip with ≥1:1 texel density at the disc *centre*. The
    // orthographic projection maps screen x to longitude as x = r·sin(lon), so at
    // the centre (lon≈0) one screen pixel spans dlon = 1/r rad. The equirectangular
    // texture holds tw/(2π) texels per radian, giving tw/(2π·r) texels per screen
    // pixel at the centre. 1:1 there therefore needs tw ≥ 2π·r — NOT tw ≥ 4r (that
    // 4r figure is the average over the whole hemisphere, which under-resolves the
    // centre by ~1.57× and upscales the maria into a soft blur). Selecting on 2π·r
    // keeps the centre crisp; the limb stays oversampled (harmless) as always.
    const _mip = _texMips.find(m => m.w >= 2 * Math.PI * r) ?? _texMips[_texMips.length - 1];
    const { data: tex, w: tw, h: th } = _mip;
    const cx = W / 2, cy = H / 2;
    const haze = _hazeFromSky(skyTint);

    const aRot = parallacticAngle * Math.PI / 180;
    const cosA = Math.cos(aRot), sinA = Math.sin(aRot);

    const phRad = phaseDeg * Math.PI / 180;
    const sunX  = Math.sin(phRad);
    const sunZ  = -Math.cos(phRad);

    // ----- Tone-shaping constants -----
    // Global cap so the bright limb doesn't pop against the dashboard.
    const LIT_INTENSITY = 0.92;
    // Cool atmospheric tint so the lit hemisphere reads as moonlight, not grey.
    const TONE_R = 0.93;
    const TONE_G = 1.00;
    const TONE_B = 1.10;

    // ----- Sky-brightness adaptation (b = 0 night … 1 bright daylight) -----
    // b drives every background-dependent term below. At night (b = 0) the disc is
    // crisp, cool and HIGH-CONTRAST with raking-light relief at the terminator and a
    // dim earthshine side; as b rises it loses contrast and surface detail,
    // desaturates, and is nudged toward the pale blue-grey `haze` so it reads as a
    // real moon hanging in a bright sky rather than a sharp image on black.
    const b = Math.max(0, Math.min(1, brightness));

    // Texture → display remap. Night uses a LOW floor + HIGH gain so the lit side
    // has deep crater shadows and bright highlights (punchy, readable, luminous);
    // daylight lifts the floor and cuts the gain so the disc flattens and floats
    // just above the bright sky. This is the core night-contrast fix.
    const toneFloorB = 168 - 54 * (1 - b);                       // 114 night → 168 day
    const gainB      = 0.36 * (1 - 0.82 * b) + 0.26 * (1 - b);   // ~0.62 night → 0.065 day

    // Spherical depth via a lifted Lambertian. The floor is LOWER at night so the
    // lit hemisphere shows a real limb-to-terminator falloff (a sphere, not a flat
    // disc), and lifts toward flat in daylight where the disc reads near-uniform.
    const shadeFloorB = 0.50 + 0.45 * b;
    const shadeRangeB = 1 - shadeFloorB;
    // Highlights pull back so the limb never reads as pure white.
    const litIntensityB = LIT_INTENSITY * (1 - 0.14 * b);
    const desatAmt = 0.50 * b;  // toward per-pixel luma (kill warm surface chroma)
    const tintAmt  = 0.90 * b;  // toward the sky haze — lit side sits just above the sky
    // The strong tint above flattens the disc; this re-imposes the texture's own
    // light/dark relief on top so mare and craters stay faintly legible in daylight.
    const DETAIL_RELIEF = 0.85; // ± modulation amplitude at full daylight
    const SURF_MID      = 115;  // texture luma treated as the neutral (no-relief) level

    // ----- Earthshine (shadowed hemisphere) -----
    // The dark side keeps a faint reflected-earthlight luminance so the FULL disc
    // stays subtly present — never punched to transparent or pure black. Two knobs:
    //   • EARTHSHINE — the shadow-side luminance. LOW at night so the dark side
    //     stays mostly dark (only major maria/highlands read) and the lit crescent
    //     keeps its contrast; rises through twilight so the dark side grows more
    //     visible. Texture still rides on it, so it is never a flat grey fill.
    //   • darkSideAlpha — its opacity. Held near-opaque through twilight, then faded
    //     to near-transparent in full daylight so the shadow side dissolves into the
    //     bright sky rather than showing as a disc. This makes earthshine
    //     background-aware: subtle at night, present at twilight, gone by day.
    const EARTHSHINE    = 0.13 + 0.10 * b;
    const darkSideAlpha = 1 - 0.95 * _smoothstep(0.45, 1.0, b);

    // ----- Terminator raking-light relief -----
    // Near the terminator the sun grazes the surface, so terrain casts long shadows.
    // RELIEF boosts local texture contrast in a smooth band centred on the boundary
    // — making the terminator the focal point — strongest at night, off in flat
    // daylight. Smooth bump, so no hard outline or obvious sharpening.
    const RELIEF = 0.95 * (1 - b);

    // ----- Soft terminator -----
    // Half-width (in cos-incidence units) of the lit↔shadow transition band that
    // replaces hard phase masking. The lit factor ramps smoothly across this zone,
    // giving a wide photographic terminator; it widens further in daylight.
    const TERM_W   = 0.13 + 0.12 * b;
    const TERM_INV = 1 / (2 * TERM_W);

    // ----- Edge feather -----
    // Analytic anti-aliasing at the limb: constant ~2.5 device px regardless of
    // brightness. Daylight blending is handled by tintAmt/darkSideAlpha; a wide
    // feather here just makes the disc look fuzzy, especially on small screens.
    const FEATHER     = 2.5 / r;
    const FEATHER_INV = 1 / FEATHER;

    for (let py = 0; py < H; py++) {
        const sy  = -(py - cy) / r;  // screen-space, +1 = up
        const sy2 = sy * sy;
        if (sy2 > 1) continue;       // whole row outside the disc

        for (let px = 0; px < W; px++) {
            const sx = (px - cx) / r;  // screen-space, +1 = right
            const d2 = sx * sx + sy2;
            if (d2 > 1) continue;

            // Edge alpha — smoothstep from 1 inside (1−FEATHER) to 0 at d=1
            const dist = Math.sqrt(d2);
            let alpha;
            if (dist <= 1 - FEATHER) {
                alpha = 1;
            } else {
                const t = (1 - dist) * FEATHER_INV;
                alpha = t * t * (3 - 2 * t);
            }

            // Rotate the screen pixel into the projection frame (parallactic tilt).
            const nx = sx * cosA - sy * sinA;  // +1 = east limb
            const ny = sx * sinA + sy * cosA;  // +1 = north
            const nz = Math.sqrt(Math.max(0, 1 - d2));  // depth toward viewer

            // ----- Selenographic UV -----
            const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
            const lon = Math.atan2(nx, nz);
            const u   = (lon / Math.PI + 1) * 0.5;
            const v   = (Math.PI * 0.5 - lat) / Math.PI;

            // ----- Bilinear texture sample -----
            const tx  = u * (tw - 1);
            const ty  = v * (th - 1);
            const tx0 = Math.floor(tx), tx1 = Math.min(tx0 + 1, tw - 1);
            const ty0 = Math.floor(ty), ty1 = Math.min(ty0 + 1, th - 1);
            const fx  = tx - tx0,        fy = ty - ty0;

            const i00 = (ty0 * tw + tx0) * 4;
            const i10 = (ty0 * tw + tx1) * 4;
            const i01 = (ty1 * tw + tx0) * 4;
            const i11 = (ty1 * tw + tx1) * 4;
            const w00 = (1-fx)*(1-fy), w10 = fx*(1-fy), w01 = (1-fx)*fy, w11 = fx*fy;
            const sampleR = tex[i00]   * w00 + tex[i10]   * w10 + tex[i01]   * w01 + tex[i11]   * w11;
            const sampleG = tex[i00+1] * w00 + tex[i10+1] * w10 + tex[i01+1] * w01 + tex[i11+1] * w11;
            const sampleB = tex[i00+2] * w00 + tex[i10+2] * w10 + tex[i01+2] * w01 + tex[i11+2] * w11;

            // ----- Lighting -----
            // Signed cosine of the solar incidence angle. >0 lit, <0 shadow,
            // ==0 exactly on the terminator.
            const mu = nx * sunX + nz * sunZ;

            // Soft terminator gate: 0 deep in shadow, 1 well into the lit side,
            // smoothstepped across the ±TERM_W band so the day/night boundary is
            // a gradual luminance ramp instead of a hard clip.
            let litFactor;
            if (mu <= -TERM_W)      litFactor = 0;
            else if (mu >= TERM_W)  litFactor = 1;
            else { const t = (mu + TERM_W) * TERM_INV; litFactor = t * t * (3 - 2 * t); }

            // Lit-side depth: lifted Lambertian gives limb-to-terminator falloff
            // for a spherical read. Multiplied by the gate so it vanishes into the
            // shadow smoothly (no step at the terminator).
            const lamShade        = shadeFloorB + Math.max(0, mu) * shadeRangeB;
            const litContribution = litFactor * lamShade;

            // Luminance: an earthshine floor on the whole disc, rising smoothly to
            // the fully-lit level. The shadow hemisphere never reaches zero — it
            // settles at the dim, cool earthshine value instead.
            const lum = (EARTHSHINE + (1 - EARTHSHINE) * litContribution) * litIntensityB;

            // Albedo (surface colour, lighting-independent). toneFloorB/gainB give
            // punchy, high-contrast texture at night and a flat disc by day.
            const surfLuma = 0.299 * sampleR + 0.587 * sampleG + 0.114 * sampleB;
            const tonedR = (toneFloorB + sampleR * gainB) * TONE_R;
            const tonedG = (toneFloorB + sampleG * gainB) * TONE_G;
            const tonedB = (toneFloorB + sampleB * gainB) * TONE_B;

            // Surface texture rides on luminance, so its contrast scales with how
            // lit a pixel is: full detail on the lit side, only a faint trace on
            // the earthshine side, smoothly fading across the terminator.
            let oR = tonedR * lum;
            let oG = tonedG * lum;
            let oB = tonedB * lum;

            // Raking-light relief: in a smooth band centred on the terminator,
            // amplify the texture's own light/dark deviation so terrain pops right
            // at the boundary (deeper crater shadows, brighter ridges). Peaks at the
            // terminator, vanishes toward limb and deep shadow, and is off by day.
            if (RELIEF > 0) {
                const prox      = litFactor * (1 - litFactor) * 4;  // 0..1, peaks at terminator
                const reliefMul = 1 + RELIEF * prox * (surfLuma - SURF_MID) / 255;
                oR *= reliefMul;
                oG *= reliefMul;
                oB *= reliefMul;
            }

            // Daylight integration: desaturate the surface, then pull it toward
            // the pale blue-grey sky haze. Both amounts are 0 at night, so this
            // whole block is a no-op for the crisp nighttime moon.
            if (b > 0) {
                const luma = 0.299 * oR + 0.587 * oG + 0.114 * oB;
                oR += (luma - oR) * desatAmt;
                oG += (luma - oG) * desatAmt;
                oB += (luma - oB) * desatAmt;
                oR += (haze[0] - oR) * tintAmt;
                oG += (haze[1] - oG) * tintAmt;
                oB += (haze[2] - oB) * tintAmt;

                // Re-impose surface relief on top of the flat sky-tinted disc so
                // mare/craters stay faintly legible — faint detail, not contrast.
                const detailMul = 1 + DETAIL_RELIEF * b * (surfLuma - SURF_MID) / 255;
                oR *= detailMul;
                oG *= detailMul;
                oB *= detailMul;
            }

            // Opacity: the lit side is fully opaque; the shadow side fades toward
            // darkSideAlpha. At night that stays near-opaque so earthshine reads
            // against the dark sky; by day it drops near-transparent so the shadow
            // hemisphere dissolves into the bright sky rather than showing as a disc.
            const bodyAlpha = darkSideAlpha + (1 - darkSideAlpha) * litFactor;

            const i = (py * W + px) * 4;
            buf[i]   = Math.min(255, oR);
            buf[i+1] = Math.min(255, oG);
            buf[i+2] = Math.min(255, oB);
            buf[i+3] = 255 * alpha * bodyAlpha;
        }
    }

    return imgData;
}

// ==========================================
// PROCEDURAL SURFACE
// ==========================================

function _drawProceduralSurface(ctx, cx, cy, r) {
    // Sphere base — off-axis radial gradient simulates diffuse sunlight from upper-left
    const base = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, 0, cx, cy, r);
    base.addColorStop(0.00, '#ddd4be');
    base.addColorStop(0.25, '#c4b89a');
    base.addColorStop(0.60, '#9a8a6e');
    base.addColorStop(1.00, '#2e2618');
    ctx.fillStyle = base;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Maria (dark basaltic plains) — approximate real lunar mare positions
    const MARE = 'rgba(50,42,28,0.42)';
    [
        { ox: -0.18, oy: -0.22, rx: 0.26, ry: 0.20 }, // Imbrium
        { ox:  0.20, oy: -0.12, rx: 0.17, ry: 0.15 }, // Serenitatis
        { ox:  0.22, oy:  0.14, rx: 0.21, ry: 0.17 }, // Tranquillitatis
        { ox: -0.05, oy:  0.28, rx: 0.19, ry: 0.14 }, // Nubium
        { ox: -0.32, oy:  0.06, rx: 0.13, ry: 0.20 }, // Oceanus Procellarum
        { ox:  0.00, oy:  0.04, rx: 0.10, ry: 0.08 }, // Vaporum
    ].forEach(({ ox, oy, rx, ry }) => {
        ctx.beginPath();
        ctx.ellipse(cx + ox * r, cy + oy * r, rx * r, ry * r, 0, 0, Math.PI * 2);
        ctx.fillStyle = MARE;
        ctx.fill();
    });

    _drawCraters(ctx, cx, cy, r);
}

// Crater list — generated once at module load with a seeded PRNG so the layout
// is deterministic across every render call.
const _CRATERS = (() => {
    let seed = 0xCAFED00D;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (seed >>> 0) / 0xFFFFFFFF;
    };
    const list = [];
    for (let i = 0; i < 55; i++) {
        const angle = rand() * Math.PI * 2;
        const dist  = Math.sqrt(rand()) * 0.88; // area-uniform distribution in disk
        list.push({ ox: Math.cos(angle) * dist, oy: Math.sin(angle) * dist, r: 0.018 + rand() * 0.052 });
    }
    return list;
})();

function _drawCraters(ctx, cx, cy, r) {
    for (const c of _CRATERS) {
        // Skip craters whose rim would clip outside the sphere
        if (Math.hypot(c.ox, c.oy) + c.r > 0.94) continue;

        const x  = cx + c.ox * r;
        const y  = cy + c.oy * r;
        const cr = c.r  * r;

        ctx.beginPath();
        ctx.arc(x + cr * 0.18, y + cr * 0.18, cr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x - cr * 0.10, y - cr * 0.10, cr * 0.82, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230,218,196,0.10)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, cr * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,105,80,0.15)';
        ctx.fill();
    }
}

// ==========================================
// TERMINATOR SHADOW
//
// Each phase quadrant fills a different shadow path. Key canvas y-down direction fact:
// going from BOT to TOP, anticlockwise=true sweeps through the RIGHT peak of the ellipse
// (π/2→0→−π/2), anticlockwise=false sweeps through the LEFT peak (π/2→π→−π/2).
//
//  Waxing crescent  (0–90°):  left arc CCW  + CCW terminator (→ right) → large shadow
//  Waxing gibbous  (90–180°): left arc CCW  + CW  terminator (→ left)  → thin left sliver
//  Waning gibbous (180–270°): right arc CW  + CCW terminator (→ right) → thin right sliver
//  Waning crescent(270–360°): right arc CW  + CW  terminator (→ left)  → large shadow
// ==========================================

function _drawTerminator(ctx, cx, cy, r, phaseDeg) {
    const ph = ((phaseDeg % 360) + 360) % 360;

    if (ph < 1 || ph > 359) {
        // New moon — fill entire disk dark
        ctx.fillStyle = 'rgba(4,8,28,0.93)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    if (ph > 179 && ph < 181) return; // full moon — no shadow

    const TOP = -Math.PI / 2; // 12-o'clock on the circle
    const BOT =  Math.PI / 2; // 6-o'clock
    const atx = r * Math.abs(Math.cos(ph * Math.PI / 180)); // terminator ellipse x-radius

    ctx.fillStyle = 'rgba(4,8,28,0.93)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); // start at top

    // In canvas (y-down), going BOT→TOP:
    //   anticlockwise=true  (CCW): sweeps π/2 → 0 → −π/2 → through the RIGHT peak (+atx, 0)
    //   anticlockwise=false (CW):  sweeps π/2 → π → −π/2 → through the LEFT  peak (−atx, 0)
    if (ph < 90) {
        // Waxing crescent: large shadow, thin right lit strip
        ctx.arc(cx, cy, r, TOP, BOT, true);              // left outer arc CCW
        ctx.ellipse(cx, cy, atx, r, 0, BOT, TOP, true);  // terminator CCW → through RIGHT
    } else if (ph < 180) {
        // Waxing gibbous: thin left shadow sliver
        ctx.arc(cx, cy, r, TOP, BOT, true);              // left outer arc CCW
        ctx.ellipse(cx, cy, atx, r, 0, BOT, TOP, false); // terminator CW  → through LEFT
    } else if (ph < 270) {
        // Waning gibbous: thin right shadow sliver
        ctx.arc(cx, cy, r, TOP, BOT, false);             // right outer arc CW
        ctx.ellipse(cx, cy, atx, r, 0, BOT, TOP, true);  // terminator CCW → through RIGHT
    } else {
        // Waning crescent: large shadow, thin left lit strip
        ctx.arc(cx, cy, r, TOP, BOT, false);             // right outer arc CW
        ctx.ellipse(cx, cy, atx, r, 0, BOT, TOP, false); // terminator CW  → through LEFT
    }

    ctx.closePath();
    ctx.fill();
}
