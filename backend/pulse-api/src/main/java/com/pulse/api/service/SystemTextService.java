package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SystemTextService {
    private static final Set<String> KEYS = Set.of("privacy_policy", "service_terms", "community_join_agreement", "community_create_agreement", "account_deletion_agreement");
    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> get(String key) {
        String normalized = normalizeKey(key);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT config_key, title, content, updated_at FROM sys_text_config WHERE config_key = ?",
                normalized
        );
        if (rows.isEmpty()) {
            return Map.of("key", normalized, "title", defaultTitle(normalized), "content", "");
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("key", row.get("config_key"));
        result.put("title", row.get("title"));
        result.put("content", row.get("content"));
        result.put("updatedAt", row.get("updated_at"));
        return result;
    }

    public List<Map<String, Object>> list() {
        return KEYS.stream().sorted().map(this::get).toList();
    }

    @Transactional
    public Map<String, Object> update(String key, String title, String content) {
        String normalized = normalizeKey(key);
        String safeTitle = StringUtils.hasText(title) ? title.trim() : defaultTitle(normalized);
        if (safeTitle.length() > 128) {
            throw new BizException("标题过长");
        }
        String safeContent = content == null ? "" : content;
        jdbcTemplate.update("""
                INSERT INTO sys_text_config(config_key, title, content, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (config_key) DO UPDATE
                SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
                """, normalized, safeTitle, safeContent, OffsetDateTime.now());
        return get(normalized);
    }

    private static String normalizeKey(String key) {
        String normalized = key == null ? "" : key.trim().toLowerCase().replace('-', '_');
        if (!KEYS.contains(normalized)) {
            throw new BizException("不支持的系统文本类型");
        }
        return normalized;
    }

    private static String defaultTitle(String key) {
        return switch (key) {
            case "privacy_policy" -> "隐私政策";
            case "service_terms" -> "服务条款";
            case "community_create_agreement" -> "圈子创建协议";
            case "account_deletion_agreement" -> "账号注销协议";
            default -> "圈子加入协议";
        };
    }
}
