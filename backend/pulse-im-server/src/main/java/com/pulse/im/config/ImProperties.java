package com.pulse.im.config;

import com.pulse.common.util.JwtUtil;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse")
public class ImProperties {
    private Im im = new Im();
    private Jwt jwt = new Jwt();

    @Data
    public static class Im {
        private String host = "0.0.0.0";
        private int port = 9001;
        private String path = "/ws";
        private String nodeId = "im-1";
        private int heartbeatTimeoutSeconds = 90;
    }

    @Data
    public static class Jwt {
        private String secret;
        private long expireMs = 604800000L;
    }

    @Bean
    public JwtUtil jwtUtil() {
        return new JwtUtil(jwt.getSecret(), jwt.getExpireMs());
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }
}
