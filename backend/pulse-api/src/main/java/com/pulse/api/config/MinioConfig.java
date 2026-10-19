package com.pulse.api.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class MinioConfig {
    private final MinioProperties props;

    @Bean
    public MinioClient minioClient() {
        MinioClient client = MinioClient.builder()
                .endpoint(props.getEndpoint())
                .credentials(props.getAccessKey(), props.getSecretKey())
                .build();
        try {
            ensureBucket(client, props.getBucket());
            String fileBucket = props.getFileBucket();
            if (fileBucket != null && !fileBucket.isBlank() && !fileBucket.equals(props.getBucket())) {
                ensureBucket(client, fileBucket);
            }
        } catch (Exception e) {
            log.warn("MinIO bucket check failed (will retry on upload): {}", e.getMessage());
        }
        return client;
    }

    private void ensureBucket(MinioClient client, String bucket) throws Exception {
        if (bucket == null || bucket.isBlank()) return;
        boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            log.info("Created MinIO bucket {}", bucket);
        }
    }
}
