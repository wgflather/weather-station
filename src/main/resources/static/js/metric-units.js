// metric-units.js
//
// The one place a metric's display unit is written down. The history modal, its
// summary cards and the daily chart all render the same numbers, and each had its
// own copy — so adding a metric meant editing three files and the axis could end
// up disagreeing with the card above it.
//
// The leading space on pressure is deliberate: "1013 hPa" reads correctly while
// "21.5°C" and "62%" do not want one.

export const METRIC_UNITS = {
    temperature: '°C',
    pressure:    ' hPa',
    humidity:    '%',
};

/** The unit for a metric, or an empty string for one that has none configured yet. */
export function unitFor(metric) {
    return METRIC_UNITS[metric] ?? '';
}

/** A value with its unit, to one decimal, or an en dash when absent. */
export function formatMetricValue(value, metric) {
    return value != null ? `${Number(value).toFixed(1)}${unitFor(metric)}` : '–';
}
