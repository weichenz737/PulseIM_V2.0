package com.pulse.im.config;

import com.pulse.common.constant.RedisKeys;
import com.pulse.im.service.ImPushService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@Configuration
@RequiredArgsConstructor
public class RedisPushConfig {
    private final ImPushService imPushService;

    @Bean(destroyMethod = "shutdownNow")
    public Executor imPushTaskExecutor() {
        return Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "im-push-worker");
            t.setDaemon(true);
            return t;
        });
    }

    @Bean
    RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory factory,
            Executor imPushTaskExecutor) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.setTaskExecutor(imPushTaskExecutor);
        container.addMessageListener(imPushService, new ChannelTopic(RedisKeys.IM_PUSH_CHANNEL));
        return container;
    }
}
