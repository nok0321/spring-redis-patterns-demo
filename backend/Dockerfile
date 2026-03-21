# Stage 1: Build
FROM gradle:8.14-jdk21-alpine AS builder
WORKDIR /app
COPY settings.gradle.kts build.gradle.kts ./
RUN gradle dependencies --no-daemon
COPY src/ src/
RUN gradle bootJar --no-daemon

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# OpenTelemetry Java Agent
ARG OTEL_AGENT_VERSION=2.25.0
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_AGENT_VERSION}/opentelemetry-javaagent.jar otel-agent.jar

COPY --from=builder /app/build/libs/cache-service.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", \
  "-javaagent:otel-agent.jar", \
  "-XX:MaxRAMPercentage=75", \
  "-jar", "app.jar"]
