FROM amazoncorretto:25 AS build

ARG GIT_TOKEN

RUN yum update && yum install -y git && yum install -y tar

RUN git clone https://${GIT_TOKEN}@github.com/wgflather/weather-station.git /src

WORKDIR /src

RUN ./mvnw clean package -DskipTests


FROM amazoncorretto:25-alpine-jdk
WORKDIR /src
COPY --from=build /src/target/*.jar app.jar

ENTRYPOINT ["java", "-jar", "app.jar"]