import { initBgPreference, renderSkyBackground, getStarAltitude } from './sky-background.js';
import { initStarField, updateStarField } from './star-field.js';

/**
* Gives the login and admin pages the dashboard's sky instead of the flat #21376e that
 * :root falls back to when nothing drives the gradient.
 *
 * Two cases, same as the dashboard:
 *  - static preset  — initBgPreference() applies the stored anchor itself, and
 *                     returns early when #bg-pref-swatches is absent, so this
 *                     page gets the colours without the picker UI.
 *  - dynamic        — needs a live sun altitude, which only the dashboard live
 *                     endpoint carries (/api/astronomy/daily has the day's
 *                     events, not the current position).
 *
 * The preference is shared via localStorage, so pinning "Sunset" on the
 * dashboard pins it here too.
 */

let sunAltitude = null;

async function refreshSky() {
  try {
    const res = await fetch('/api/weather/dashboard/live');
    if (!res.ok) return;
    const live = await res.json();
    const alt = live?.sunSnapshot?.currentAltitude;
    if (alt == null) return;
    sunAltitude = alt;
    renderSkyBackground(alt);
    updateStarField(getStarAltitude(alt));
  } catch {
    // Offline or the API is down — the CSS defaults stay, which is a usable
    // page. The config form itself does not depend on this.
  }
}

initStarField();
initBgPreference({
  getSunAltitude: () => sunAltitude,
  onApplied: () => updateStarField(getStarAltitude(sunAltitude)),
});
refreshSky();

// The sun climbs at most ~15°/h, so five minutes is ~1.25° — imperceptible on
// the gradient, and far cheaper than the dashboard's 30 s poll for a page that
// is not showing live weather.
setInterval(refreshSky, 5 * 60 * 1000);
