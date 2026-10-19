package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 系统容器配置与迁移状态。
 *
 * <p>这里仅保存管理员明确登记的目标地址和迁移状态；SSH 凭据只随当前操作
 * 临时传递，不落库、不写入迁移状态。</p>
 */
@Service
@RequiredArgsConstructor
public class ContainerConfigService {
    private static final int MAX_ORIGIN_LENGTH = 512;
    private static final String IDLE = "IDLE";
    private static final String PREPARED = "PREPARED";
    private static final String READY = "READY";
    private static final String ACTIVE = "ACTIVE";

    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getAdminConfig(String currentServerOrigin) {
        Config config = load();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("currentServerOrigin", normalizeDisplayOrigin(currentServerOrigin));
        result.put("targetServerOrigin", config.targetServerOrigin());
        result.put("targetConfigured", StringUtils.hasText(config.targetServerOrigin()));
        result.put("migrateLegacyData", config.migrateLegacyData());
        result.put("migrationStatus", config.migrationStatus());
        result.put("migrationMessage", config.migrationMessage());
        result.put("migrationStartedAt", config.migrationStartedAt());
        result.put("migrationUpdatedAt", config.migrationUpdatedAt());
        result.put("updatedAt", config.updatedAt());
        result.put("controlMode", "DIRECT_SSH");
        result.put("agentConnected", false);
        result.put("credentialsStored", false);
        result.put("sharedResourcesProtected", true);
        result.put("cleanupScope", List.of(
                "PulseIM 专属应用容器（停止并删除）",
                "老服务器上的 PulseIM 容器清理预览结果"
        ));
        result.put("protectedScope", List.of(
                "服务器操作系统和 Docker",
                "其他项目容器",
                "共享 PostgreSQL、Redis 和 Docker 网络",
                "数据库、聊天文件和上传文件（当前始终保留）",
                "PulseIM 项目目录、镜像和部署产物（当前始终保留）"
        ));
        result.put("dataMigrationScope", List.of(
                "PostgreSQL PulseIM 业务数据库",
                "/opt/pulseim/data/uploads 上传目录",
                "MinIO 对象存储（头像、聊天文件和媒体，按两端 pulse-api 配置自动复制并校验）"
        ));
        result.put("dataMigrationExcludedScope", List.of(
                "Redis 缓存、在线状态、登录会话和临时队列",
                "ASR 模型缓存",
                "服务器系统、Docker 和其他项目数据"
        ));
        return result;
    }

    /**
     * Public bootstrap configuration for packaged clients. The target address
     * is not exposed until an administrator explicitly activates the switch.
     */
    public Map<String, Object> getDiscoveryConfig(String currentServerOrigin) {
        Config config = load();
        String origin = ACTIVE.equals(config.migrationStatus())
                && StringUtils.hasText(config.targetServerOrigin())
                ? config.targetServerOrigin()
                : normalizeDisplayOrigin(currentServerOrigin);
        return Map.of(
                "serverOrigin", origin,
                "migrationStatus", config.migrationStatus()
        );
    }

    @Transactional
    public Map<String, Object> updateTarget(String currentServerOrigin, String targetServerOrigin) {
        return updateTarget(currentServerOrigin, targetServerOrigin, null);
    }

    @Transactional
    public Map<String, Object> updateTarget(
            String currentServerOrigin,
            String targetServerOrigin,
            Boolean migrateLegacyData
    ) {
        String normalized = normalizeAndValidateOrigin(targetServerOrigin);
        Config existing = load();
        boolean migrate = migrateLegacyData == null ? existing.migrateLegacyData() : migrateLegacyData;
        jdbcTemplate.update("""
                INSERT INTO sys_container_config(
                    id, target_server_origin, migrate_legacy_data, migration_status, migration_message,
                    migration_started_at, migration_updated_at, updated_at
                )
                VALUES (1, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    target_server_origin = EXCLUDED.target_server_origin,
                    migrate_legacy_data = EXCLUDED.migrate_legacy_data,
                    migration_status = EXCLUDED.migration_status,
                    migration_message = EXCLUDED.migration_message,
                    migration_started_at = NULL,
                    migration_updated_at = EXCLUDED.migration_updated_at,
                    updated_at = EXCLUDED.updated_at
                """, normalized, migrate, IDLE, "目标服务器地址已保存，尚未执行迁移。", OffsetDateTime.now(), OffsetDateTime.now());
        return getAdminConfig(currentServerOrigin);
    }

    @Transactional
    public Map<String, Object> prepareMigration(String currentServerOrigin) {
        Config config = load();
        if (!StringUtils.hasText(config.targetServerOrigin())) {
            throw new BizException("请先填写并保存新服务器地址");
        }
        OffsetDateTime now = OffsetDateTime.now();
        String message = config.migrateLegacyData()
                ? "已选择迁移旧数据：PostgreSQL 数据库、/opt/pulseim/data/uploads 和 MinIO 对象纳入迁移计划；Redis 缓存和会话不迁移。当前尚未执行复制。"
                : "未选择迁移旧数据：当前只准备应用迁移，不复制老服务器数据库和 /opt/pulseim/data/uploads。";
        jdbcTemplate.update("""
                UPDATE sys_container_config
                SET migration_status = 'PREPARED',
                    migration_message = ?,
                    migration_started_at = ?,
                    migration_updated_at = ?,
                    updated_at = ?
                WHERE id = 1
                """, message, now, now, now);
        return getAdminConfig(currentServerOrigin);
    }

    @Transactional
    public Map<String, Object> activateMigration(String currentServerOrigin) {
        Config config = load();
        if (!StringUtils.hasText(config.targetServerOrigin())) {
            throw new BizException("请先填写并保存新服务器地址");
        }
        if (!PREPARED.equals(config.migrationStatus()) && !READY.equals(config.migrationStatus())) {
            throw new BizException("请先完成迁移准备或旧数据迁移，再执行客户端切换");
        }
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update("""
                UPDATE sys_container_config
                SET migration_status = 'ACTIVE',
                    migration_message = ?,
                    migration_updated_at = ?,
                    updated_at = ?
                WHERE id = 1
                """, "客户端动态发现已切换到新服务器；旧服务器项目仍需单独确认清理。", now, now);
        return getAdminConfig(currentServerOrigin);
    }

    @Transactional
    public void markMigrationReady() {
        Config config = load();
        if (!StringUtils.hasText(config.targetServerOrigin())) return;
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update("""
                UPDATE sys_container_config
                SET migration_status = 'READY',
                    migration_message = ?,
                    migration_updated_at = ?,
                    updated_at = ?
                WHERE id = 1
                """, "旧数据迁移完成；请启动并完成新服务器健康检查，再确认切换客户端。", now, now);
    }

    public boolean legacyDataMigrationEnabled() {
        return load().migrateLegacyData();
    }

    /**
     * Prevent the destructive old-project cleanup from being pointed at the
     * registered migration target. The current server is intentionally not
     * blocked here because, during a migration, it is the old server that
     * must eventually be cleaned up.
     */
    public void assertCleanupSourceIsNotTarget(String sshHost) {
        String sourceHost = normalizeHostForComparison(sshHost);
        String targetHost = originHost(load().targetServerOrigin());
        if (StringUtils.hasText(sourceHost) && StringUtils.hasText(targetHost)
                && sourceHost.equals(targetHost)) {
            throw new BizException("为防止误删，老服务器清理地址不能是已登记的新服务器地址");
        }
    }

    private Config load() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT target_server_origin, migrate_legacy_data, migration_status, migration_message,
                       migration_started_at, migration_updated_at, updated_at
                FROM sys_container_config
                WHERE id = 1
                """);
        if (rows.isEmpty()) {
            return new Config("", false, IDLE, "", null, null, null);
        }
        Map<String, Object> row = rows.get(0);
        return new Config(
                value(row.get("target_server_origin")),
                booleanValue(row.get("migrate_legacy_data")),
                StringUtils.hasText(value(row.get("migration_status")))
                        ? value(row.get("migration_status")) : IDLE,
                value(row.get("migration_message")),
                row.get("migration_started_at"),
                row.get("migration_updated_at"),
                row.get("updated_at")
        );
    }

    private static String normalizeAndValidateOrigin(String raw) {
        String value = normalizeDisplayOrigin(raw);
        if (!StringUtils.hasText(value)) {
            throw new BizException("请输入新服务器地址");
        }
        if (value.length() > MAX_ORIGIN_LENGTH) {
            throw new BizException("服务器地址过长");
        }
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException e) {
            throw new BizException("服务器地址格式不正确");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new BizException("服务器地址必须以 http:// 或 https:// 开头");
        }
        if (!StringUtils.hasText(uri.getHost()) || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null) {
            throw new BizException("服务器地址必须是合法的 HTTP(S) 根地址");
        }
        return value;
    }

    private static String normalizeDisplayOrigin(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("/+$", "");
    }

    private static String originHost(String origin) {
        if (!StringUtils.hasText(origin)) return "";
        try {
            return normalizeHostForComparison(URI.create(origin).getHost());
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private static String normalizeHostForComparison(String raw) {
        if (!StringUtils.hasText(raw)) return "";
        String host = raw.trim();
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        return host.toLowerCase(Locale.ROOT);
    }

    private static String value(Object raw) {
        return raw == null ? "" : String.valueOf(raw).trim();
    }

    private static boolean booleanValue(Object raw) {
        if (raw instanceof Boolean value) return value;
        return Boolean.parseBoolean(value(raw));
    }

    private record Config(
            String targetServerOrigin,
            boolean migrateLegacyData,
            String migrationStatus,
            String migrationMessage,
            Object migrationStartedAt,
            Object migrationUpdatedAt,
            Object updatedAt
    ) {
    }
}
