package com.pulse.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AppVersionService {
    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> get() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT version_code, version_name, apk_url, apk_name, apk_size,
                       release_notes, force_update, enabled, updated_at
                FROM sys_app_version WHERE id = 1
                """);
        Map<String, Object> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            out.put("versionCode", 1);
            out.put("versionName", "1.0.0");
            out.put("apkUrl", "");
            out.put("apkName", "");
            out.put("apkSize", 0L);
            out.put("releaseNotes", "");
            out.put("forceUpdate", false);
            out.put("enabled", false);
            out.put("updatedAt", null);
            return out;
        }
        Map<String, Object> row = rows.get(0);
        out.put("versionCode", row.get("version_code"));
        out.put("versionName", row.get("version_name"));
        out.put("apkUrl", row.get("apk_url"));
        out.put("apkName", row.get("apk_name"));
        out.put("apkSize", row.get("apk_size"));
        out.put("releaseNotes", row.get("release_notes"));
        out.put("forceUpdate", row.get("force_update"));
        out.put("enabled", row.get("enabled"));
        out.put("updatedAt", row.get("updated_at"));
        return out;
    }

    @Transactional
    public Map<String, Object> update(Map<String, Object> body) {
        List<Map<String, Object>> storedRows = jdbcTemplate.queryForList(
                "SELECT version_code, version_name FROM sys_app_version WHERE id = 1"
        );
        Map<String, Object> stored = storedRows.isEmpty() ? Map.of() : storedRows.get(0);
        int code = Math.max(1, Integer.parseInt(String.valueOf(stored.getOrDefault("version_code", 1))));
        // Version identity belongs to the uploaded APK. Saving release policy
        // must not let a manually supplied form value replace package metadata.
        String name = String.valueOf(stored.getOrDefault("version_name", "1.0.0")).trim();
        String url = String.valueOf(body.getOrDefault("apkUrl", "")).trim();
        String apkName = String.valueOf(body.getOrDefault("apkName", "")).trim();
        long size = Math.max(0L, Long.parseLong(String.valueOf(body.getOrDefault("apkSize", 0))));
        String notes = String.valueOf(body.getOrDefault("releaseNotes", "")).trim();
        boolean force = Boolean.TRUE.equals(body.get("forceUpdate"));
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        if (name.isEmpty()) throw new IllegalArgumentException("版本名称不能为空");
        if (enabled && url.isEmpty()) throw new IllegalArgumentException("启用更新前请上传 APK");
        jdbcTemplate.update("""
                INSERT INTO sys_app_version(id, version_code, version_name, apk_url, apk_name,
                    apk_size, release_notes, force_update, enabled, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    version_code=EXCLUDED.version_code, version_name=EXCLUDED.version_name,
                    apk_url=EXCLUDED.apk_url, apk_name=EXCLUDED.apk_name,
                    apk_size=EXCLUDED.apk_size, release_notes=EXCLUDED.release_notes,
                    force_update=EXCLUDED.force_update, enabled=EXCLUDED.enabled,
                    updated_at=EXCLUDED.updated_at
                """, code, name, url, apkName, size, notes, force, enabled, OffsetDateTime.now());
        return get();
    }

    @Transactional
    public void applyUploadedApk(Map<String, Object> uploaded) {
        int code = Math.toIntExact(Long.parseLong(String.valueOf(uploaded.get("versionCode"))));
        String versionName = String.valueOf(uploaded.getOrDefault("versionName", "")).trim();
        String url = String.valueOf(uploaded.getOrDefault("url", "")).trim();
        String apkName = String.valueOf(uploaded.getOrDefault("name", "")).trim();
        long size = Math.max(0L, Long.parseLong(String.valueOf(uploaded.getOrDefault("size", 0))));
        if (code < 1 || versionName.isEmpty() || "null".equalsIgnoreCase(versionName) || url.isEmpty()) {
            throw new IllegalArgumentException("无法读取 APK 版本信息");
        }
        jdbcTemplate.update("""
                INSERT INTO sys_app_version(id, version_code, version_name, apk_url, apk_name,
                    apk_size, release_notes, force_update, enabled, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, '', FALSE, FALSE, ?)
                ON CONFLICT (id) DO UPDATE SET
                    version_code=EXCLUDED.version_code,
                    version_name=EXCLUDED.version_name,
                    apk_url=EXCLUDED.apk_url,
                    apk_name=EXCLUDED.apk_name,
                    apk_size=EXCLUDED.apk_size,
                    updated_at=EXCLUDED.updated_at
                """, code, versionName, url, apkName, size, OffsetDateTime.now());
    }
}
