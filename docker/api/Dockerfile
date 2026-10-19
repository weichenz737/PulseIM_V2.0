FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY pulse-common/pom.xml pulse-common/pom.xml
COPY pulse-proto/pom.xml pulse-proto/pom.xml
COPY pulse-api/pom.xml pulse-api/pom.xml
COPY pulse-im-server/pom.xml pulse-im-server/pom.xml
COPY pulse-common pulse-common
COPY pulse-proto pulse-proto
COPY pulse-api pulse-api
COPY pulse-im-server pulse-im-server
RUN mvn -q -DskipTests -pl pulse-api -am package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/pulse-api/target/pulse-api-1.0.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
