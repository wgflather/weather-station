// dashboard-constants.js
//
// Backend enum → presentation mappings for the dashboard. Pure data, no DOM
// and no imports, so anything may depend on it without creating a cycle.
//
// Extracted from fetch-data.js because the card renderers and the popovers
// both read these, and once the popovers moved into their own module the
// alternative was duplicating the tables.

/** Per-reading quality, as `DataQuality` on the backend. */
export const DATA_QUALITY_COLORS = {
    OK:      '#22c55e',
    SPIKE:   '#f59e0b',
    ANOMALY: '#ef4444',
    MISSING: '#111827',
    // Absent hardware, not a fault: neutral slate so it reads as "nothing to
    // report here" rather than joining the red/amber failure family. Kept out
    // of QUALITY_SEVERITY deliberately — see setStatusCircleColor.
    NOT_CONFIGURED: '#64748b',
};

/** Display text for `DataQuality`; anything unlisted falls back to the raw enum name. */
export const DATA_QUALITY_LABELS = {
    NOT_CONFIGURED: 'Not configured',
};

/** Sensor freshness, as `DataStatus` on the backend — derived from lag. */
export const DATA_STATUS_COLORS = {
    LIVE:    '#22c55e',
    DELAYED: '#fcd34d',
    STALE:   '#f97316',
    OFFLINE: '#ef4444',
    EMPTY:   '#6b7280',
};

export const DATA_STATUS_INFO = {
    LIVE:    { label: 'Live',    description: 'Data is current and updating normally.' },
    DELAYED: { label: 'Delayed', description: 'Data is slightly behind — last update was 5–10 minutes ago. Current conditions may differ slightly.' },
    STALE:   { label: 'Stale',   description: 'Data has not updated in over 10 minutes. Readings may not reflect current conditions.' },
    OFFLINE: { label: 'Offline', description: 'No data received for over a day. The station may be offline or unreachable.' },
    EMPTY:   { label: 'No data', description: 'No data is available.' },
};

// Ranked so the status circle can show whichever of the two axes is worse:
// a stale OK reading and a live ANOMALY are both worth flagging, and the
// circle only has one colour to spend.
// NOT_CONFIGURED is absent from this table on purpose: it is not a point on the
// health axis, so it can neither win nor lose the comparison meaningfully. The
// status circle short-circuits on it before ranking.
export const QUALITY_SEVERITY = { OK: 0, SPIKE: 1, ANOMALY: 2, MISSING: 3 };
export const STATUS_SEVERITY  = { LIVE: 0, DELAYED: 1, STALE: 2, OFFLINE: 3, EMPTY: 3 };

export const STATUS_DOT_GLOW = {
    LIVE:    'rgba(34, 197, 94, 0.50)',
    DELAYED: 'rgba(252, 211, 77, 0.50)',
    STALE:   'rgba(249, 115, 22, 0.50)',
    OFFLINE: 'rgba(239, 68, 68, 0.50)',
};

export const PRESSURE_TREND_CONFIG = {
    RISING_FAST:  { arrow: '↑', label: 'Rapidly rising',  color: '#fca5a5' },
    RISING:       { arrow: '↑', label: 'Rising',           color: '#fcd34d' },
    RISING_SLOW:  { arrow: '↑', label: 'Slowly rising',   color: '#d1fae5' },
    STABLE:       { arrow: '→', label: 'Stable',           color: '#cbd5e1' },
    FALLING_SLOW: { arrow: '↓', label: 'Slowly falling',  color: '#bae6fd' },
    FALLING:      { arrow: '↓', label: 'Falling',          color: '#7dd3fc' },
    FALLING_FAST: { arrow: '↓', label: 'Rapidly falling', color: '#60a5fa' },
};

export const DEW_POINT_RISK_CONFIG = {
    SATURATED:   { label: 'Condensation Imminent', cssClass: 'risk-saturated' },
    VERY_LIKELY: { label: 'Condensation Likely',   cssClass: 'risk-likely'    },
    POSSIBLE:    { label: 'Condensation Possible', cssClass: 'risk-possible'  },
    UNLIKELY:    { label: 'Condensation Unlikely', cssClass: 'risk-unlikely'  },
};

export const SURFACE_WETNESS_CONFIG = {
    DRY:    { label: 'Dry',    cssClass: 'wetness-dry',    barColor: '#4ade80' },
    DAMP:   { label: 'Damp',   cssClass: 'wetness-damp',   barColor: '#facc15' },
    WET:    { label: 'Wet',    cssClass: 'wetness-wet',    barColor: '#38bdf8' },
    SOAKED: { label: 'Soaked', cssClass: 'wetness-soaked', barColor: '#818cf8' },
};

export const UV_CSS = {
    LOW: 'uv-low', MODERATE: 'uv-moderate', HIGH: 'uv-high',
    VERY_HIGH: 'uv-very-high', EXTREME: 'uv-extreme',
};

/** Long-form copy for the dew-point risk popover. */
export const DEW_POINT_RISK_INFO = {
    SATURATED: {
        title: 'Condensation Imminent',
        explanation: 'Air is nearly saturated. Moisture will form on exposed surfaces very easily.',
        surfaces: [
            'Camera lenses',
            'Telescopes and optics',
            'Car windows',
            'Grass and outdoor furniture'
        ],
        tip: 'Heavy dew, fog, or wet equipment is likely. Protect optics and electronics.'
    },

    VERY_LIKELY: {
        title: 'Condensation Likely',
        explanation: 'Humidity is very high. Surfaces that cool slightly below air temperature may become wet.',
        surfaces: [
            'Metal railings',
            'Camera gear',
            'Garden furniture',
            'Vehicle windows'
        ],
        tip: 'Expect dew overnight. Outdoor equipment may need covers or heaters.'
    },

    POSSIBLE: {
        title: 'Condensation Possible',
        explanation: 'Conditions are moderately humid. Condensation may appear on cooler surfaces.',
        surfaces: [
            'Metal surfaces in shade',
            'Optical equipment',
            'Parked vehicles'
        ],
        tip: 'Most surfaces stay dry, but dew can form after sunset.'
    },

    UNLIKELY: {
        title: 'Condensation Unlikely',
        explanation: 'The air is relatively dry and moisture formation is not expected.',
        surfaces: [],
        tip: 'Good conditions for outdoor activities and observing.'
    }
};
