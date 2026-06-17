// =========================================================
// STATION CONFIGURATION PAGE (/admin/config.html)
// =========================================================

function $(id) {
    return document.getElementById(id);
}

function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
}

function populateLocation(location) {
    setValue('cfg-latitude',  location?.latitude);
    setValue('cfg-longitude', location?.longitude);
    setValue('cfg-elevation', location?.elevation);
    setValue('cfg-zoneid',    location?.zoneId);
}

function populateValidation(v) {
    setValue('cfg-temp-min',      v?.tempMinimal);
    setValue('cfg-temp-max',      v?.tempMaximum);
    setValue('cfg-temp-spike',    v?.tempSpikeLimit);
    setValue('cfg-pressure-min',  v?.pressureMinimal);
    setValue('cfg-pressure-max',  v?.pressureMaximum);
    setValue('cfg-pressure-spike',v?.pressureSpikeLimit);
    setValue('cfg-humidity-min',  v?.humidityMinimal);
    setValue('cfg-humidity-max',  v?.humidityMaximum);
    setValue('cfg-humidity-spike',v?.humiditySpikeLimit);
    setValue('cfg-wetness-wet',   v?.surfaceWetnessWetBaseline);
    setValue('cfg-wetness-dry',   v?.surfaceWetnessDryBaseline);
    setValue('cfg-wind-min',      v?.windMinimal);
    setValue('cfg-wind-max',      v?.windMaximum);
    setValue('cfg-wind-spike',    v?.windSpikeLimit);
    setValue('cfg-uv-min',        v?.uvIndexMinimal);
    setValue('cfg-uv-max',        v?.uvIndexMaximum);
    setValue('cfg-uv-spike',      v?.uvIndexSpikeLimit);
}

function populateHardware(h) {
    setValue('cfg-board',          h?.board);
    setValue('cfg-temp-sensor',    h?.temperatureSensor);
    setValue('cfg-humidity-sensor',h?.humiditySensor);
    setValue('cfg-pressure-sensor',h?.pressureSensor);
    setValue('cfg-wetness-sensor', h?.surfaceWetnessSensor);
    setValue('cfg-wind-sensor',    h?.windSensor);
    setValue('cfg-uv-sensor',      h?.uvIndexSensor);
}

function populateProviders(dataProviders) {
    const metrics = ['temperature', 'pressure', 'humidity', 'wind', 'uvIndex'];
    for (const metric of metrics) {
        const toggle = $(`prov-${metric}`);
        if (!toggle) continue;
        const current = dataProviders?.[metric] ?? 'LOCAL_SENSOR';
        toggle.querySelectorAll('.provider-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === current);
        });
    }
}

function populateAll(config) {
    populateLocation(config.location);
    populateValidation(config.validation);
    populateHardware(config.hardware);
    populateProviders(config.dataProviders);
    checkDewSourceWarning();
}

function setStatus(panel, message, isError) {
    const el = document.querySelector(`.config-status[data-status="${panel}"]`);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('success', 'error');
    if (message) el.classList.add(isError ? 'error' : 'success');
}

async function fetchConfig() {
    const response = await fetch('/api/admin/config');
    if (!response.ok) throw new Error(`Failed to load configuration (${response.status})`);
    return response.json();
}

async function loadConfig() {
    const loadingEl = $('config-loading');
    const tabsEl    = $('config-tabs');
    try {
        populateAll(await fetchConfig());
        loadingEl.hidden = true;
        tabsEl.hidden    = false;
        $('config-form-location').hidden = false;
    } catch (err) {
        loadingEl.textContent = 'Failed to load configuration.';
    }
}

async function submitConfig(panel, url, body) {
    const form = $(`config-form-${panel}`);
    const btn  = form.querySelector('.config-save-btn');

    btn.disabled = true;
    setStatus(panel, 'Saving…', false);

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            throw new Error(errorBody?.message || `Save failed (${response.status})`);
        }

        setStatus(panel, 'Saved', false);
        populateAll(await fetchConfig());
    } catch (err) {
        setStatus(panel, err.message, true);
    } finally {
        btn.disabled = false;
    }
}

function getProviderValue(metricId) {
    return $(`prov-${metricId}`)?.querySelector('.provider-btn.active')?.dataset.value
        ?? 'LOCAL_SENSOR';
}

// Replace native browser number spinners with custom UI-matched steppers.
function enhanceNumberInputs() {
    document.querySelectorAll('.config-field input[type="number"]').forEach(input => {
        const wrap = document.createElement('div');
        wrap.className = 'number-input';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const steppers = document.createElement('div');
        steppers.className = 'number-steppers';
        steppers.innerHTML =
            '<button type="button" class="num-step" data-dir="up" tabindex="-1" aria-label="Increment">▲</button>' +
            '<button type="button" class="num-step" data-dir="down" tabindex="-1" aria-label="Decrement">▼</button>';
        wrap.appendChild(steppers);

        steppers.querySelectorAll('.num-step').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.dir === 'up') input.stepUp();
                else input.stepDown();
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
    });
}

function checkDewSourceWarning() {
    const warn = $('dew-source-warn');
    if (!warn) return;
    warn.hidden = getProviderValue('temperature') === getProviderValue('humidity');
}

function initProviderToggles() {
    document.querySelectorAll('.provider-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.provider-btn');
            if (!btn) return;
            toggle.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            checkDewSourceWarning();
        });
    });
}

function initTabs() {
    const tabs   = document.querySelectorAll('.config-tab');
    const panels = document.querySelectorAll('.config-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
        });
    });
}

function initSections() {
    const tabs     = document.querySelectorAll('.section-tab');
    const sections = document.querySelectorAll('.config-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            sections.forEach(s => { s.hidden = s.dataset.section !== tab.dataset.section; });
        });
    });
}

function initForms() {
    $('config-form-location')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('location', '/api/admin/config/location', {
            lat:       Number($('cfg-latitude').value),
            lon:       Number($('cfg-longitude').value),
            elevation: Number($('cfg-elevation').value),
        });
    });

    $('config-form-validation')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('validation', '/api/admin/config/validation', {
            tempMinimal:                Number($('cfg-temp-min').value),
            tempMaximum:                Number($('cfg-temp-max').value),
            pressureMinimal:            Number($('cfg-pressure-min').value),
            pressureMaximum:            Number($('cfg-pressure-max').value),
            humidityMinimal:            Number($('cfg-humidity-min').value),
            humidityMaximum:            Number($('cfg-humidity-max').value),
            humiditySpikeLimit:         Number($('cfg-humidity-spike').value),
            tempSpikeLimit:             Number($('cfg-temp-spike').value),
            pressureSpikeLimit:         Number($('cfg-pressure-spike').value),
            surfaceWetnessWetBaseline:  parseInt($('cfg-wetness-wet').value, 10),
            surfaceWetnessDryBaseline:  parseInt($('cfg-wetness-dry').value, 10),
            windMinimal:                Number($('cfg-wind-min').value),
            windMaximum:                Number($('cfg-wind-max').value),
            windSpikeLimit:             Number($('cfg-wind-spike').value),
            uvIndexMinimal:             Number($('cfg-uv-min').value),
            uvIndexMaximum:             Number($('cfg-uv-max').value),
            uvIndexSpikeLimit:          Number($('cfg-uv-spike').value),
        });
    });

    $('config-form-hardware')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('hardware', '/api/admin/config/hardware', {
            board:                $('cfg-board').value,
            temperatureSensor:    $('cfg-temp-sensor').value,
            humiditySensor:       $('cfg-humidity-sensor').value,
            pressureSensor:       $('cfg-pressure-sensor').value,
            surfaceWetnessSensor: $('cfg-wetness-sensor').value,
            windSensor:           $('cfg-wind-sensor').value,
            uvIndexSensor:        $('cfg-uv-sensor').value,
        });
    });

    $('config-form-providers')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('providers', '/api/admin/config/providers', {
            temperature: getProviderValue('temperature'),
            pressure:    getProviderValue('pressure'),
            humidity:    getProviderValue('humidity'),
            wind:        getProviderValue('wind'),
            uvIndex:     getProviderValue('uvIndex'),
        });
    });
}

enhanceNumberInputs();
initProviderToggles();
initTabs();
initSections();
initForms();
loadConfig();
