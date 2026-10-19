package com.pulse.api.service;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.Session;
import com.pulse.api.dto.ContainerDataMigrationRequest;
import com.pulse.api.dto.ContainerSshRequest;
import com.pulse.common.exception.BizException;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.ListObjectsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.Result;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 通过两条临时 SSH 连接迁移 PulseIM 的数据库、上传目录和 MinIO 对象。
 *
 * <p>命令中的远程路径、容器名和数据库名全部固定；唯一动态值是服务端生成的
 * 十六进制临时任务号。源端数据不会被删除，目标端恢复前会保留一份回滚备份。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SshLegacyDataMigrationService {
    static final String CONFIRMATION = "MIGRATE_PULSEIM_LEGACY_DATA";
    private static final String DB_CONTAINER_PATTERN = "^(pulse-postgres|customer-service-chat-postgres-1)$";
    private static final String WORK_ROOT = "/tmp/pulseim-data-migration-";
    private static final long MINIO_PART_SIZE = 10L * 1024 * 1024;

    private final SshContainerControlService sshService;
    private final ContainerConfigService containerConfigService;

    private static final String DOCKER_SETUP = """
            set -eu
            if [ "$(id -u)" -eq 0 ]; then D='docker'; H='';
            elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then D='sudo -n docker'; H='sudo -n';
            else echo '当前 SSH 用户没有 Docker 或免密 sudo 权限'; exit 20; fi
            command -v docker >/dev/null 2>&1 || { echo '未找到 docker'; exit 21; }
            $D info >/dev/null
            """;

    private static final String SOURCE_PREFLIGHT = DOCKER_SETUP + """
            [ -d /opt/pulseim ] || { echo '源服务器未找到 /opt/pulseim'; exit 22; }
            [ -d /opt/pulseim/data/uploads ] || { echo '源服务器未找到 /opt/pulseim/data/uploads'; exit 23; }
            $D inspect pulse-api >/dev/null 2>&1 || { echo '源服务器未找到 pulse-api 容器'; exit 24; }
            DB_CONTAINER="$($D ps -a --format '{{.Names}}' | grep -E '^(pulse-postgres|customer-service-chat-postgres-1)$' | head -n 1 || true)"
            [ -n "$DB_CONTAINER" ] || { echo '源服务器未找到受支持的 PulseIM PostgreSQL 容器'; exit 25; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            DB_NAME="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_NAME=//p' | head -n 1)"
            DB_USER="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_USER=//p' | head -n 1)"
            [ "${DB_NAME:-pulseim}" = 'pulseim' ] || { echo '源服务器 DB_NAME 不是 pulseim，已停止以避免迁移其他数据库'; exit 26; }
            DB_USER="${DB_USER:-pulse}"
            DB_PASSWORD="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_PASSWORD=//p' | head -n 1)"
            if [ -n "$DB_PASSWORD" ]; then
              $D exec -e "PGPASSWORD=$DB_PASSWORD" "$DB_CONTAINER" pg_isready -U "$DB_USER" -d pulseim >/dev/null
            else
              $D exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d pulseim >/dev/null
            fi
            printf 'source_db_container=%s\\n' "$DB_CONTAINER"
            printf 'source_uploads_size='; $H du -sh /opt/pulseim/data/uploads | awk '{print $1}'
            echo '源服务器数据库和上传目录预检通过'
            """;

    private static final String TARGET_PREFLIGHT = DOCKER_SETUP + """
            [ -d /opt/pulseim ] || { echo '目标服务器未找到 /opt/pulseim'; exit 27; }
            [ -d /opt/pulseim/data/uploads ] || { echo '目标服务器未找到 /opt/pulseim/data/uploads'; exit 28; }
            $D inspect pulse-api >/dev/null 2>&1 || { echo '目标服务器未找到 pulse-api 容器'; exit 29; }
            DB_CONTAINER="$($D ps -a --format '{{.Names}}' | grep -E '^(pulse-postgres|customer-service-chat-postgres-1)$' | head -n 1 || true)"
            [ -n "$DB_CONTAINER" ] || { echo '目标服务器未找到受支持的 PulseIM PostgreSQL 容器'; exit 30; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            DB_NAME="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_NAME=//p' | head -n 1)"
            DB_USER="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_USER=//p' | head -n 1)"
            [ "${DB_NAME:-pulseim}" = 'pulseim' ] || { echo '目标服务器 DB_NAME 不是 pulseim，已停止以避免覆盖其他数据库'; exit 31; }
            DB_USER="${DB_USER:-pulse}"
            DB_PASSWORD="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_PASSWORD=//p' | head -n 1)"
            if [ -n "$DB_PASSWORD" ]; then
              $D exec -e "PGPASSWORD=$DB_PASSWORD" "$DB_CONTAINER" pg_isready -U "$DB_USER" -d pulseim >/dev/null
            else
              $D exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d pulseim >/dev/null
            fi
            APP_RUNNING="$($D ps --format '{{.Names}}' | grep -E '^(pulse-api|pulse-im)$' | tr '\n' ',' | sed 's/,$//' || true)"
            printf 'target_db_container=%s\\n' "$DB_CONTAINER"
            printf 'target_app_running=%s\\n' "${APP_RUNNING:-no}"
            printf 'target_free_space='; $H df -Pk /opt/pulseim | awk 'NR==2 {print $4 "K"}'
            echo '目标服务器数据库和上传目录预检通过'
            """;

    /**
     * Read only the object-storage connection details from pulse-api. Secrets
     * are consumed in memory by this request and are never put into a result
     * map or log. A container-backed MinIO endpoint is converted to the
     * published host port so that the Java process can reach it through SSH
     * local forwarding.
     */
    private static final String MINIO_DISCOVERY = DOCKER_SETUP + """
            $D inspect pulse-api >/dev/null 2>&1 || { echo '未找到 pulse-api 容器'; exit 39; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            MINIO_ENDPOINT="$(printf '%s\\n' "$ENV" | sed -n 's/^MINIO_ENDPOINT=//p' | head -n 1)"
            MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
            case "$MINIO_ENDPOINT" in
              http://*|https://*) ;;
              *) echo 'MINIO_ENDPOINT 必须是 http:// 或 https:// 地址'; exit 40;;
            esac
            MINIO_REST="${MINIO_ENDPOINT#*://}"
            MINIO_AUTHORITY="${MINIO_REST%%/*}"
            case "$MINIO_AUTHORITY" in
              \\[*\\]:*) MINIO_HOST="${MINIO_AUTHORITY%%]:*}]"; MINIO_PORT="${MINIO_AUTHORITY##*:}";;
              *:*) MINIO_HOST="${MINIO_AUTHORITY%%:*}"; MINIO_PORT="${MINIO_AUTHORITY##*:}";;
              *) MINIO_HOST="$MINIO_AUTHORITY"; case "$MINIO_ENDPOINT" in https://*) MINIO_PORT=443;; *) MINIO_PORT=80;; esac;;
            esac
            [ -n "$MINIO_HOST" ] || { echo 'MINIO_ENDPOINT 主机为空'; exit 41; }
            case "$MINIO_HOST" in
              *[[:space:]/@]*) echo 'MINIO_ENDPOINT 主机格式不正确'; exit 42;;
            esac
            MINIO_TUNNEL_HOST="$MINIO_HOST"
            MINIO_TUNNEL_PORT="$MINIO_PORT"
            if [ "$MINIO_HOST" = 'minio' ] || [ "$MINIO_HOST" = 'pulse-minio' ]; then
              [ "$($D inspect -f '{{.State.Running}}' pulse-minio 2>/dev/null || true)" = 'true' ] || { echo 'pulse-minio 容器未运行'; exit 43; }
              MINIO_TUNNEL_PORT="$($D port pulse-minio 9000/tcp 2>/dev/null | sed -n 's/.*:\\([0-9][0-9]*\\)$/\\1/p' | head -n 1)"
              [ -n "$MINIO_TUNNEL_PORT" ] || { echo 'pulse-minio 没有发布 9000 端口，无法通过 SSH 转发'; exit 44; }
              MINIO_TUNNEL_HOST='127.0.0.1'
            fi
            MINIO_ACCESS_KEY="$(printf '%s\\n' "$ENV" | sed -n 's/^MINIO_ACCESS_KEY=//p' | head -n 1)"
            MINIO_SECRET_KEY="$(printf '%s\\n' "$ENV" | sed -n 's/^MINIO_SECRET_KEY=//p' | head -n 1)"
            MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
            MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
            MINIO_BUCKET="$(printf '%s\\n' "$ENV" | sed -n 's/^MINIO_BUCKET=//p' | head -n 1)"
            MINIO_FILE_BUCKET="$(printf '%s\\n' "$ENV" | sed -n 's/^MINIO_FILE_BUCKET=//p' | head -n 1)"
            MINIO_BUCKET="${MINIO_BUCKET:-pulse-avatar}"
            MINIO_FILE_BUCKET="${MINIO_FILE_BUCKET:-pulse-files}"
            [ -n "$MINIO_BUCKET" ] && [ -n "$MINIO_FILE_BUCKET" ] || { echo 'MinIO 桶配置为空'; exit 45; }
            printf 'minio_scheme=%s\\n' "${MINIO_ENDPOINT%%://*}"
            printf 'minio_tunnel_host=%s\\n' "$MINIO_TUNNEL_HOST"
            printf 'minio_tunnel_port=%s\\n' "$MINIO_TUNNEL_PORT"
            # Kept inside the current JVM request; never returned or logged.
            printf 'minio_access_key=%s\\n' "$MINIO_ACCESS_KEY"
            printf 'minio_secret_key=%s\\n' "$MINIO_SECRET_KEY"
            printf 'minio_bucket=%s\\n' "$MINIO_BUCKET"
            printf 'minio_file_bucket=%s\\n' "$MINIO_FILE_BUCKET"
            echo 'MinIO 连接配置预检通过'
            """;

    private static final String SOURCE_PREPARE = DOCKER_SETUP + """
            WORK="/tmp/pulseim-data-migration-{RUN_ID}"
            rm -rf "$WORK"
            umask 077
            mkdir -p "$WORK"
            [ -d /opt/pulseim/data/uploads ] || { echo '源服务器未找到上传目录'; exit 23; }
            $D inspect pulse-api >/dev/null 2>&1 || { echo '源服务器未找到 pulse-api 容器'; exit 24; }
            DB_CONTAINER="$($D ps -a --format '{{.Names}}' | grep -E '^(pulse-postgres|customer-service-chat-postgres-1)$' | head -n 1 || true)"
            [ -n "$DB_CONTAINER" ] || { echo '源服务器未找到受支持的 PostgreSQL 容器'; exit 25; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            DB_NAME="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_NAME=//p' | head -n 1)"
            DB_USER="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_USER=//p' | head -n 1)"
            DB_PASSWORD="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_PASSWORD=//p' | head -n 1)"
            [ "${DB_NAME:-pulseim}" = 'pulseim' ] || { echo '源数据库不是 pulseim'; exit 26; }
            DB_USER="${DB_USER:-pulse}"
            if [ -n "$DB_PASSWORD" ]; then
              $D exec -e "PGPASSWORD=$DB_PASSWORD" "$DB_CONTAINER" pg_dump -U "$DB_USER" -d pulseim -Fc --exclude-table=sys_container_config > "$WORK/pulseim.dump"
            else
              $D exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d pulseim -Fc --exclude-table=sys_container_config > "$WORK/pulseim.dump"
            fi
            $H tar -czf "$WORK/uploads.tgz" -C /opt/pulseim/data/uploads .
            (cd "$WORK" && sha256sum pulseim.dump uploads.tgz > SHA256SUMS)
            printf 'source_work=%s\\n' "$WORK"
            printf 'source_db_dump_size='; du -h "$WORK/pulseim.dump" | awk '{print $1}'
            printf 'source_upload_archive_size='; du -h "$WORK/uploads.tgz" | awk '{print $1}'
            echo '源服务器备份文件已生成；源数据未删除'
            """;

    private static final String TARGET_PREPARE = DOCKER_SETUP + """
            WORK="/tmp/pulseim-data-migration-{RUN_ID}"
            umask 077
            rm -rf "$WORK"
            mkdir -p "$WORK"
            [ -d /opt/pulseim/data/uploads ] || { echo '目标服务器未找到上传目录'; exit 28; }
            $D inspect pulse-api >/dev/null 2>&1 || { echo '目标服务器未找到 pulse-api 容器'; exit 29; }
            DB_CONTAINER="$($D ps -a --format '{{.Names}}' | grep -E '^(pulse-postgres|customer-service-chat-postgres-1)$' | head -n 1 || true)"
            [ -n "$DB_CONTAINER" ] || { echo '目标服务器未找到受支持的 PostgreSQL 容器'; exit 30; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            DB_NAME="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_NAME=//p' | head -n 1)"
            DB_USER="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_USER=//p' | head -n 1)"
            DB_PASSWORD="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_PASSWORD=//p' | head -n 1)"
            [ "${DB_NAME:-pulseim}" = 'pulseim' ] || { echo '目标数据库不是 pulseim'; exit 31; }
            DB_USER="${DB_USER:-pulse}"
            APP_RUNNING="$($D ps --format '{{.Names}}' | grep -E '^(pulse-api|pulse-im)$' | tr '\n' ',' | sed 's/,$//' || true)"
            [ -z "$APP_RUNNING" ] || { echo '目标 pulse-api 或 pulse-im 正在运行，请先停止目标应用后再恢复旧数据'; exit 36; }
            if [ -n "$DB_PASSWORD" ]; then
              $D exec -e "PGPASSWORD=$DB_PASSWORD" "$DB_CONTAINER" pg_dump -U "$DB_USER" -d pulseim -Fc > "$WORK/target-before.dump"
            else
              $D exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d pulseim -Fc > "$WORK/target-before.dump"
            fi
            sha256sum "$WORK/target-before.dump" > "$WORK/TARGET-BACKUP.SHA256"
            printf 'target_work=%s\\n' "$WORK"
            printf 'target_backup_size='; du -h "$WORK/target-before.dump" | awk '{print $1}'
            echo '目标端恢复前备份已生成；目标应用未处理'
            """;

    private static final String TARGET_RESTORE = DOCKER_SETUP + """
            WORK="/tmp/pulseim-data-migration-{RUN_ID}"
            [ -f "$WORK/pulseim.dump" ] || { echo '目标端缺少数据库备份文件'; exit 37; }
            [ -f "$WORK/uploads.tgz" ] || { echo '目标端缺少上传目录备份文件'; exit 38; }
            (cd "$WORK" && sha256sum -c SHA256SUMS)
            DB_CONTAINER="$($D ps -a --format '{{.Names}}' | grep -E '^(pulse-postgres|customer-service-chat-postgres-1)$' | head -n 1 || true)"
            [ -n "$DB_CONTAINER" ] || { echo '目标端 PostgreSQL 容器不存在'; exit 30; }
            ENV="$($D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' pulse-api)"
            DB_USER="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_USER=//p' | head -n 1)"
            DB_PASSWORD="$(printf '%s\\n' "$ENV" | sed -n 's/^DB_PASSWORD=//p' | head -n 1)"
            DB_USER="${DB_USER:-pulse}"
            $D cp "$WORK/pulseim.dump" "$DB_CONTAINER:/tmp/pulseim-migration-{RUN_ID}.dump"
            if [ -n "$DB_PASSWORD" ]; then
              $D exec -e "PGPASSWORD=$DB_PASSWORD" "$DB_CONTAINER" pg_restore --clean --if-exists --no-owner --exit-on-error -U "$DB_USER" -d pulseim "/tmp/pulseim-migration-{RUN_ID}.dump"
            else
              $D exec "$DB_CONTAINER" pg_restore --clean --if-exists --no-owner --exit-on-error -U "$DB_USER" -d pulseim "/tmp/pulseim-migration-{RUN_ID}.dump"
            fi
            $D exec "$DB_CONTAINER" rm -f "/tmp/pulseim-migration-{RUN_ID}.dump"
            $H mkdir -p /opt/pulseim/data/uploads
            $H tar -xzf "$WORK/uploads.tgz" -C /opt/pulseim/data/uploads
            printf 'target_backup=%s\\n' "$WORK/target-before.dump"
            echo '目标数据库和上传目录恢复完成；目标应用仍保持停止'
            """;

    private static final String SOURCE_CLEANUP = """
            set -eu
            WORK="/tmp/pulseim-data-migration-%s"
            rm -rf "$WORK"
            echo '源端临时迁移文件已清理；源数据库和原上传目录保留'
            """;

    public Map<String, Object> preview(ContainerDataMigrationRequest request) {
        validateRequest(request);
        try (SshContainerControlService.SessionHandle source = open(request.source());
             SshContainerControlService.SessionHandle target = open(request.target())) {
            SshContainerControlService.CommandResult sourceResult = SshContainerControlService.execute(
                    source.session(), SOURCE_PREFLIGHT);
            requireSuccess(sourceResult, "源服务器数据预检");
            SshContainerControlService.CommandResult targetResult = SshContainerControlService.execute(
                    target.session(), TARGET_PREFLIGHT);
            requireSuccess(targetResult, "目标服务器数据预检");
            RemoteMinio sourceMinio = openMinio(source, "源服务器");
            RemoteMinio targetMinio = openMinio(target, "目标服务器");
            MinioReport sourceReport = inspectMinio(sourceMinio, true);
            MinioReport targetReport = inspectMinio(targetMinio, false);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("operation", "旧数据迁移预检");
            result.put("sourceHost", source.session().getHost());
            result.put("targetHost", target.session().getHost());
            result.put("sourceOutput", sourceResult.output());
            result.put("targetOutput", targetResult.output());
            result.put("minioSourceOutput", sourceReport.toDisplay("源服务器 MinIO"));
            result.put("minioTargetOutput", targetReport.toDisplay("目标服务器 MinIO"));
            result.put("message", "双端数据库、上传目录和 MinIO 对象预检通过；执行时会先备份目标数据库");
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("legacy data migration preview failed");
            throw new BizException("旧数据迁移预检失败：" + safeMessage(e));
        }
    }

    public Map<String, Object> migrate(ContainerDataMigrationRequest request) {
        if (request == null || !CONFIRMATION.equals(request.confirmText())) {
            throw new BizException("请输入准确的确认文字：" + CONFIRMATION);
        }
        validateRequest(request);
        String runId = UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
        String sourceWork = WORK_ROOT + runId;
        String targetWork = sourceWork;
        try (SshContainerControlService.SessionHandle source = open(request.source());
             SshContainerControlService.SessionHandle target = open(request.target())) {
            RemoteMinio sourceMinio = openMinio(source, "源服务器");
            RemoteMinio targetMinio = openMinio(target, "目标服务器");
            requireSuccess(
                    SshContainerControlService.execute(source.session(), command(SOURCE_PREPARE, runId)),
                    "源服务器备份");
            requireSuccess(
                    SshContainerControlService.execute(target.session(), command(TARGET_PREPARE, runId)),
                    "目标服务器备份");

            transfer(source.session(), target.session(), sourceWork + "/pulseim.dump", targetWork + "/pulseim.dump");
            transfer(source.session(), target.session(), sourceWork + "/uploads.tgz", targetWork + "/uploads.tgz");
            transfer(source.session(), target.session(), sourceWork + "/SHA256SUMS", targetWork + "/SHA256SUMS");

            MinioReport minioReport = migrateMinio(sourceMinio, targetMinio);

            SshContainerControlService.CommandResult restore = SshContainerControlService.execute(
                    target.session(), command(TARGET_RESTORE, runId));
            requireSuccess(restore, "目标服务器恢复");
            SshContainerControlService.CommandResult sourceCleanup = SshContainerControlService.execute(
                    source.session(), SOURCE_CLEANUP.formatted(runId));
            requireSuccess(sourceCleanup, "源服务器临时文件清理");
            containerConfigService.markMigrationReady();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("operation", "旧数据迁移");
            result.put("sourceHost", source.session().getHost());
            result.put("targetHost", target.session().getHost());
            result.put("targetBackupPath", targetWork + "/target-before.dump");
            result.put("output", restore.output());
            result.put("minio", minioReport.toMap());
            result.put("message", "PostgreSQL、上传目录和 MinIO 对象已迁移；目标应用保持停止，请启动并完成目标端健康检查后确认客户端切换");
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("legacy data migration failed for source={} target={}",
                    safeHost(request.source()), safeHost(request.target()));
            throw new BizException("旧数据迁移失败：" + safeMessage(e));
        }
    }

    private SshContainerControlService.SessionHandle open(ContainerSshRequest request) throws Exception {
        return sshService.open(request, true);
    }

    private RemoteMinio openMinio(
            SshContainerControlService.SessionHandle ssh,
            String side
    ) throws Exception {
        SshContainerControlService.CommandResult discovery = SshContainerControlService.execute(
                ssh.session(), MINIO_DISCOVERY);
        requireSuccess(discovery, side + " MinIO 预检");
        MinioConnection connection = parseMinioConnection(discovery.output(), side);
        int localPort = sshService.forwardLocalPort(
                ssh.session(), connection.tunnelHost(), connection.tunnelPort());
        String endpoint = connection.scheme() + "://127.0.0.1:" + localPort;
        MinioClient client = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(connection.accessKey(), connection.secretKey())
                .build();
        return new RemoteMinio(client, connection.avatarBucket(), connection.fileBucket());
    }

    private static MinioConnection parseMinioConnection(String output, String side) {
        Map<String, String> values = new LinkedHashMap<>();
        String rawOutput = output == null ? "" : output;
        for (String line : rawOutput.split("\\R")) {
            int separator = line.indexOf('=');
            if (separator > 0) {
                values.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
            }
        }
        String scheme = values.get("minio_scheme");
        String tunnelHost = values.get("minio_tunnel_host");
        int tunnelPort;
        try {
            tunnelPort = Integer.parseInt(values.getOrDefault("minio_tunnel_port", "0"));
        } catch (NumberFormatException e) {
            throw new BizException(side + " MinIO 转发端口不正确");
        }
        String accessKey = values.get("minio_access_key");
        String secretKey = values.get("minio_secret_key");
        String avatarBucket = values.get("minio_bucket");
        String fileBucket = values.get("minio_file_bucket");
        if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                || !StringUtils.hasText(tunnelHost) || tunnelPort < 1 || tunnelPort > 65_535
                || !StringUtils.hasText(accessKey) || !StringUtils.hasText(secretKey)
                || !validBucket(avatarBucket) || !validBucket(fileBucket)) {
            throw new BizException(side + " MinIO 配置不完整或格式不正确");
        }
        return new MinioConnection(
                scheme.toLowerCase(Locale.ROOT), tunnelHost, tunnelPort,
                accessKey, secretKey, avatarBucket, fileBucket);
    }

    private static boolean validBucket(String bucket) {
        return StringUtils.hasText(bucket)
                && bucket.length() >= 3 && bucket.length() <= 63
                && bucket.matches("[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?");
    }

    private static MinioReport inspectMinio(RemoteMinio minio, boolean source) throws Exception {
        List<BucketPlan> plans = bucketPlans(minio);
        List<BucketReport> reports = new ArrayList<>();
        for (BucketPlan plan : plans) {
            boolean exists = minio.client().bucketExists(
                    BucketExistsArgs.builder().bucket(plan.sourceBucket()).build());
            if (!exists && source) {
                throw new BizException("源 MinIO 桶不存在：" + plan.sourceBucket());
            }
            reports.add(new BucketReport(
                    plan.label(), plan.sourceBucket(), plan.targetBucket(),
                    exists ? objectStats(minio.client(), plan.sourceBucket()) : new MinioStats(0, 0, ""), exists));
        }
        return new MinioReport(reports);
    }

    private static MinioReport migrateMinio(RemoteMinio source, RemoteMinio target) throws Exception {
        List<BucketPlan> sourcePlans = bucketPlans(source);
        List<BucketPlan> targetPlans = bucketPlans(target);
        if (sourcePlans.size() != targetPlans.size()) {
            throw new BizException("源和目标 MinIO 桶配置数量不一致");
        }
        List<BucketReport> reports = new ArrayList<>();
        for (int i = 0; i < sourcePlans.size(); i++) {
            BucketPlan sourcePlan = sourcePlans.get(i);
            BucketPlan targetPlan = targetPlans.get(i);
            if (!sourcePlan.label().equals(targetPlan.label())) {
                throw new BizException("源和目标 MinIO 桶用途不一致：" + sourcePlan.label());
            }
            if (sourcePlan.sourceBucket().equals(source.fileBucket())
                    != targetPlan.targetBucket().equals(target.fileBucket())) {
                throw new BizException("源和目标 MinIO 桶拆分方式不一致，请保持头像桶和文件桶配置一致");
            }
            ensureBucket(target.client(), targetPlan.targetBucket());
            MinioStats sourceStats = objectStats(source.client(), sourcePlan.sourceBucket());
            transferBucket(source.client(), target.client(),
                    sourcePlan.sourceBucket(), targetPlan.targetBucket());
            MinioStats targetStats = objectStats(target.client(), targetPlan.targetBucket());
            if (!sourceStats.equals(targetStats)) {
                throw new BizException("MinIO " + sourcePlan.label() + " 桶校验失败：源对象 "
                        + sourceStats.count() + "/" + sourceStats.bytes() + "，目标对象 "
                        + targetStats.count() + "/" + targetStats.bytes());
            }
            reports.add(new BucketReport(
                    sourcePlan.label(), sourcePlan.sourceBucket(), targetPlan.targetBucket(),
                    sourceStats, true));
        }
        return new MinioReport(reports);
    }

    private static List<BucketPlan> bucketPlans(RemoteMinio minio) {
        List<BucketPlan> plans = new ArrayList<>();
        plans.add(new BucketPlan("头像", minio.avatarBucket(), minio.avatarBucket()));
        if (!minio.fileBucket().equals(minio.avatarBucket())) {
            plans.add(new BucketPlan("聊天文件和媒体", minio.fileBucket(), minio.fileBucket()));
        }
        return plans;
    }

    private static void ensureBucket(MinioClient client, String bucket) throws Exception {
        if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

    private static MinioStats objectStats(MinioClient client, String bucket) throws Exception {
        long count = 0;
        long bytes = 0;
        MessageDigest manifest = sha256Digest();
        for (Result<Item> result : client.listObjects(ListObjectsArgs.builder()
                .bucket(bucket).recursive(true).build())) {
            Item item = result.get();
            count++;
            bytes = Math.addExact(bytes, item.size());
            manifest.update(item.objectName().getBytes(StandardCharsets.UTF_8));
            manifest.update((byte) 0);
            manifest.update(Long.toString(item.size()).getBytes(StandardCharsets.US_ASCII));
            manifest.update((byte) '\n');
        }
        return new MinioStats(count, bytes, HexFormat.of().formatHex(manifest.digest()));
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("JVM 不支持 SHA-256", e);
        }
    }

    private static void transferBucket(
            MinioClient source,
            MinioClient target,
            String sourceBucket,
            String targetBucket
    ) throws Exception {
        for (Result<Item> result : source.listObjects(ListObjectsArgs.builder()
                .bucket(sourceBucket).recursive(true).build())) {
            Item item = result.get();
            StatObjectResponse stat = source.statObject(StatObjectArgs.builder()
                    .bucket(sourceBucket).object(item.objectName()).build());
            String contentType = StringUtils.hasText(stat.contentType())
                    ? stat.contentType() : "application/octet-stream";
            try (GetObjectResponse input = source.getObject(GetObjectArgs.builder()
                    .bucket(sourceBucket).object(item.objectName()).build())) {
                target.putObject(PutObjectArgs.builder()
                        .bucket(targetBucket)
                        .object(item.objectName())
                        .stream(input, stat.size(), MINIO_PART_SIZE)
                        .contentType(contentType)
                        .build());
            }
        }
    }

    private static void validateRequest(ContainerDataMigrationRequest request) {
        if (request == null || request.source() == null || request.target() == null) {
            throw new BizException("源服务器和目标服务器 SSH 参数不能为空");
        }
        String source = safeHost(request.source()) + ":" + port(request.source());
        String target = safeHost(request.target()) + ":" + port(request.target());
        if (source.equalsIgnoreCase(target)) {
            throw new BizException("源服务器和目标服务器不能是同一台服务器");
        }
    }

    private static int port(ContainerSshRequest request) {
        return request.port() == null ? 22 : request.port();
    }

    private static String safeHost(ContainerSshRequest request) {
        if (request == null || request.host() == null) return "";
        String host = request.host().trim();
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        return host;
    }

    private static String command(String template, String runId) {
        return template.replace("{RUN_ID}", runId);
    }

    private static void requireSuccess(SshContainerControlService.CommandResult result, String operation) {
        if (result.exitCode() != 0) {
            throw new BizException(operation + "失败：" + shorten(result.output()));
        }
    }

    private static void transfer(Session source, Session target, String sourcePath, String targetPath) throws Exception {
        ChannelSftp sourceSftp = null;
        ChannelSftp targetSftp = null;
        String partial = targetPath + ".part";
        boolean complete = false;
        try {
            sourceSftp = (ChannelSftp) source.openChannel("sftp");
            targetSftp = (ChannelSftp) target.openChannel("sftp");
            sourceSftp.connect(SshContainerControlService.CONNECT_TIMEOUT_MS);
            targetSftp.connect(SshContainerControlService.CONNECT_TIMEOUT_MS);
            try (InputStream input = sourceSftp.get(sourcePath);
                 OutputStream output = targetSftp.put(partial, ChannelSftp.OVERWRITE)) {
                input.transferTo(output);
            }
            targetSftp.rename(partial, targetPath);
            complete = true;
        } finally {
            if (!complete && targetSftp != null && targetSftp.isConnected()) {
                try {
                    targetSftp.rm(partial);
                } catch (Exception ignored) {
                    // Keep the original transfer error; the run-specific .part file is harmless.
                }
            }
            if (sourceSftp != null) sourceSftp.disconnect();
            if (targetSftp != null) targetSftp.disconnect();
        }
    }

    private static String safeMessage(Exception e) {
        String message = e.getMessage();
        if (!StringUtils.hasText(message)) return e.getClass().getSimpleName();
        return shorten(message.replaceAll("(?i)(password|passphrase|private.?key)[^,; ]*", "$1=***"));
    }

    private static String shorten(String value) {
        if (value == null) return "";
        String clean = value.trim();
        return clean.length() <= 16_000 ? clean : clean.substring(0, 16_000) + "…";
    }

    private record MinioConnection(
            String scheme,
            String tunnelHost,
            int tunnelPort,
            String accessKey,
            String secretKey,
            String avatarBucket,
            String fileBucket
    ) {
    }

    private record RemoteMinio(MinioClient client, String avatarBucket, String fileBucket) {
    }

    private record BucketPlan(String label, String sourceBucket, String targetBucket) {
    }

    private record MinioStats(long count, long bytes, String manifestSha256) {
    }

    private record BucketReport(
            String label,
            String sourceBucket,
            String targetBucket,
            MinioStats stats,
            boolean exists
    ) {
    }

    private record MinioReport(List<BucketReport> buckets) {
        private String toDisplay(String title) {
            StringBuilder output = new StringBuilder(title).append('：');
            for (BucketReport bucket : buckets) {
                output.append('\n').append("  ").append(bucket.label())
                        .append(" / ").append(bucket.sourceBucket())
                        .append("：");
                if (bucket.exists()) {
                    output.append(bucket.stats().count()).append(" 个对象，")
                            .append(bucket.stats().bytes()).append(" bytes");
                } else {
                    output.append("桶不存在，执行时自动创建");
                }
            }
            return output.toString();
        }

        private Map<String, Object> toMap() {
            List<Map<String, Object>> values = new ArrayList<>();
            for (BucketReport bucket : buckets) {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("label", bucket.label());
                value.put("sourceBucket", bucket.sourceBucket());
                value.put("targetBucket", bucket.targetBucket());
                value.put("objectCount", bucket.stats().count());
                value.put("bytes", bucket.stats().bytes());
                value.put("exists", bucket.exists());
                values.add(value);
            }
            return Map.of("buckets", values, "verified", true);
        }
    }
}
