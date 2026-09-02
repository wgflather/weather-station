# Sensor Protocol

Firmware publishes one JSON object per reading to the configured MQTT topic. The same shape is accepted by `POST /api/weather`.

```json
{
  "deviceId": "station-1",
  "temperature": 21.5,
  "pressure": 1013.2,
  "humidity": 55.0,
  "surfaceWetness": 12.0,
  "wind": 3.4,
  "wind_direction": 210.0,
  "uv_index": 2.1,
  "WIFI_RSSI": -58.0
}
```

| Field | Unit | Required |
|---|---|---|
| `deviceId` | — | yes |
| `WIFI_RSSI` | dBm | no |
| `temperature` | °C | no |
| `pressure` | hPa | no |
| `humidity` | % | no |
| `surfaceWetness` | % | no |
| `wind` | m/s | no |
| `wind_direction` | ° (0–360) | no |
| `uv_index` | UV index | no |

`deviceId` is the only mandatory field. `WIFI_RSSI` is a link-quality diagnostic rather than a weather measurement — it is stored with the reading but not currently surfaced anywhere in the UI, and a station on Ethernet or behind a serial gateway can simply omit it.

Field naming is inconsistent for historical reasons — most metrics are camelCase, but `wind_direction`, `uv_index` and `WIFI_RSSI` are not. Send them exactly as spelled above.

## The three states a metric can be in

Each metric field carries one of three meanings, and the distinction matters — it is what separates *broken hardware* from *hardware you never fitted*:

| Send | Means | Recorded as |
|---|---|---|
| a number | the sensor took a reading | validated (see below) |
| `null` | the sensor is fitted but failed to read | `MISSING` |
| omit the field entirely | the station has no such sensor | `NOT_CONFIGURED` |

Omitting a field is the supported way to run a partial station. A station with only a thermometer sends `deviceId` and `temperature`, and the remaining six metrics report as `NOT_CONFIGURED` rather than appearing broken. **Do not send `null` for a sensor you do not have** — that reads as a fitted sensor failing on every single reading.

A field's state may vary between readings; nothing is cached from a previous message.

## How a numeric reading is graded

A value that arrives as a number is passed to `DataQualityValidator` and comes out as one of:

| Quality | Meaning |
|---|---|
| `OK` | within range, and not a spike against the recent median |
| `ANOMALY` | outside the configured min/max for that metric |
| `SPIKE` | plausible on its own, but too far from the median of recent readings |
| `MISSING` | `NaN` or infinite |

Ranges and spike limits are per-station and editable in the admin panel; `wind_direction` is fixed at 0–360. Note that firmware using *numeric* sentinels for a failed read — `-999`, `65535` — will be graded `ANOMALY`, not `MISSING`, since those are valid numbers outside the plausible range. Prefer `null`.

## Values outside the contract

The parser is deliberately lenient, because MQTT ingest is a trust boundary: a deserialization failure aborts the whole message, so one malformed field would discard every other metric in that reading.

Anything that is not a number degrades **that field alone** to `MISSING`; the rest of the reading is stored normally. These spellings are accepted quietly, as sensor libraries commonly emit them:

- `""` or a blank string
- `"NaN"`, `"Infinity"`, `"-Infinity"`
- a quoted number, e.g. `"21.5"`

Anything else — `"n/a"`, `"--"`, lowercase `"nan"`, a comma decimal separator like `"21,5"`, a boolean, an object, an array — is also recorded as `MISSING`, but logs a `[PAYLOAD_UNPARSEABLE]` warning naming the field and the offending value. Those warnings mean the firmware is off-contract and should be fixed; do not rely on the safety net.

