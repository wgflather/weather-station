// chart-series.js
//
// Point-array transforms the 24-hour chart runs before handing data to
// Chart.js: gap detection, y-axis bounds, and locating the extremes.
//
// All pure — array in, array or number out. No Chart.js, no DOM.

/* =========================================================
   GAP DETECTION — inserts null sentinels into main dataset
========================================================= */
export function insertGapNulls(rawPoints, resolutionMinutes) {
    if (rawPoints.length < 2) return rawPoints;

    const result       = [];
    const gapThreshold = resolutionMinutes * 60 * 1000 * 2.5;

    for (let i = 0; i < rawPoints.length; i++) {
        result.push(rawPoints[i]);

        if (i < rawPoints.length - 1) {
            const curr = rawPoints[i].x.getTime();
            const next = rawPoints[i + 1].x.getTime();

            if (next - curr > gapThreshold) {
                result.push({ x: new Date(curr + 1000), y: null });
                result.push({ x: new Date(next - 1000), y: null });
            }
        }
    }

    return result;
}

/* =========================================================
   GAP SEGMENT EXTRACTION — builds second dataset for dashed bridge
   Covers gaps between readings, plus the "no data yet" edges
   between the start of the day / first reading and the last
   reading / now (now -> end of day is handled by the future overlay).
========================================================= */
export function extractGapSegments(rawPoints, resolutionMinutes, startRange, now) {
    if (!rawPoints.length) return [];

    const gapThreshold = resolutionMinutes * 60 * 1000 * 2.5;
    const segments     = [];

    // Leading gap: start of day -> first reading
    const first = rawPoints[0];
    if (first.x.getTime() - startRange.getTime() > gapThreshold) {
        segments.push({ x: startRange, y: first.y });
        segments.push({ x: first.x, y: first.y });
        segments.push({ x: new Date(first.x.getTime() + 1), y: null });
    }

    // Internal gaps between consecutive readings
    for (let i = 0; i < rawPoints.length - 1; i++) {
        const curr = rawPoints[i];
        const next = rawPoints[i + 1];
        const diff = next.x.getTime() - curr.x.getTime();

        if (diff > gapThreshold) {
            segments.push({ x: curr.x, y: curr.y });
            segments.push({ x: next.x, y: next.y });
            // null separator so multiple gaps don't connect
            segments.push({ x: new Date(next.x.getTime() + 1), y: null });
        }
    }

    // Trailing gap: last reading -> now
    const last = rawPoints[rawPoints.length - 1];
    if (now.getTime() - last.x.getTime() > gapThreshold) {
        segments.push({ x: last.x, y: last.y });
        segments.push({ x: now, y: last.y });
        segments.push({ x: new Date(now.getTime() + 1), y: null });
    }

    return segments;
}

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */
export function getDynamicYBounds(points, metric) {
    const real = (points || []).filter(p => p.y != null);

    if (!real.length) {
        if (metric === 'humidity') return { suggestedMin: 20,  suggestedMax: 100  };
        if (metric === 'pressure') return { suggestedMin: 990, suggestedMax: 1030 };
        if (metric === 'wind')     return { suggestedMin: 0,   suggestedMax: 15   };
        if (metric === 'uvIndex')  return { suggestedMin: 0,   suggestedMax: 10   };
        return { suggestedMin: 10, suggestedMax: 30 };
    }

    const values = real.map(p => p.y);
    const pad    = metric === 'humidity' ? 3 : 2;
    const rawMin = Math.min(...values) - pad;
    const rawMax = Math.max(...values) + pad;

    const floorAtZero = metric === 'wind' || metric === 'uvIndex';
    return {
        suggestedMin: floorAtZero ? Math.max(0, rawMin) : rawMin,
        suggestedMax: rawMax,
    };
}

/* =========================================================
   MIN / MAX INDEX (operates on real points only)
========================================================= */
export function getMinMaxPoints(points) {
    const real = (points || []).filter(p => p.y != null);
    if (!real.length) return { minIndex: -1, maxIndex: -1 };

    let minReal = 0;
    let maxReal = 0;

    real.forEach((pt, i) => {
        if (pt.y < real[minReal].y) minReal = i;
        if (pt.y > real[maxReal].y) maxReal = i;
    });

    // map back to full array indices
    const minTime = real[minReal].x.getTime();
    const maxTime = real[maxReal].x.getTime();
    const fullMin = points.findIndex(p => p.x.getTime() === minTime && p.y != null);
    const fullMax = points.findIndex(p => p.x.getTime() === maxTime && p.y != null);

    return { minIndex: fullMin, maxIndex: fullMax };
}

export function hasEnoughDataDuration(backendData) {
    if (!backendData || backendData.length < 2) return false;
    const first = new Date(backendData[0].hour).getTime();
    const last  = new Date(backendData[backendData.length - 1].hour).getTime();
    return ((last - first) / 60000) >= 90;
}

