# Configuration

Two kinds of settings, in two different places.

**Startup settings** — database URL, MQTT broker, admin login — live in
`application-local.yml` and need a restart to change. See the
[Docker reference](docker.md) for how that file reaches a container.

**Station settings** — everything below — live in the database and are edited at
`/admin/config.html` while the app runs. Saving publishes a
`ConfigurationUpdatedEvent`, the in-memory `ConfigurationCache` reloads, and the
change takes effect on the next reading. No restart.

There is exactly one row (`id = 1`). This is a single-station application.

---

## Location

Latitude, longitude and elevation. Getting these right matters more than it
looks, because they are the single source of truth for two unrelated things:

- **Open-Meteo queries** — the coordinates the forecast is fetched for.
- **Every astronomical calculation** — sunrise, sunset, twilight bands, sun and
  moon altitude curves, moon phase. These are computed locally from your
  coordinates, not fetched from anywhere, so a wrong location produces a
  confidently wrong sun.

| Setting | Range | Notes |
|---|---|---|
| `latitude` | −90 … 90 | Decimal degrees, north positive |
| `longitude` | −180 … 180 | Decimal degrees, east positive |
| `elevation` | −500 … 10000 | Metres above sea level |

The timezone is derived from the coordinates rather than set by hand, and it
drives the nightly rollup window as well as the dashboard clock.

## Data providers

Each of these five metrics is independently either `LOCAL_SENSOR` or
`EXTERNAL_API`:

`temperature` · `pressure` · `humidity` · `wind` · `uv_index`

`LOCAL_SENSOR` uses the most recent validated reading from your hardware.
`EXTERNAL_API` fetches from Open-Meteo instead, and the value is mapped into the
same shape as the sensor path — the dashboard renders both identically.

This is the setting that lets a partial station still show a full dashboard: put
the sensors you own on `LOCAL_SENSOR` and fill the gaps from the API.

Two consequences worth knowing:

- **API metrics update hourly, not live.** Open-Meteo data is hourly upstream and
  cached for 20 minutes here, so switching a metric to `EXTERNAL_API` trades
  freshness for coverage.
- **API metrics have no data quality.** They never pass through the validator, so
  they have no spike or anomaly detection and are omitted from the 24-hour
  quality strip entirely.

Surface wetness and wind direction have no provider setting — they are
sensor-only.

## Validation thresholds

These drive the quality label attached to every reading. See
[the sensor protocol](sensor-protocol.md) for what each label means.

### Range (anomaly detection)

A reading outside its min/max is stored but flagged `ANOMALY`.

| Metric | Default min | Default max |
|---|---|---|
| Temperature | −45 °C | 60 °C |
| Pressure | 940 hPa | 1060 hPa |
| Humidity | 0 % | 100 % |
| Wind | — | — |
| UV index | — | — |

Set these to the plausible range for *your site*, not the sensor's datasheet
range. A station that has never seen below −10 °C reporting −45 °C means the
sensor failed, not that it got cold.

### Spike limits

A reading is flagged `SPIKE` when it jumps more than the limit away from the
median of recent readings:

```
|current − median| > spikeLimit   →   SPIKE
```

| Metric | Default limit |
|---|---|
| Temperature | 3 |
| Pressure | 1.5 |
| Humidity | 15 |
| Wind | — |
| UV index | — |

**Spike detection is skipped if more than 10 minutes have passed since the last
stored reading.** After a gap the median is stale, so a large jump is probably a
real change rather than a glitch — flagging it would mark every reading after
every outage as a spike.

Units are whatever the metric uses: 3 means 3 °C for temperature, 15 means 15
percentage points for humidity.

## Surface wetness baselines

A resistive wetness sensor returns a raw ADC number, not a percentage. Two
calibration points convert it:

| Setting | Default | Meaning |
|---|---|---|
| `surfaceWetnessDryBaseline` | 3250 | Raw value when completely dry |
| `surfaceWetnessWetBaseline` | 150 | Raw value when completely wet |

```
percentage = (dryBaseline − clamp(raw)) / (dryBaseline − wetBaseline) × 100
```

Note the inversion: **higher raw values mean drier**. Readings are clamped to the
baselines, so 0 % and 100 % are the floor and ceiling rather than exact matches.

To calibrate: note the raw value with the sensor dry, then with it thoroughly
wet, and enter those two numbers. The defaults suit an HW-028 board and are
unlikely to be right for other hardware.

## Hardware labels

Free-text names for the board and each sensor — `ESP32-C6`, `DHT22`, `BMP180`,
`HW-028` and so on.

These are **descriptive only**. Nothing branches on them; they appear in the
metric popovers so you can see which physical device produced a number. They do
not control whether a metric is collected — that is decided by what your firmware
sends, per [the sensor protocol](sensor-protocol.md).

## API

The admin panel is a thin client over these endpoints. All require the `ADMIN`
role.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/config` | Read the whole configuration |
| `PUT` | `/api/admin/config/location` | Latitude, longitude, elevation |
| `PUT` | `/api/admin/config/providers` | Per-metric data provider |
| `PUT` | `/api/admin/config/validation` | Ranges, spike limits, wetness baselines |
| `PUT` | `/api/admin/config/hardware` | Board and sensor labels |
