package com.pulse.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse.minio")
public class MinioProperties {
    private String endpoint;
    private String accessKey;
    private String secretKey;
    private String bucket;
    /** Dedicated bucket for chat files; avatar objects keep using bucket. */
    private String fileBucket;
    private String publicBaseUrl;
}
