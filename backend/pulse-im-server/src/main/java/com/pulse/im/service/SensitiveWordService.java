package com.pulse.im.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/**
 * 敏感词内存缓存：避免每条消息都查询 sys_sensitive_word。
 * 启动时加载，之后每 60 秒刷新一次，管理后台新增/停用词最长 60 秒生效。
 * 刷新失败时保留上一次的列表，不阻塞消息发送。
 */
@Component
@RequiredArgsConstructor
public class SensitiveWordService {
    private static final Logger log = LoggerFactory.getLogger(SensitiveWordService.class);

    private final JdbcTemplate jdbcTemplate;
    private volatile List<String> words = List.of();

    @PostConstruct
    public void init() {
        refresh();
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void refresh() {
        try {
            List<String> loaded = jdbcTemplate.query(
                    "SELECT word FROM sys_sensitive_word WHERE enabled = TRUE ORDER BY CHAR_LENGTH(word) DESC",
                    (rs, rowNum) -> {
                        String w = rs.getString(1);
                        return w == null ? "" : w.trim();
                    });
            words = List.copyOf(loaded);
        } catch (Exception e) {
            log.warn("refresh sensitive words failed, keep last loaded list: {}", e.getMessage());
        }
    }

    public boolean contains(String content) {
        String lower = content.toLowerCase(Locale.ROOT);
        for (String word : words) {
            if (!word.isBlank()
                    && (content.contains(word) || lower.contains(word.toLowerCase(Locale.ROOT)))) {
                return true;
            }
        }
        return false;
    }
}
