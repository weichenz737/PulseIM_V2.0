package com.pulse.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class MapConfigService {
    private final JdbcTemplate jdbcTemplate;

    @Value("${pulse.map.baidu-ak:}")
    private String environmentBaiduAk;

    @Value("${pulse.map.baidu-app-ak:}")
    private String environmentBaiduAppAk;

    public Map<String, Object> getClientConfig(String platform) {
        Config config = load();
        boolean appPlatform = "android".equalsIgnoreCase(platform) || "ios".equalsIgnoreCase(platform);
        String effectiveAk = appPlatform ? effectiveAppAk(config) : effectiveWebAk(config);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("provider", "baidu");
        result.put("enabled", config.enabled());
        result.put("configured", config.enabled() && StringUtils.hasText(effectiveAk));
        result.put("ak", config.enabled() ? effectiveAk : "");
        return result;
    }

    public Map<String, Object> getAdminConfig() {
        Config config = load();
        String effectiveAk = effectiveWebAk(config);
        String effectiveAppAk = effectiveAppAk(config);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("provider", "baidu");
        result.put("enabled", config.enabled());
        result.put("ak", config.baiduAk());
        result.put("appAk", config.baiduAppAk());
        result.put("configured", config.enabled() && StringUtils.hasText(effectiveAk));
        result.put("appConfigured", config.enabled() && StringUtils.hasText(effectiveAppAk));
        result.put("source", StringUtils.hasText(config.baiduAk())
                ? "database"
                : (StringUtils.hasText(environmentBaiduAk) ? "environment" : "none"));
        result.put("appSource", StringUtils.hasText(config.baiduAppAk())
                ? "database"
                : (StringUtils.hasText(environmentBaiduAppAk) ? "environment" : "none"));
        result.put("updatedAt", config.updatedAt());
        return result;
    }

    @Transactional
    public Map<String, Object> update(boolean enabled, String baiduAk, String baiduAppAk) {
        String safeAk = baiduAk == null ? "" : baiduAk.trim();
        String safeAppAk = baiduAppAk == null ? "" : baiduAppAk.trim();
        jdbcTemplate.update("""
                INSERT INTO sys_map_config(id, enabled, baidu_ak, baidu_app_ak, updated_at)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE
                SET enabled = EXCLUDED.enabled,
                    baidu_ak = EXCLUDED.baidu_ak,
                    baidu_app_ak = EXCLUDED.baidu_app_ak,
                    updated_at = EXCLUDED.updated_at
                """, enabled, safeAk, safeAppAk, OffsetDateTime.now());
        return getAdminConfig();
    }

    private Config load() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT enabled, baidu_ak, baidu_app_ak, updated_at FROM sys_map_config WHERE id = 1"
        );
        if (rows.isEmpty()) {
            return new Config(true, "", "", null);
        }
        Map<String, Object> row = rows.get(0);
        return new Config(
                !Boolean.FALSE.equals(row.get("enabled")),
                row.get("baidu_ak") == null ? "" : String.valueOf(row.get("baidu_ak")).trim(),
                row.get("baidu_app_ak") == null ? "" : String.valueOf(row.get("baidu_app_ak")).trim(),
                row.get("updated_at")
        );
    }

    private String effectiveWebAk(Config config) {
        if (StringUtils.hasText(config.baiduAk())) {
            return config.baiduAk();
        }
        return environmentBaiduAk == null ? "" : environmentBaiduAk.trim();
    }

    private String effectiveAppAk(Config config) {
        if (StringUtils.hasText(config.baiduAppAk())) {
            return config.baiduAppAk();
        }
        if (StringUtils.hasText(environmentBaiduAppAk)) {
            return environmentBaiduAppAk.trim();
        }
        return effectiveWebAk(config);
    }

    private record Config(boolean enabled, String baiduAk, String baiduAppAk, Object updatedAt) {
    }
}
