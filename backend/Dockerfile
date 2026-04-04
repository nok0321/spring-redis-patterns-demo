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

# OpenTelemetry Java Agent (with SHA-256 integrity check)
ARG OTEL_AGENT_VERSION=2.25.0
ARG OTEL_AGENT_SHA256=d6e809824176cf88792db359a9d928281ba2102fa8755453c1940f6c0289e396
RUN --mount=type=cache,target=/tmp/otel-cache \
    if [ ! -f /tmp/otel-cache/opentelemetry-javaagent-${OTEL_AGENT_VERSION}.jar ]; then \
      wget -q -O /tmp/otel-cache/opentelemetry-javaagent-${OTEL_AGENT_VERSION}.jar \
        "https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_AGENT_VERSION}/opentelemetry-javaagent.jar"; \
    fi && \
    cp /tmp/otel-cache/opentelemetry-javaagent-${OTEL_AGENT_VERSION}.jar otel-agent.jar && \
    echo "${OTEL_AGENT_SHA256}  otel-agent.jar" | sha256sum -c -

COPY --from=builder /app/build/libs/cache-service.jar app.jar

RUN addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app
USER app

EXPOSE 8080
ENTRYPOINT ["java", \
  "-javaagent:otel-agent.jar", \
  "-XX:MaxRAMPercentage=75", \
  "-jar", "app.jar"]
