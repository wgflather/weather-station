# Development

Running the app from source, rather than from a container.

## Prerequisites

- Java 25
- PostgreSQL with a database named `weather_station`
- An MQTT broker — optional if every metric is set to `EXTERNAL_API`

If you would rather not install PostgreSQL and a broker, the full-stack compose
provides both; see the [Docker reference](docker.md).

## Configuration

Create `src/main/resources/application-local.yml` — it is gitignored, so it never
gets committed. It needs your database URL and credentials, MQTT connection
details, and an admin username and password:

```yaml
mqtt:
  host: 192.168.0.10
  port: 1883
  protocol: tcp
  clientId: weather-station
  topic: weather/station

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/weather_station
    username: postgres
    password: your-password

user:
  username: admin
  password: your-password
```

The app will not start without `user.username` and `user.password` — it fails
with `Could not resolve placeholder 'user.username'` rather than booting with a
default login.

## Running

```bash
./mvnw spring-boot:run
```

Starts on `http://localhost:8080` with the `local` profile active. Flyway applies
any outstanding migrations at startup.

## Building and testing

```bash
./mvnw clean package                         # full build with tests
./mvnw clean package -Dmaven.test.skip=true  # skip tests
./mvnw test                                  # tests only
./mvnw test -Dtest=ClassName                 # a single test class
```

The suite needs a running Docker daemon: the full-context test provisions its own
PostgreSQL with Testcontainers, so it does not touch your local database and does
not need `application-local.yml`. Everything else is a controller slice or a
plain unit test.

## Code style

Google Java Format, enforced by Spotless. CI fails on violations, so run this
before committing:

```bash
./mvnw spotless:apply
```

## Database changes

JPA runs with `ddl-auto: validate`, so Hibernate will not alter the schema.
Any change means a new migration in `src/main/resources/db/migration/`, named
`V<n>__description.sql`. Migrations are applied in order at startup and are never
edited once committed.

Note that Hibernate's validation checks columns and types but **not**
nullability, so a `@NotNull` in an entity with no matching `NOT NULL` in a
migration will not be reported at startup.

## Architecture

`CLAUDE.md` in the repository root documents the internals in depth — every
service, the frontend module layout, the cross-module contracts, and the reasoning
behind the parts that look odd. It is the reference to read before changing
anything structural.
