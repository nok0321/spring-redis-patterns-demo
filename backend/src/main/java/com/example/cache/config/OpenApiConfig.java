package com.example.cache.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "Redis Cache Service API",
        version = "1.0.0",
        description = """
            Redis をバックエンドとしたキャッシュ・分散ロック・Pub/Sub・レート制限・トランザクションを提供する REST API。
            Redisson 4.x / Resilience4j 2.4 / Spring Boot 4.x で構成。
            """
    ),
    servers = {
        @Server(url = "/", description = "Default server")
    }
)
public class OpenApiConfig {
}
