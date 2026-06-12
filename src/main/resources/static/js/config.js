// =========================================================
// STATION CONFIGURATION PAGE (/admin/config.html)
// Loads /api/admin/config on page load, then allows
// editing/saving the location, validation and hardware
// sub-sections independently via their PUT endpoints.
// =========================================================

function $(id) {
    return document.getElementById(id);
}

function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
}

function populateLocation(location) {
    setValue('cfg-latitude', location?.latitude);
    setValue('cfg-longitude', location?.longitude);
    setValue('cfg-elevation', location?.elevation);
    setValue('cfg-zoneid', location?.zoneId);
}

function populateValidation(validation) {
    setValue('cfg-temp-min', validation?.tempMinimal);
    setValue('cfg-temp-max', validation?.tempMaximum);
    setValue('cfg-temp-spike', validation?.tempSpikeLimit);

    setValue('cfg-pressure-min', validation?.pressureMinimal);
    setValue('cfg-pressure-max', validation?.pressureMaximum);
    setValue('cfg-pressure-spike', validation?.pressureSpikeLimit);

    setValue('cfg-humidity-min', validation?.humidityMinimal);
    setValue('cfg-humidity-max', validation?.humidityMaximum);
    setValue('cfg-humidity-spike', validation?.humiditySpikeLimit);

    setValue('cfg-wetness-wet', validation?.surfaceWetnessWetBaseline);
    setValue('cfg-wetness-dry', validation?.surfaceWetnessDryBaseline);
}

function populateHardware(hardware) {
    setValue('cfg-board', hardware?.board);
    setValue('cfg-temp-sensor', hardware?.temperatureSensor);
    setValue('cfg-humidity-sensor', hardware?.humiditySensor);
    setValue('cfg-pressure-sensor', hardware?.pressureSensor);
    setValue('cfg-wetness-sensor', hardware?.surfaceWetnessSensor);
}

function populateAll(config) {
    populateLocation(config.location);
    populateValidation(config.validation);
    populateHardware(config.hardware);
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
    const tabsEl = $('config-tabs');

    try {
        populateAll(await fetchConfig());

        loadingEl.hidden = true;
        tabsEl.hidden = false;
        $('config-form-location').hidden = false;
    } catch (err) {
        loadingEl.textContent = 'Failed to load configuration.';
    }
}

async function submitConfig(panel, url, body) {
    const form = $(`config-form-${panel}`);
    const btn = form.querySelector('.config-save-btn');

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

        // Location changes affect the resolved timezone shown in other panels too.
        populateAll(await fetchConfig());
    } catch (err) {
        setStatus(panel, err.message, true);
    } finally {
        btn.disabled = false;
    }
}

// Replace native browser number spinners with custom, UI-matched steppers.
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

function initTabs() {
    const tabs = document.querySelectorAll('.config-tab');
    const panels = document.querySelectorAll('.config-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
        });
    });
}

function initForms() {
    $('config-form-location')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('location', '/api/admin/config/location', {
            lat: Number($('cfg-latitude').value),
            lon: Number($('cfg-longitude').value),
            elevation: Number($('cfg-elevation').value),
        });
    });

    $('config-form-validation')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('validation', '/api/admin/config/validation', {
            tempMinimal: Number($('cfg-temp-min').value),
            tempMaximum: Number($('cfg-temp-max').value),
            pressureMinimal: Number($('cfg-pressure-min').value),
            pressureMaximum: Number($('cfg-pressure-max').value),
            humidityMinimal: Number($('cfg-humidity-min').value),
            humidityMaximum: Number($('cfg-humidity-max').value),
            humiditySpikeLimit: Number($('cfg-humidity-spike').value),
            tempSpikeLimit: Number($('cfg-temp-spike').value),
            pressureSpikeLimit: Number($('cfg-pressure-spike').value),
            surfaceWetnessWetBaseline: parseInt($('cfg-wetness-wet').value, 10),
            surfaceWetnessDryBaseline: parseInt($('cfg-wetness-dry').value, 10),
        });
    });

    $('config-form-hardware')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitConfig('hardware', '/api/admin/config/hardware', {
            board: $('cfg-board').value,
            temperatureSensor: $('cfg-temp-sensor').value,
            humiditySensor: $('cfg-humidity-sensor').value,
            pressureSensor: $('cfg-pressure-sensor').value,
            surfaceWetnessSensor: $('cfg-wetness-sensor').value,
        });
    });
}

enhanceNumberInputs();
initTabs();
initForms();
loadConfig();
