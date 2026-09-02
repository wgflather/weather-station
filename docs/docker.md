# Docker Reference

Full deployment reference. For the two-command quickstart, see the [README](../README.md#running-with-docker).

Two deployment modes share one image. Pick by what your machine already runs.

| Mode | Files | Use when |
|---|---|---|
| **Full stack** | `docker-compose.yml` + `docker-compose.full.yml` | Nothing set up yet — brings its own PostgreSQL and Mosquitto |
| **App only** | `docker-compose.yml` | You already run PostgreSQL and an MQTT broker (e.g. alongside Home Assistant) |

Images are published to `ghcr.io/wgflather/weather-station` for `linux/amd64` and `linux/arm64`, so the same tag runs on a Raspberry Pi and on a normal x86 box.

## Mode 1 — Full stack

Everything included; nothing to install but Docker.

```bash
cp .env.example .env      # then edit POSTGRES_PASSWORD and ADMIN_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d
```

`.env` must set `POSTGRES_PASSWORD` and `ADMIN_PASSWORD`. Compose refuses to start
without them rather than falling back to a default — a station reachable with a
guessable admin password is worse than one that did not start.

The app waits for PostgreSQL to report healthy before booting, because Flyway runs
its migrations during startup and must not race the database.

## Mode 2 — App only

Bring your own PostgreSQL and broker. Connection details come from a config file
you mount in — they are never baked into the image:

```
weather-station/
├── docker-compose.yml
└── config/
    └── application-local.yml
```

```bash
docker compose pull && docker compose up -d
```

Use `src/main/resources/application-local.yml` as the template — same file, same
shape. **The filename matters**: the container loads `/app/config/` as a config
directory, so only `application.yml` and `application-<active-profile>.yml` are
read. The active profile is `local` by default, so `application-local.yml` is
picked up and `application-pi.yml` would be silently ignored.

This mode deliberately injects no `SPRING_DATASOURCE_*` or `MQTT_*` environment
variables. Spring Boot ranks environment variables **above** external config
files, so setting them here would silently override the file you just mounted.

## Building the image locally

Published images come from CI, but you can build the same thing yourself:

```bash
docker build -t ghcr.io/wgflather/weather-station:latest .
```

Tagging it with the full name means compose uses your local build instead of
pulling. The build cross-compiles rather than emulating: the Maven stage is
pinned to the builder's own architecture, which is safe because a jar is
architecture-neutral, and only the JRE layer varies per target.

## Verifying it works

```bash
docker compose ps                                   # all services healthy?
curl http://localhost:8080/actuator/health          # {"status":"UP"}
curl -I http://localhost:8080/                      # 302 -> /weather (expected)
docker compose logs -f weather-station              # follow startup
```

End-to-end check — publish a reading and confirm it lands (full-stack mode):

```bash
docker exec weather-mosquitto mosquitto_pub -h localhost -t weather/station -m '{"deviceId":"smoke-test","temperature":21.5,"pressure":1013.2,"humidity":55.0,"WIFI_RSSI":-58.0}'

curl http://localhost:8080/api/weather/dashboard/live
```

The dashboard should show the value within a poll cycle. Metrics you omit report
`NOT_CONFIGURED`, not `MISSING` — see the [sensor protocol](sensor-protocol.md).

## Updating

```bash
docker compose pull && docker compose up -d
```

Only the changed layers download. Data survives in named volumes; `down -v`
destroys them, plain `down` does not.

## Troubleshooting

**`localhost` in the config file resolves to the container, not your machine.**
The most common app-only failure: a datasource URL of
`jdbc:postgresql://localhost:5432/...` makes the app look for PostgreSQL *inside
its own container*. Use the host's LAN IP, or `host.docker.internal` — which needs
an extra line on Linux:

```yaml
services:
  weather-station:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

**Port already in use.** Set `APP_PORT` (and `MQTT_HOST_PORT` in full-stack mode)
in `.env`; both are host-side only and change nothing inside the container.

**App exits with `Could not resolve placeholder 'user.username'`.** It found no
config: the `config/` directory is missing, empty, or the file is named for a
profile that is not active. Docker silently creates an empty directory if it does
not exist, so a typo in the path looks identical to a missing file.

**Config file unreadable.** The container runs as root by default, so host file
permissions are not normally an issue. If you override with `user:` in compose,
the bind-mounted file's numeric owner must match that UID — bind mounts pass UIDs
straight through without translation.

**Build fails with `failed to untar`.** The Maven wrapper downloads Maven as a
`.tar.gz` and shells out to `tar`; the build stage installs `tar` and `gzip`
because the Corretto base image ships neither.

