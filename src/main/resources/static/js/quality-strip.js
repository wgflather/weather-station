// quality-strip.js
//
// The 24-hour data-quality strip shown inside a metric card's status-circle
// popover. Answers "has this sensor *been* healthy?" alongside the popover's
// existing "is this reading trustworthy right now?".
//
// The endpoint returns every sensor-backed metric in one ~4 KB payload, so a
// single fetch serves all five popovers. That only pays off if the second
// popover doesn't refetch — hence the module-level cache below, which is the
// load-bearing half of the design rather than an optimisation.

const QUALITY_URL = '/api/weather/quality';

// The data cannot change faster than the station reports, so a TTL below the
// reporting interval only buys cache misses that recompute an identical
// answer. 60 s is the floor for a 1-minute station.
//
// Staleness costs little here: "is this sensor alive right now" comes from the
// popover's own freshness section (SensorStateCache via the 30 s dashboard
// poll), not from the strip. The strip is the history panel beside it.
const CACHE_TTL_MS = 60_000;

// Status circles exist on these five cards only. Surface wetness uses a badge
// rather than a circle, and the sun/moon cards aren't sensor-backed.
const CARD_METRIC = {
    'temperature-card': 'temperature',
    'pressure-card':    'pressure',
    'humidity-card':    'humidity',
    'wind-card':        'wind',
    'uv-card':          'uvIndex',
};

// QualityBucket arrives as one flat record carrying every metric, so the
// per-metric counts are addressed by field prefix. Surface wetness and wind
// direction have no `*SpikeCount` field at all — DataQualityValidator defines
// no spike limit for them — so those reads land on undefined and coalesce to 0.
const FIELD_PREFIX = {
    temperature:    'temp',
    pressure:       'pressure',
    humidity:       'humidity',
    surfaceWetness: 'surfaceWetness',
    wind:           'wind',
    windDirection:  'windDirection',
    uvIndex:        'uvIndex',
};

// Deliberately not DATA_QUALITY_COLORS: that map's MISSING is #111827, which
// works as a text colour but would read as a hole punched through the bar.
// Absence gets muted grey; PARTIAL is a dimmed OK so it reads as "degraded but
// reporting" rather than as a separate fault.
const STRIP_COLORS = {
    OK:      '#22c55e',
    SPIKE:   '#f59e0b',
    ANOMALY: '#ef4444',
    PARTIAL: 'rgba(34, 197, 94, 0.38)',
    // MISSING (rows arrived, this metric had no value) reads as muted slate,
    // while EMPTY (no row at all — the station was silent) is darker than the
    // track so it reads as a notch cut out of the bar. They are different
    // failures and looked near-identical when both were grey.
    MISSING: 'rgba(148, 163, 184, 0.55)',
    EMPTY:   'rgba(2, 6, 23, 0.55)',
    // Absent hardware. Recessive rather than dark: MISSING and EMPTY are both
    // failures worth looking at, while this one is a statement that there is
    // nothing here to judge, so it should not draw the eye at all.
    NOT_CONFIGURED: 'rgba(100, 116, 139, 0.28)',
};

// A bucket counts as under-reporting below half the station's usual rate, and
// as a dead metric when at least half its readings arrived with no value.
const PARTIAL_RATIO = 0.5;
const MISSING_RATIO = 0.5;
const NOT_CONFIGURED_RATIO = 0.5;

// The final bucket is partial by construction — it covers a window that is
// still running. Below this much elapsed there are too few readings to judge
// coverage at all, so the PARTIAL test is skipped rather than guessed at.
const LIVE_BUCKET_MIN_ELAPSED = 0.15;

// ==========================================
// FETCH + CACHE
// ==========================================

let stripPromise = null;
let stripFetchedAt = 0;

// Caches the *promise*, not the resolved value: opening two popovers in quick
// succession would otherwise have both see an empty cache and both fetch.
export function fetchQualityStrip() {
    if (!stripPromise || Date.now() - stripFetchedAt > CACHE_TTL_MS) {
        stripFetchedAt = Date.now();
        stripPromise = fetch(QUALITY_URL)
            .then(res => {
                if (!res.ok) throw new Error(`quality strip: HTTP ${res.status}`);
                return res.json();
            })
            .catch(err => {
                stripPromise = null;   // never cache a failure
                throw err;
            });
    }
    return stripPromise;
}

// ==========================================
// DERIVATION
// ==========================================

function countsFor(bucket, metricKey) {
    const p = FIELD_PREFIX[metricKey];
    if (!p) return null;
    return {
        total:   bucket.totalCount              ?? 0,
        ok:      bucket[`${p}OkCount`]          ?? 0,
        spike:   bucket[`${p}SpikeCount`]       ?? 0,
        anomaly: bucket[`${p}AnomalyCount`]     ?? 0,
        missing: bucket[`${p}MissingCount`]     ?? 0,
        notConfigured: bucket[`${p}NotConfiguredCount`] ?? 0,
    };
}

// The station's usual readings-per-bucket, taken as the median of the
// non-empty buckets. Median rather than max so a burst can't inflate it, and
// derived from the data rather than configured because the reporting interval
// isn't recorded anywhere in the app.
function medianBucketTotal(buckets) {
    const totals = buckets
        .map(b => b.totalCount ?? 0)
        .filter(t => t > 0)
        .sort((a, b) => a - b);
    if (!totals.length) return 0;
    return totals[Math.floor(totals.length / 2)];
}

// Severity ladder. Spikes and anomalies are rare point events and win outright:
// at 48 buckets a single one tints ~2 % of the bar, which is proportionate. The
// coverage states rank below them because they describe the bucket as a whole.
function bucketState(counts, expected) {
    if (counts.total === 0)                              return 'EMPTY';
    if (counts.anomaly > 0)                              return 'ANOMALY';
    if (counts.spike > 0)                                return 'SPIKE';
    // Above MISSING because it explains more: both mean "no value here", but this
    // one says why. Still below the point events, so a bucket where the firmware
    // changed mid-window shows the spike rather than hiding it.
    if (counts.notConfigured >= counts.total * NOT_CONFIGURED_RATIO) return 'NOT_CONFIGURED';
    if (counts.missing >= counts.total * MISSING_RATIO)  return 'MISSING';
    if (expected > 0 && counts.total < expected * PARTIAL_RATIO) return 'PARTIAL';
    return 'OK';
}

function computeStates(strip, metricKey) {
    const buckets = strip.bucketList ?? [];
    const expected = medianBucketTotal(buckets);
    const bucketMs = (strip.bucketMinutes ?? 30) * 60_000;
    const lastIndex = buckets.length - 1;
    const now = Date.now();

    return buckets.map((bucket, i) => {
        const counts = countsFor(bucket, metricKey);
        if (!counts) return 'EMPTY';

        let expectedHere = expected;

        if (i === lastIndex && bucket.from) {
            // Prorate the still-running bucket, or the right edge of a healthy
            // strip would read as degraded permanently.
            const elapsed = (now - new Date(bucket.from).getTime()) / bucketMs;
            expectedHere = elapsed < LIVE_BUCKET_MIN_ELAPSED
                ? 0                                    // too early to judge
                : expected * Math.min(elapsed, 1);
        }

        return bucketState(counts, expectedHere);
    });
}

// ==========================================
// RENDERING
// ==========================================

function hhmm(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

// One gap is worth naming precisely; several are not — the exact spans of five
// outages will not fit in a 210px popover, and the count plus total answers
// "how bad was today" better than a truncated list would.
function gapText(gaps) {
    if (!gaps?.length) return null;
    if (gaps.length === 1) return `gap ${hhmm(gaps[0].from)}–${hhmm(gaps[0].to)}`;

    const total = gaps.reduce((sum, g) => sum + (g.minutes ?? 0), 0);
    return `${gaps.length} gaps · ${formatDuration(total)} total`;
}

function issueText(summary, gaps) {
    // A metric the station never reports has nothing graded in the window, so the
    // usual "No issues" would claim a clean bill of health for absent hardware.
    const graded = (summary?.okCount ?? 0) + (summary?.spikeCount ?? 0)
                 + (summary?.anomalyCount ?? 0) + (summary?.missingCount ?? 0);
    if (!graded && summary?.notConfiguredCount) return 'No sensor configured';

    const parts = [];

    if (summary?.spikeCount)   parts.push(plural(summary.spikeCount, 'spike', 'spikes'));
    if (summary?.anomalyCount) parts.push(plural(summary.anomalyCount, 'anomaly', 'anomalies'));
    if (summary?.missingCount) parts.push(`${summary.missingCount} missing`);
    if (summary?.notConfiguredCount) parts.push(`${summary.notConfiguredCount} not configured`);

    const gapPart = gapText(gaps);
    if (gapPart) parts.push(gapPart);

    return parts.length ? parts.join(' · ') : 'No issues in 24 h';
}

function barSVG(states, gaps, fromMs, toMs) {
    const n = states.length;
    const span = toMs - fromMs;

    // viewBox units = buckets, so each rect is exactly 1 wide and the browser
    // handles the sub-pixel scaling to whatever width the popover ends up.
    const rects = states.map((state, i) =>
        `<rect x="${i}" y="0" width="1" height="1" fill="${STRIP_COLORS[state] ?? STRIP_COLORS.EMPTY}"/>`
    ).join('');

    // Gaps are drawn at their true start and end rather than snapped to bucket
    // edges. A 20-minute outage inside a 30-minute bucket is invisible in the
    // bucket layer — it only drags the bucket down to PARTIAL — so the overlay
    // is what actually shows where the station went quiet.
    const overlay = (gaps ?? []).map(gap => {
        const x0 = ((new Date(gap.from).getTime() - fromMs) / span) * n;
        const x1 = ((new Date(gap.to).getTime()   - fromMs) / span) * n;
        const x = Math.max(0, x0);
        const w = Math.min(n, x1) - x;
        if (!(w > 0)) return '';
        return `<rect x="${x.toFixed(3)}" y="0" width="${w.toFixed(3)}" height="1"
                      fill="${STRIP_COLORS.EMPTY}"/>`;
    }).join('');

    // crispEdges on the buckets only: it snaps to whole pixels, which would
    // round a narrow gap away entirely. The overlay keeps antialiasing so a
    // 15-minute gap still renders as a visible sliver.
    //
    // The cursor is one bucket wide and translucent white, so scrubbing
    // brightens the bucket being read rather than hiding its state colour. It
    // carries crispEdges of its own: being exactly one bucket wide it must snap
    // to the same pixel boundaries as the buckets, or it lands a pixel off the
    // one it is meant to be highlighting.
    return `<svg viewBox="0 0 ${n} 1" preserveAspectRatio="none" aria-hidden="true">
                <g shape-rendering="crispEdges">${rects}</g>
                <g>${overlay}</g>
                <rect class="qstrip-cursor" x="0" y="0" width="1" height="1"
                      shape-rendering="crispEdges"
                      fill="rgba(255, 255, 255, 0.45)" opacity="0"/>
            </svg>`;
}

// What a single bucket says when scrubbed over. The time range is what makes it
// obvious this is a per-bucket readout rather than the 24 h summary it replaces.
function bucketReadout(strip, metricKey, i) {
    const bucket = strip.bucketList?.[i];
    if (!bucket) return null;

    const counts = countsFor(bucket, metricKey);
    if (!counts) return null;

    const startMs = new Date(bucket.from).getTime();
    const endMs = startMs + (strip.bucketMinutes ?? 30) * 60_000;
    const range = `${hhmm(startMs)}–${hhmm(endMs)}`;

    if (counts.total === 0) return `${range} · no readings`;

    // Nothing graded at all in the bucket: the station reported, but not this
    // field. Saying "30 readings" alone would imply the sensor was working.
    if (!counts.ok && !counts.spike && !counts.anomaly && !counts.missing
        && counts.notConfigured) {
        return `${range} · no sensor configured`;
    }

    const parts = [range, plural(counts.total, 'reading', 'readings')];
    if (counts.spike)   parts.push(plural(counts.spike, 'spike', 'spikes'));
    if (counts.anomaly) parts.push(plural(counts.anomaly, 'anomaly', 'anomalies'));
    if (counts.missing) parts.push(`${counts.missing} missing`);
    if (counts.notConfigured) parts.push(`${counts.notConfigured} not configured`);

    return parts.join(' · ');
}

/**
 * Pointer scrubbing over the strip, rewriting the caption line in place.
 *
 * <p>Deliberately not a floating tooltip: the strip lives inside a 210px
 * popover, so a tooltip would be clipped, and nesting one popup in another is
 * awkward on touch. Rewriting the line that is already there costs no extra DOM
 * and degrades to the plain summary wherever pointers don't hover.
 */
function attachScrub(root, strip, metricKey, summaryText) {
    // Listeners go on the padded track so the target is comfortably tall, but
    // the mapping measures the bar itself — otherwise the padding would offset
    // every reading.
    const track = root.querySelector('.qstrip-track');
    const bar = root.querySelector('.qstrip-bar');
    const out = root.querySelector('.qstrip-issues');
    const cursor = root.querySelector('.qstrip-cursor');
    const n = strip.bucketList?.length ?? 0;
    if (!track || !bar || !out || !n) return;

    const read = event => {
        const rect = bar.getBoundingClientRect();
        if (!rect.width) return;

        const ratio = (event.clientX - rect.left) / rect.width;
        const i = Math.min(n - 1, Math.max(0, Math.floor(ratio * n)));

        const text = bucketReadout(strip, metricKey, i);
        if (!text) return;

        out.textContent = text;
        cursor?.setAttribute('x', String(i));
        cursor?.setAttribute('opacity', '1');
    };

    const reset = () => {
        out.textContent = summaryText;
        cursor?.setAttribute('opacity', '0');
    };

    track.addEventListener('pointermove', read);
    track.addEventListener('pointerdown', read);

    // Only mouse reverts on leave. A touch pointer stops existing the moment the
    // finger lifts, so reverting there would blank the readout before it could
    // be read — tapping a bucket keeps its value until another is tapped.
    track.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') reset();
    });
    track.addEventListener('pointercancel', reset);

    // fetch-data.js closes the popover on any document click with no
    // containment check (see its document click listener), so without this a tap
    // on the strip would dismiss the very popup being read. Same guard the
    // cloud-forecast strip uses.
    track.addEventListener('click', event => event.stopPropagation());
}

// Returns { html, summaryText }, or null when there is nothing to show.
// summaryText is handed back so the scrub handler can restore it on leave.
function stripHTML(strip, metricKey) {
    const summary = (strip.metricQualitySummaries ?? [])
        .find(s => s.metricName === metricKey);

    // Server omits EXTERNAL_API metrics entirely — nothing meaningful to show.
    if (!summary) return null;

    const states = computeStates(strip, metricKey);
    if (!states.length) return null;

    const issues = issueText(summary, strip.gaps);
    const fromMs = new Date(strip.from).getTime();
    const toMs   = new Date(strip.to).getTime();

    return {
        summaryText: issues,
        html: `
            <div class="popup-divider"></div>
            <div class="popup-heading" style="margin-top:8px;">24-Hour Quality</div>
            <div class="qstrip-track">
                <div class="qstrip-bar" role="img" aria-label="Data quality over the last 24 hours: ${issues}">
                    ${barSVG(states, strip.gaps, fromMs, toMs)}
                </div>
            </div>
            <div class="qstrip-axis">
                <span>24h ago</span>
                <span>now</span>
            </div>
            <div class="qstrip-issues">${issues}</div>
        `,
    };
}

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Synchronous placeholder for buildPopupHTML. The popover opens immediately;
 * hydrateQualityStrip fills this in once the payload lands (usually from cache,
 * so usually within the same frame).
 */
export function qualityStripSlot(cardId) {
    const metricKey = CARD_METRIC[cardId];
    if (!metricKey) return '';
    return `<div class="qstrip-slot" data-metric="${metricKey}"></div>`;
}

/**
 * Fills any strip placeholders inside `root` with the rendered strip.
 *
 * `onRendered` fires after the DOM is updated. The strip grows the popover by
 * ~55 px, and the popover has already been positioned (and may have flipped
 * above its anchor to fit the viewport) by the time this resolves — so callers
 * must use it to reposition, or a popover near the bottom of the screen will
 * end up overflowing.
 */
export function hydrateQualityStrip(root, onRendered) {
    const slot = root?.querySelector('.qstrip-slot');
    if (!slot) return;

    const metricKey = slot.dataset.metric;

    const fill = html => {
        // The popover may have been closed and its innerHTML replaced while the
        // request was in flight.
        if (!slot.isConnected) return;
        slot.innerHTML = html;
        onRendered?.();
    };

    fetchQualityStrip()
        .then(strip => {
            const rendered = stripHTML(strip, metricKey);
            if (!rendered) return fill('');
            fill(rendered.html);
            if (slot.isConnected) attachScrub(slot, strip, metricKey, rendered.summaryText);
        })
        .catch(err => {
            console.error('[quality-strip]', err);
            fill(`
                <div class="popup-divider"></div>
                <div class="qstrip-issues" style="margin-top:8px;">Quality history unavailable</div>
            `);
        });
}
