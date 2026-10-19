package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 系统级文件发送参数：单文件大小上限 + 允许发送的文件类型。
 * 管理端可配置，客户端通过公开接口读取用于前端校验，服务端上传时强制生效。
 */
@Service
@RequiredArgsConstructor
public class FileConfigService {
    private static final int DEFAULT_MAX_SIZE_MB = 100;
    private static final int MAX_SIZE_LIMIT_MB = 1024;

    private final JdbcTemplate jdbcTemplate;

    /** 客户端读取的文件发送参数（登录后获取）。 */
    public Map<String, Object> getClientConfig() {
        Config config = load();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("maxSizeMb", config.maxSizeMb());
        result.put("allowedExtensions", config.allowedExtensions());
        return result;
    }

    public Map<String, Object> getAdminConfig() {
        Config config = load();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("maxSizeMb", config.maxSizeMb());
        result.put("allowedExtensions", config.allowedExtensions());
        result.put("updatedAt", config.updatedAt());
        return result;
    }

    @Transactional
    public Map<String, Object> update(int maxSizeMb, List<String> allowedExtensions) {
        int safeMax = maxSizeMb <= 0 ? DEFAULT_MAX_SIZE_MB : Math.min(maxSizeMb, MAX_SIZE_LIMIT_MB);
        List<String> normalized = new ArrayList<>();
        if (allowedExtensions != null) {
            for (String raw : allowedExtensions) {
                String ext = normalizeExtension(raw);
                if (ext != null && !normalized.contains(ext)) normalized.add(ext);
            }
        }
        jdbcTemplate.update("""
                INSERT INTO sys_file_config(id, max_size_mb, allowed_extensions, updated_at)
                VALUES (1, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    max_size_mb = EXCLUDED.max_size_mb,
                    allowed_extensions = EXCLUDED.allowed_extensions,
                    updated_at = EXCLUDED.updated_at
                """, safeMax, String.join(",", normalized), OffsetDateTime.now());
        return getAdminConfig();
    }

    /** 上传/发送文件前的统一校验：大小上限 + 允许类型，不通过直接抛错。 */
    public void assertFileAllowed(String fileName, String contentType, long size) {
        Config config = load();
        long maxBytes = (long) config.maxSizeMb() * 1024 * 1024;
        if (size > maxBytes) {
            throw new BizException("文件不能超过 " + config.maxSizeMb() + "MB");
        }
        List<String> allowed = config.allowedExtensions();
        if (allowed.isEmpty()) return;

        String ext = extensionOf(fileName);
        if (ext != null) {
            if (allowed.contains(ext)) return;
            throw new BizException("仅支持发送 " + describeAllowed(allowed) + " 类型的文件");
        }
        // 文件名无扩展名时，尝试用 Content-Type 的子类型兜底
        String subtype = contentTypeSubtype(contentType);
        if (subtype != null && allowed.contains(subtype)) return;
        throw new BizException("仅支持发送 " + describeAllowed(allowed) + " 类型的文件");
    }

    private static String describeAllowed(List<String> allowed) {
        StringBuilder sb = new StringBuilder();
        for (String ext : allowed) {
            if (sb.length() > 0) sb.append("、");
            sb.append(ext);
        }
        return sb.toString();
    }

    private static String extensionOf(String name) {
        if (!StringUtils.hasText(name)) return null;
        String lower = name.trim().toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0 || dot >= lower.length() - 1) return null;
        String ext = lower.substring(dot + 1);
        return ext.length() > 12 ? null : ext;
    }

    private static String contentTypeSubtype(String contentType) {
        if (!StringUtils.hasText(contentType)) return null;
        String subtype = contentType.toLowerCase(Locale.ROOT).split("/", 2)[1].split(";", 2)[0].trim();
        if (subtype.isEmpty() || "octet-stream".equals(subtype)) return null;
        // image/jpeg 的扩展名通常写作 jpg
        return "jpeg".equals(subtype) ? "jpg" : subtype;
    }

    private static String normalizeExtension(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith(".")) value = value.substring(1);
        if (value.isEmpty() || value.length() > 12 || !value.matches("[a-z0-9]+")) return null;
        return value;
    }

    private Config load() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT max_size_mb, allowed_extensions, updated_at
                FROM sys_file_config
                WHERE id = 1
                """);
        if (rows.isEmpty()) return new Config(DEFAULT_MAX_SIZE_MB, List.of(), null);
        Map<String, Object> row = rows.get(0);
        int maxSizeMb = row.get("max_size_mb") == null
                ? DEFAULT_MAX_SIZE_MB
                : ((Number) row.get("max_size_mb")).intValue();
        List<String> extensions = new ArrayList<>();
        String raw = String.valueOf(row.get("allowed_extensions") == null ? "" : row.get("allowed_extensions"));
        for (String part : raw.split(",")) {
            String ext = normalizeExtension(part);
            if (ext != null && !extensions.contains(ext)) extensions.add(ext);
        }
        return new Config(maxSizeMb, extensions, row.get("updated_at"));
    }

    private record Config(int maxSizeMb, List<String> allowedExtensions, Object updatedAt) {
    }
}
