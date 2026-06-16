// ============================================================
// ASTRO FORECAST — combined sky-quality + altitude chart
//
// SVG height = 280 px. Vertical layout:
//   y=  4.. 24  Seeing strip     (primary — 20px, colored blocks)
//   y= 30.. 37  Cloud High       (secondary — 7px bars)
//   y= 38.. 45  Cloud Mid
//   y= 46.. 53  Cloud Low
//   y= 60.. 78  Time axis        (18px)
//   y= 78..280  Altitude zone    (202px, sun/moon curves)
// ============================================================

// ── Chart geometry ───────────────────────────────────────────
const PX_H   = 40;   // pixels per hour
const SVG_H  = 280;
const LABEL_W = 46;  // fixed left label column width

// Weather zone rows
const R_SE_Y  = 4;    // seeing block top
const SEE_H   = 20;   // seeing block height
const R_HI_Y  = 30;   // High cloud bar top
const R_MI_Y  = 38;   // Mid cloud bar top
const R_LO_Y  = 46;   // Low cloud bar top
const BAR_H   = 7;    // cloud bar height

// Zone boundaries
const WZ_H   = 60;   // weather zone height
const TX_Y   = WZ_H; // 60 – time axis top
const TX_H   = 18;   // time axis band height
const AZ_Y   = TX_Y + TX_H; // 78 – altitude zone top
const AZ_H   = SVG_H - AZ_Y; // 202

// Altitude range
const ALT_MAX  = 90;
const ALT_MIN  = -20;
const ALT_SPAN = 110;

function altToY(alt) {
    return AZ_Y + (ALT_MAX - Math.max(ALT_MIN, Math.min(ALT_MAX, alt))) / ALT_SPAN * AZ_H;
}
const HORIZON_Y = altToY(0); // ≈ 245.5

function xOfMs(ms, win0) {
    return (ms - win0) / 3_600_000 * PX_H;
}

// ── Seeing colour scale ──────────────────────────────────────
const SEE_COLOR = { 5: '#4ade80', 4: '#38bdf8', 3: '#facc15', 2: '#fb923c', 1: '#f87171' };
const SEE_OPACITY = { 5: 0.52, 4: 0.48, 3: 0.42, 2: 0.38, 1: 0.34 };
function seeColor(score) { return SEE_COLOR[score] ?? '#6b7280'; }
function seeOp(score)    { return SEE_OPACITY[score] ?? 0.30; }

// ── Parse ISO strings (strips IANA bracket suffix) ───────────
function parseMs(iso) {
    return new Date(String(iso).replace(/\[.*]$/, '')).getTime();
}

// ── Modal wiring ─────────────────────────────────────────────
const modal    = document.getElementById('astro-fc-modal');
const body     = document.getElementById('astro-fc-body');
const closeBtn = document.getElementById('astro-fc-close');
const backdrop = document.getElementById('astro-fc-backdrop');
const openBtn  = document.getElementById('astro-fc-btn');

function openModal()  { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); closeBtn.focus(); loadAll(); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); openBtn.focus(); }

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
backdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

// ── Data cache ───────────────────────────────────────────────
let _cache = null, _cachedAt = 0;
const CACHE_MS = 20 * 60 * 1000;

async function loadAll() {
    if (_cache && Date.now() - _cachedAt < CACHE_MS) { render(_cache); return; }
    body.innerHTML = '<div class="af-loading">Loading forecast…</div>';
    try {
        const [astro, sunT, sunN, moonT, moonN] = await Promise.all([
            fetch('/api/forecast/astro').then(r => r.json()),
            fetch('/api/astronomy/curve?body=SUN&resolution=CARD').then(r => r.json()),
            fetch('/api/astronomy/curve?body=SUN&resolution=CARD&daysOffset=1').then(r => r.json()),
            fetch('/api/astronomy/curve?body=MOON&resolution=CARD').then(r => r.json()),
            fetch('/api/astronomy/curve?body=MOON&resolution=CARD&daysOffset=1').then(r => r.json()),
        ]);
        const sunCurve  = [...(sunT.points ?? []),  ...(sunN.points ?? [])];
        const moonCurve = [...(moonT.points ?? []), ...(moonN.points ?? [])];
        _cache = { forecast: astro.points ?? [], sunCurve, moonCurve };
        _cachedAt = Date.now();
        render(_cache);
    } catch (e) {
        body.innerHTML = '<p class="af-empty">Could not load forecast. Try again later.</p>';
        console.error('Astro forecast error:', e);
    }
}

// ── Altitude lookup (binary search) ─────────────────────────
function sunAltAt(curve, ms) {
    if (!curve.length) return 0;
    let lo = 0, hi = curve.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (parseMs(curve[mid].time) <= ms) lo = mid; else hi = mid;
    }
    return curve[lo].altitude;
}

// ── Sky score (seeing + cloud penalty, night-gated) ─────────
function skyScore(pt, sunCurve) {
    if (sunAltAt(sunCurve, parseMs(pt.time)) > -6) return 0;
    const cloud   = Math.max(pt.cloudLow * 2.0, pt.cloudMid, pt.cloudHigh * 0.6);
    const penalty = cloud > 80 ? 4 : cloud > 50 ? 2 : cloud > 20 ? 1 : 0;
    return Math.max(0, pt.seeingScore - penalty);
}

// ── Find best window ─────────────────────────────────────────
function findBestWindow(points, sunCurve) {
    let best = null, runStart = null, runLen = 0;
    for (let i = 0; i < points.length; i++) {
        if (skyScore(points[i], sunCurve) >= 3) {
            if (runStart === null) runStart = i;
            runLen++;
            if (!best || runLen > best.len) best = { start: runStart, len: runLen };
        } else { runStart = null; runLen = 0; }
    }
    return best;
}

// ── Banner HTML ──────────────────────────────────────────────
function buildBannerHtml(best, points) {
    if (!best) return `<div class="af-banner af-banner-none">
        <div class="af-banner-dot"></div>
        <div class="af-banner-text">
            <span class="af-banner-label">No good window tonight</span>
            <span class="af-banner-sub">Cloudy or poor seeing throughout the night</span>
        </div>
    </div>`;

    const s   = points[best.start];
    const e   = points[Math.min(best.start + best.len - 1, points.length - 1)];
    const fmt = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const from = fmt(parseMs(s.time));
    const to   = fmt(parseMs(e.time));
    const col  = seeColor(s.seeingScore);

    return `<div class="af-banner">
        <div class="af-banner-dot" style="background:${col}"></div>
        <div class="af-banner-text">
            <span class="af-banner-label">Best observing window</span>
            <span class="af-banner-time">${from} – ${to}</span>
        </div>
        <div class="af-banner-quality">
            <span class="af-banner-see" style="color:${col}">${s.seeingLabel}</span>
            <span class="af-banner-arc">${s.seeingArcsec}"</span>
        </div>
    </div>`;
}

// ── Background gradient (twilight zones fade into each other) ─
// One linearGradient stop per sun-curve sample; SVG interpolates
// between stops so band boundaries appear as soft fades rather
// than hard lines.
function altBgRgba(alt) {
    if (alt >= 0)    return [48,  96, 200, 0.06];
    if (alt >= -6)   return [22,  46, 130, 0.22];
    if (alt >= -12)  return [14,  28,  95, 0.42];
    if (alt >= -18)  return [ 9,  16,  62, 0.62];
    return                  [ 5,   9,  38, 0.80];
}

function buildBackground(sunCurve, win0, svgW) {
    const pts = sunCurve
        .map(pt => ({ x: xOfMs(parseMs(pt.time), win0), alt: pt.altitude }))
        .filter(p => p.x >= -PX_H && p.x <= svgW + PX_H);

    if (!pts.length) {
        return `<rect x="0" y="0" width="${svgW}" height="${SVG_H}" fill="rgba(5,9,38,0.80)"/>`;
    }

    let stops = '';

    // Clamp first point to x=0 so the fill covers the left edge
    const [r0, g0, b0, a0] = altBgRgba(pts[0].alt);
    if (pts[0].x > 0)
        stops += `<stop offset="0%" stop-color="rgb(${r0},${g0},${b0})" stop-opacity="${a0}"/>`;

    for (const p of pts) {
        const pct = Math.max(0, Math.min(100, p.x / svgW * 100));
        const [r, g, b, a] = altBgRgba(p.alt);
        stops += `<stop offset="${pct.toFixed(2)}%" stop-color="rgb(${r},${g},${b})" stop-opacity="${a}"/>`;
    }

    // Clamp last point to x=100% so the fill covers the right edge
    const last = pts[pts.length - 1];
    if (last.x < svgW) {
        const [r, g, b, a] = altBgRgba(last.alt);
        stops += `<stop offset="100%" stop-color="rgb(${r},${g},${b})" stop-opacity="${a}"/>`;
    }

    return `<defs>
        <linearGradient id="af-sky-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${svgW}" y2="0">
            ${stops}
        </linearGradient>
    </defs>
    <rect x="0" y="0" width="${svgW}" height="${SVG_H}" fill="url(#af-sky-grad)"/>`;
}

// ── Section divider (subtle line between seeing + clouds) ─────
function buildDividers(svgW) {
    const sep = `stroke="rgba(255,255,255,0.07)" stroke-width="1"`;
    return `<g>
        <line x1="0" x2="${svgW}" y1="${R_HI_Y - 2}.5" y2="${R_HI_Y - 2}.5" ${sep}/>
    </g>`;
}

// ── Weather data (seeing blocks + cloud bars + jet text) ─────
function buildWeather(points, win0, win1) {
    let html = '';
    for (const pt of points) {
        const ms  = parseMs(pt.time);
        if (ms < win0 || ms > win1) continue;

        const x   = xOfMs(ms, win0);
        const col = seeColor(pt.seeingScore);
        const op  = seeOp(pt.seeingScore);

        // ── Seeing: filled block (primary) ──────────────────
        html +=
            `<rect x="${x.toFixed(1)}" y="${R_SE_Y}" width="${PX_H}" height="${SEE_H}"` +
            ` fill="${col}" fill-opacity="${op}" rx="0"/>` +
            // bright accent line at top of the seeing block — the eye
            // reads this horizontal stripe as the quality signal first.
            `<line x1="${x.toFixed(1)}" x2="${(x+PX_H).toFixed(1)}" y1="${R_SE_Y}" y2="${R_SE_Y}"` +
            ` stroke="${col}" stroke-width="2" stroke-opacity="0.90"/>`;

        // ── Cloud bars (secondary) ───────────────────────────
        const hw = PX_H * pt.cloudHigh / 100;
        const mw = PX_H * pt.cloudMid  / 100;
        const lw = PX_H * pt.cloudLow  / 100;
        html +=
            `<rect x="${x.toFixed(1)}" y="${R_HI_Y}" width="${PX_H}" height="${BAR_H}" fill="rgba(255,255,255,0.04)" rx="1.5"/>` +
            `<rect x="${x.toFixed(1)}" y="${R_HI_Y}" width="${hw.toFixed(1)}" height="${BAR_H}" fill="rgba(240,242,255,0.40)" rx="1.5"/>` +
            `<rect x="${x.toFixed(1)}" y="${R_MI_Y}" width="${PX_H}" height="${BAR_H}" fill="rgba(255,255,255,0.04)" rx="1.5"/>` +
            `<rect x="${x.toFixed(1)}" y="${R_MI_Y}" width="${mw.toFixed(1)}" height="${BAR_H}" fill="rgba(96,165,250,0.52)" rx="1.5"/>` +
            `<rect x="${x.toFixed(1)}" y="${R_LO_Y}" width="${PX_H}" height="${BAR_H}" fill="rgba(255,255,255,0.04)" rx="1.5"/>` +
            `<rect x="${x.toFixed(1)}" y="${R_LO_Y}" width="${lw.toFixed(1)}" height="${BAR_H}" fill="rgba(148,163,184,0.70)" rx="1.5"/>`;

    }
    return `<g>${html}</g>`;
}

// ── Time axis ────────────────────────────────────────────────
function buildTimeAxis(win0, win1) {
    let lines = '', labels = '';
    const startH = Math.ceil(win0 / 3_600_000) * 3_600_000;
    for (let ms = startH; ms <= win1; ms += 3_600_000) {
        const x   = xOfMs(ms, win0);
        const d   = new Date(ms);
        const h   = d.getHours();
        const lbl = String(h).padStart(2, '0');
        const mid = h === 0;

        lines  += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${SVG_H}" class="${mid ? 'af-midnight-line' : 'af-hour-line'}"/>`;
        labels += `<text x="${x.toFixed(1)}" y="${(TX_Y + 13).toFixed(1)}" class="af-hour-lbl${mid ? ' af-midnight-lbl' : ''}" text-anchor="middle">${lbl}</text>`;

        if (mid) {
            const dayLbl = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            labels += `<text x="${(x + 4).toFixed(1)}" y="${(TX_Y + 13).toFixed(1)}" class="af-day-lbl" text-anchor="start">${dayLbl}</text>`;
        }
    }
    return `<g>${lines}</g><g>${labels}</g>`;
}

// ── Altitude curves (with above-horizon fill area) ───────────
function buildCurveWithFill(curve, win0, winEnd, stroke, fillColor, cls) {
    let pathD = '', fillD = '', inPath = false, inFill = false;
    const hz = HORIZON_Y;

    for (const pt of curve) {
        const ms = parseMs(pt.time);
        if (ms < win0 - 600_000 || ms > winEnd + 600_000) continue;
        const x = xOfMs(ms, win0);
        const y = altToY(pt.altitude);

        pathD += inPath ? `L${x.toFixed(1)},${y.toFixed(1)} ` : `M${x.toFixed(1)},${y.toFixed(1)} `;
        inPath = true;

        if (pt.altitude >= 0) {
            if (!inFill) { fillD += `M${x.toFixed(1)},${hz.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)} `; inFill = true; }
            else fillD += `L${x.toFixed(1)},${y.toFixed(1)} `;
        } else if (inFill) {
            fillD += `L${x.toFixed(1)},${hz.toFixed(1)} Z `;
            inFill = false;
        }
    }
    if (inFill) fillD += `L${xOfMs(winEnd, win0).toFixed(1)},${hz.toFixed(1)} Z`;

    const clip = `clip-path="url(#af-az-clip)"`;
    let result = '';
    if (fillD) result += `<path d="${fillD}" fill="${fillColor}" opacity="0.14" ${clip}/>`;
    if (pathD) result += `<path d="${pathD}" stroke="${stroke}" stroke-width="1.5" fill="none" class="${cls}" ${clip} vector-effect="non-scaling-stroke"/>`;
    return result;
}

// ── Altitude zone decoration (horizon + guide lines) ─────────
function buildAltZoneDecor(svgW) {
    const hy  = HORIZON_Y.toFixed(1);
    const y30 = altToY(30).toFixed(1);
    const y60 = altToY(60).toFixed(1);
    const guide = `stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"`;
    return `<g>
        <line x1="0" x2="${svgW}" y1="${y60}" y2="${y60}" ${guide}/>
        <line x1="0" x2="${svgW}" y1="${y30}" y2="${y30}" ${guide}/>
        <line x1="0" x2="${svgW}" y1="${hy}"  y2="${hy}"  class="af-horizon"/>
        <text x="3" y="${(+y60 - 2).toFixed(1)}" class="af-alt-guide-lbl">60°</text>
        <text x="3" y="${(+y30 - 2).toFixed(1)}" class="af-alt-guide-lbl">30°</text>
        <text x="3" y="${(HORIZON_Y - 3).toFixed(1)}" class="af-horizon-label">0°</text>
    </g>`;
}

// ── "Now" marker ─────────────────────────────────────────────
function buildNowMarker(win0) {
    const x = xOfMs(Date.now(), win0).toFixed(1);
    return `<line x1="${x}" x2="${x}" y1="0" y2="${SVG_H}" class="af-now-line"/>
            <circle cx="${x}" cy="${(TX_Y + 9).toFixed(1)}" r="3" class="af-now-dot"/>`;
}

// ── Label SVG (fixed left column, 3 weight tiers) ────────────
function buildLabelSVG() {
    const lx   = LABEL_W - 4;
    const seeY = (R_SE_Y + SEE_H / 2 + 3.5).toFixed(1);
    const h60Y = (altToY(60) - 2).toFixed(1);
    const h30Y = (altToY(30) - 2).toFixed(1);
    const hzY  = (HORIZON_Y  - 3).toFixed(1);

    return `<svg xmlns="http://www.w3.org/2000/svg" class="af-label-svg" width="${LABEL_W}" height="${SVG_H}" aria-hidden="true">
        <text x="${lx}" y="${seeY}"       class="af-row-label af-lbl-primary">See</text>
        <text x="${lx}" y="${R_HI_Y + 6}" class="af-row-label af-lbl-cloud">H</text>
        <text x="${lx}" y="${R_MI_Y + 6}" class="af-row-label af-lbl-cloud">M</text>
        <text x="${lx}" y="${R_LO_Y + 6}" class="af-row-label af-lbl-cloud">L</text>
        <text x="${lx}" y="${h60Y}"       class="af-row-label af-hz-label">60°</text>
        <text x="${lx}" y="${h30Y}"       class="af-row-label af-hz-label">30°</text>
        <text x="${lx}" y="${hzY}"        class="af-row-label af-hz-label">0°</text>
        <line x1="${LABEL_W - 1}" x2="${LABEL_W - 1}" y1="0" y2="${SVG_H}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    </svg>`;
}

// ── Legend ────────────────────────────────────────────────────
function buildLegend() {
    const bands = [
        ['rgba(5,9,38,0.80)',   'Night'],
        ['rgba(9,16,62,0.62)',  'Astro twilight'],
        ['rgba(14,28,95,0.42)', 'Nautical'],
        ['rgba(22,46,130,0.22)','Civil'],
    ];
    const bandHtml = bands.map(([c, l]) =>
        `<span class="af-legend-item"><span class="af-legend-swatch" style="background:${c};border:1px solid rgba(255,255,255,0.12)"></span>${l}</span>`
    ).join('');

    const seeScale = [5,4,3,2,1].map(s =>
        `<span class="af-legend-dot" style="background:${SEE_COLOR[s]}" title="${['','Very poor','Poor','Fair','Good','Excellent'][s]}"></span>`
    ).join('');

    return `<div class="af-legend">
        <div class="af-legend-group">
            ${bandHtml}
        </div>
        <div class="af-legend-group">
            <span class="af-legend-item">${seeScale}&thinsp;Seeing</span>
            <span class="af-legend-item">
                <svg width="20" height="7" style="vertical-align:middle"><line x1="0" y1="3.5" x2="20" y2="3.5" stroke="#fbbf24" stroke-width="1.5"/></svg>Sun
            </span>
            <span class="af-legend-item">
                <svg width="20" height="7" style="vertical-align:middle"><line x1="0" y1="3.5" x2="20" y2="3.5" stroke="#93c5fd" stroke-width="1.5"/></svg>Moon
            </span>
            <span class="af-legend-item"><span class="af-legend-swatch" style="background:rgba(148,163,184,0.70)"></span>Low</span>
            <span class="af-legend-item"><span class="af-legend-swatch" style="background:rgba(96,165,250,0.52)"></span>Mid</span>
            <span class="af-legend-item"><span class="af-legend-swatch" style="background:rgba(240,242,255,0.40)"></span>High</span>
        </div>
    </div>`;
}

// ── Assemble SVG ─────────────────────────────────────────────
function buildSVG(forecast, sunCurve, moonCurve, win0, win1) {
    const svgW = Math.ceil(xOfMs(win1, win0)) + PX_H;

    const clipDef = `<clipPath id="af-az-clip">
        <rect x="0" y="${AZ_Y}" width="${svgW}" height="${AZ_H + 1}"/>
    </clipPath>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${SVG_H}" id="af-svg" style="display:block;flex-shrink:0">
        <defs>${clipDef}</defs>
        ${buildBackground(sunCurve, win0, svgW)}
        ${buildDividers(svgW)}
        ${buildWeather(forecast, win0, win1)}
        ${buildTimeAxis(win0, win1)}
        ${buildCurveWithFill(moonCurve, win0, win1, '#93c5fd', '#93c5fd', 'af-moon-curve')}
        ${buildCurveWithFill(sunCurve,  win0, win1, '#fbbf24', '#fbbf24', 'af-sun-curve')}
        ${buildAltZoneDecor(svgW)}
        ${buildNowMarker(win0)}
        <rect x="0" y="0" width="${svgW}" height="${SVG_H}" fill="none" id="af-hit" style="cursor:crosshair"/>
    </svg>`;
}

// ── Tooltip ──────────────────────────────────────────────────
let _tipEl = null;

function ensureTip() {
    if (_tipEl) return;
    _tipEl = document.createElement('div');
    _tipEl.className = 'af-tooltip';
    _tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_tipEl);
}

function showTip(screenX, screenY, pt) {
    ensureTip();

    const ms      = parseMs(pt.time);
    const timeStr = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const col     = seeColor(pt.seeingScore);

    const cloudBar = (v, fill) => `<div class="af-tip-bar-wrap">
        <div class="af-tip-bar-track"><div class="af-tip-bar-fill" style="width:${Math.round(v)}%;background:${fill}"></div></div>
        <span class="af-tip-pct">${Math.round(v)}%</span>
    </div>`;

    _tipEl.innerHTML = `
        <div class="af-tip-header">
            <span class="af-tip-time">${timeStr}</span>
            <span class="af-tip-date">${dateStr}</span>
        </div>
        <div class="af-tip-see-hero" style="--see-col:${col}">
            <span class="af-tip-see-lbl">${pt.seeingLabel}</span>
            <span class="af-tip-see-arc">${pt.seeingArcsec}"</span>
        </div>
        <div class="af-tip-divider"></div>
        <div class="af-tip-clouds">
            <div class="af-tip-cloud-row"><span class="af-tip-cl-label">High</span>${cloudBar(pt.cloudHigh,'rgba(240,242,255,0.50)')}</div>
            <div class="af-tip-cloud-row"><span class="af-tip-cl-label">Mid</span>${cloudBar(pt.cloudMid,'rgba(96,165,250,0.60)')}</div>
            <div class="af-tip-cloud-row"><span class="af-tip-cl-label">Low</span>${cloudBar(pt.cloudLow,'rgba(148,163,184,0.78)')}</div>
        </div>
        <div class="af-tip-divider"></div>
        <div class="af-tip-jet">Jet stream&ensp;<strong>${Math.round(pt.jetStream)} km/h</strong></div>`;

    _tipEl.classList.add('visible');

    const tw = _tipEl.offsetWidth, th = _tipEl.offsetHeight, gap = 10;
    let left = screenX - tw / 2;
    let top  = screenY - th - gap;
    if (top < gap) top = screenY + gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));
    _tipEl.style.left = `${Math.round(left)}px`;
    _tipEl.style.top  = `${Math.round(top)}px`;
}

function hideTip() { _tipEl?.classList.remove('visible'); }

// ── Main render ───────────────────────────────────────────────
function render({ forecast, sunCurve, moonCurve }) {
    if (!forecast.length) { body.innerHTML = '<p class="af-empty">No forecast data available.</p>'; return; }

    const now  = Date.now();
    const vis  = forecast.filter(p => parseMs(p.time) >= now - 6 * 3_600_000);
    if (!vis.length) { body.innerHTML = '<p class="af-empty">No upcoming forecast data.</p>'; return; }

    const win0 = parseMs(vis[0].time);
    const win1 = parseMs(vis[vis.length - 1].time);

    const best   = findBestWindow(vis, sunCurve);
    const banner = buildBannerHtml(best, vis);
    const legend = buildLegend();
    const labels = buildLabelSVG();
    const svg    = buildSVG(vis, sunCurve, moonCurve, win0, win1);

    body.innerHTML = `
        ${banner}
        ${legend}
        <div class="af-chart-outer">
            ${labels}
            <div class="af-chart-scroll" id="af-chart-scroll">${svg}</div>
        </div>
        <p class="af-info">
            <strong>Seeing</strong> estimated via Hufnagel-Valley HV&nbsp;5/7 model using jet stream + surface wind.
            Best window requires sun below −6° (nautical twilight).
            <strong>Jet</strong> = 200 hPa wind (km/h) — above ~100 degrades seeing.
        </p>`;

    const scroll = document.getElementById('af-chart-scroll');
    if (scroll) scroll.scrollLeft = Math.max(0, xOfMs(now, win0) - scroll.clientWidth / 2);

    const svgEl = document.getElementById('af-svg');
    if (!svgEl) return;

    function nearestPt(e) {
        const r   = svgEl.getBoundingClientRect();
        const svgX = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - r.left;
        const ms   = win0 + svgX / PX_H * 3_600_000;
        return vis.reduce((a, b) => Math.abs(parseMs(b.time) - ms) < Math.abs(parseMs(a.time) - ms) ? b : a);
    }

    svgEl.addEventListener('mousemove',  e => showTip(e.clientX, e.clientY, nearestPt(e)));
    svgEl.addEventListener('mouseleave', hideTip);
    svgEl.addEventListener('touchstart', e => { e.preventDefault(); showTip(e.touches[0].clientX, e.touches[0].clientY, nearestPt(e)); }, { passive: false });
    svgEl.addEventListener('touchend',   () => setTimeout(hideTip, 2200));
}
