FROM --platform=$BUILDPLATFORM amazoncorretto:25 AS build

WORKDIR /src

# The Maven wrapper downloads Maven as a .tar.gz and shells out to tar to
# unpack it; the corretto base ships neither tar nor gzip, and the failure
# ("failed to untar") does not mention the wrapper at all.
RUN yum install -y tar gzip && yum clean all

# Dependencies resolve in their own layer, keyed on pom.xml alone, so editing
# source doesn't re-download the whole tree on every build.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B dependency:go-offline

COPY src/ src/
RUN ./mvnw -B clean package -Dmaven.test.skip=true

# Final stage carries no --platform, so buildx resolves it per target arch.
# amazoncorretto:25-alpine-jdk publishes both amd64 and arm64 manifests.
FROM amazoncorretto:25-alpine-jdk

WORKDIR /app

# logback.xml writes logs/error-%d.log relative to the working directory.
RUN mkdir -p /app/config /app/logs

COPY --from=build /src/target/*.jar app.jar

# Runs as root, deliberately. This is a LAN-scoped self-hosted backend, and a
# non-root UID buys little here while costing a lot: a bind-mounted config
# file carries its numeric owner straight into the container, so any mismatch
# between the host file's UID and the container's makes a 600 file unreadable
# — a startup failure that reads like a broken mount.
# Anyone who wants non-root sets `user: "1001:1001"` in compose, which
# overrides this at deploy time with no rebuild.

EXPOSE 8080

# No --spring.profiles.active here on purpose: the profile is the deployer's
# call, not the image's. application.yml already defaults it to `local`, and
# compose can override via SPRING_PROFILES_ACTIVE.
ENTRYPOINT ["java", "-jar", "app.jar", "--spring.config.additional-location=optional:file:/app/config/"]
