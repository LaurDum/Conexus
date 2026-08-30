# ── Build stage ────────────────────────────────────────────────────────────
# Pinned to JDK 11 to match <java.version>11</java.version> in pom.xml.
FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /build

# Copy the POM first so dependency resolution is cached and only re-runs when
# dependencies actually change, not on every source edit.
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B clean package -DskipTests

# ── Runtime stage ──────────────────────────────────────────────────────────
# JRE only: smaller image and no compiler shipped to production.
FROM eclipse-temurin:11-jre
WORKDIR /app

# Run as a non-root user.
RUN useradd --system --create-home --shell /usr/sbin/nologin conexus
USER conexus

COPY --from=build /build/target/conexus-backend-1.0.0.jar app.jar

# Documentation only — the platform sets $PORT and the app reads it.
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
