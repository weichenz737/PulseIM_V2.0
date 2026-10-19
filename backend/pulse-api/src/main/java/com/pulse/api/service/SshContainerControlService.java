package com.pulse.api.service;

import com.pulse.api.dto.ContainerCleanupRequest;
import com.pulse.api.dto.ContainerSshRequest;
import com.pulse.common.exception.BizException;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 受限的 SSH 容器控制器。
 *
 * <p>凭据只在当前请求期间使用；远程命令全部是源码内固定的白名单命令，
 * 不接受管理员拼接 shell。清理操作只处理精确的 PulseIM 容器名，默认不碰
 * 数据库、Redis、上传文件、共享网络和其他容器。</p>
 */
@Slf4j
@Service
public class SshContainerControlService {
    private static final int DEFAULT_PORT = 22;
    static final int CONNECT_TIMEOUT_MS = 12_000;
    static final int COMMAND_TIMEOUT_MS = 30_000;
    private static final int MAX_SECRET_LENGTH = 128 * 1024;
    private static final String CLEANUP_CONFIRMATION = "确认清理旧服务器项目";

    private static final String DOCKER_SETUP = """
            set -eu
            if [ "$(id -u)" -eq 0 ]; then D='docker';
            elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then D='sudo -n docker';
            else echo '当前 SSH 用户没有 Docker 或免密 sudo 权限'; exit 20; fi
            command -v docker >/dev/null 2>&1 || { echo '未找到 docker'; exit 21; }
            $D info >/dev/null
            """;

    private static final String PREFLIGHT_COMMAND = DOCKER_SETUP + """
            printf 'user='; id -un
            printf 'project_root='; if [ -d /opt/pulseim ]; then echo present; else echo missing; fi
            printf 'pulseim_containers='
            $D ps -a --format '{{.Names}}' | grep -E '^(pulse-api|pulse-im|pulse-mobile|pulse-admin|pulse-asr|pulse-coturn|pulse-minio|pulse-nginx)$' | tr '\n' ',' | sed 's/,$//' || true
            echo
            echo '目标服务器 SSH、Docker 和 PulseIM 项目目录预检通过'
            """;

    private static final String CLEANUP_PREVIEW_COMMAND = DOCKER_SETUP + """
            [ -d /opt/pulseim ] || { echo '未找到 /opt/pulseim，已停止预览以避免误操作'; exit 22; }
            printf 'containers='
            $D ps -a --format '{{.Names}}' | grep -E '^(pulse-api|pulse-im|pulse-mobile|pulse-admin|pulse-asr|pulse-coturn|pulse-minio|pulse-nginx)$' | tr '\n' ',' | sed 's/,$//' || true
            echo
            echo '将只处理上述精确匹配的 PulseIM 容器'
            echo '将保留数据库、Redis、上传文件、其他项目容器和 Docker 网络'
            """;

    private static final String CLEANUP_COMMAND = DOCKER_SETUP + """
            [ -d /opt/pulseim ] || { echo '未找到 /opt/pulseim，已停止清理以避免误操作'; exit 22; }
            names='pulse-api pulse-im pulse-mobile pulse-admin pulse-asr pulse-coturn pulse-minio pulse-nginx'
            for name in $names; do
              id=$($D ps -aq --filter "name=^/${name}$")
              if [ -n "$id" ]; then
                $D stop "$id" >/dev/null 2>&1 || true
                $D rm "$id" >/dev/null 2>&1 || true
                echo "removed container: $name"
              fi
            done
            echo 'PulseIM 容器清理完成；数据库、Redis、上传文件和其他项目未处理'
            """;

    public Map<String, Object> testConnection(ContainerSshRequest request) {
        try (SessionHandle handle = open(request, false)) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("connected", true);
            result.put("host", handle.session().getHost());
            result.put("port", handle.session().getPort());
            result.put("username", handle.session().getUserName());
            result.put("hostKeyFingerprint", handle.fingerprint());
            result.put("hostKeyVerified", fingerprintMatches(request.hostKeyFingerprint(), handle.fingerprint()));
            result.put("message", StringUtils.hasText(request.hostKeyFingerprint())
                    ? "SSH 连接成功，主机指纹已核对"
                    : "SSH 连接成功；请先核对主机指纹，再执行预检或清理");
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("container SSH connection failed for host={}", safeHost(request), e);
            throw new BizException("SSH 连接失败：" + safeMessage(e));
        }
    }

    public Map<String, Object> preflight(ContainerSshRequest request) {
        return runVerifiedCommand(request, PREFLIGHT_COMMAND, "目标服务器预检");
    }

    public Map<String, Object> cleanupPreview(ContainerSshRequest request) {
        return runVerifiedCommand(request, CLEANUP_PREVIEW_COMMAND, "老服务器 PulseIM 清理预览");
    }

    public Map<String, Object> cleanup(ContainerCleanupRequest request) {
        if (request == null || !CLEANUP_CONFIRMATION.equals(request.confirmText())) {
            throw new BizException("请输入准确的确认文字：" + CLEANUP_CONFIRMATION);
        }
        return runVerifiedCommand(request.ssh(), CLEANUP_COMMAND, "老服务器 PulseIM 清理");
    }

    private Map<String, Object> runVerifiedCommand(
            ContainerSshRequest request,
            String command,
            String operation
    ) {
        try (SessionHandle handle = open(request, true)) {
            CommandResult result = execute(handle.session(), command);
            if (result.exitCode() != 0) {
                throw new BizException(operation + "失败：" + shorten(result.output()));
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", true);
            body.put("operation", operation);
            body.put("host", handle.session().getHost());
            body.put("hostKeyFingerprint", handle.fingerprint());
            body.put("output", result.output());
            return body;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("container SSH operation failed for host={}, operation={}", safeHost(request), operation, e);
            throw new BizException(operation + "失败：" + safeMessage(e));
        }
    }

    SessionHandle open(ContainerSshRequest request, boolean requireFingerprint) throws Exception {
        validate(request);
        JSch jsch = new JSch();
        String authType = normalizeAuthType(request.authType());
        if ("PRIVATE_KEY".equals(authType)) {
            byte[] key = request.privateKey().getBytes(StandardCharsets.UTF_8);
            byte[] passphrase = StringUtils.hasText(request.privateKeyPassphrase())
                    ? request.privateKeyPassphrase().getBytes(StandardCharsets.UTF_8) : null;
            jsch.addIdentity("pulse-admin-" + UUID.randomUUID(), key, null, passphrase);
        }
        int port = request.port() == null ? DEFAULT_PORT : request.port();
        Session session = jsch.getSession(request.username().trim(), normalizeHost(request.host()), port);
        if ("PASSWORD".equals(authType)) {
            session.setPassword(request.password());
        }
        // The first test intentionally obtains the server fingerprint. Mutating
        // operations require the caller to send that exact fingerprint back.
        session.setConfig("StrictHostKeyChecking", "no");
        session.setServerAliveInterval(5_000);
        session.setServerAliveCountMax(2);
        session.connect(CONNECT_TIMEOUT_MS);
        String fingerprint = fingerprint(session.getHostKey());
        if (requireFingerprint && !fingerprintMatches(request.hostKeyFingerprint(), fingerprint)) {
            session.disconnect();
            throw new BizException("主机指纹未核对或不匹配，请先测试 SSH 并确认指纹");
        }
        return new SessionHandle(session, fingerprint);
    }

    /**
     * Opens a temporary local port which reaches a service visible from the
     * SSH server. The caller must keep this session open while using the port.
     */
    int forwardLocalPort(Session session, String remoteHost, int remotePort) throws Exception {
        if (session == null || !session.isConnected()) {
            throw new BizException("SSH 会话已断开，无法建立临时转发");
        }
        if (!StringUtils.hasText(remoteHost) || remoteHost.length() > 253
                || remoteHost.matches(".*[\\s/@].*")) {
            throw new BizException("对象存储转发主机地址不正确");
        }
        if (remotePort < 1 || remotePort > 65_535) {
            throw new BizException("对象存储转发端口不正确");
        }
        return session.setPortForwardingL(0, remoteHost, remotePort);
    }

    static CommandResult execute(Session session, String command) throws Exception {
        ChannelExec channel = (ChannelExec) session.openChannel("exec");
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        channel.setCommand(command);
        channel.setInputStream(null);
        channel.setOutputStream(new LimitedOutputStream(stdout));
        channel.setErrStream(new LimitedOutputStream(stderr));
        try {
            channel.connect(CONNECT_TIMEOUT_MS);
            long deadline = System.currentTimeMillis() + COMMAND_TIMEOUT_MS;
            while (!channel.isClosed() && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
            }
            if (!channel.isClosed()) {
                channel.disconnect();
                throw new BizException("远程命令执行超时");
            }
            String output = stdout.toString(StandardCharsets.UTF_8)
                    + (stderr.size() > 0 ? "\n[stderr]\n" + stderr.toString(StandardCharsets.UTF_8) : "");
            return new CommandResult(channel.getExitStatus(), shorten(output));
        } finally {
            channel.disconnect();
        }
    }

    private static void validate(ContainerSshRequest request) {
        if (request == null) throw new BizException("SSH 参数不能为空");
        String host = normalizeHost(request.host());
        if (!StringUtils.hasText(host) || host.length() > 253 || host.matches(".*[\\s/@].*")) {
            throw new BizException("SSH 主机地址不正确");
        }
        int port = request.port() == null ? DEFAULT_PORT : request.port();
        if (port < 1 || port > 65_535) throw new BizException("SSH 端口不正确");
        if (!StringUtils.hasText(request.username()) || request.username().length() > 128
                || request.username().matches(".*[\\r\\n].*")) {
            throw new BizException("请输入已确认的 SSH 用户名");
        }
        String authType = normalizeAuthType(request.authType());
        String secret = "PRIVATE_KEY".equals(authType) ? request.privateKey() : request.password();
        if (!StringUtils.hasText(secret) || secret.length() > MAX_SECRET_LENGTH) {
            throw new BizException("SSH " + ("PRIVATE_KEY".equals(authType) ? "私钥" : "密码") + "不能为空或过长");
        }
        if (request.privateKeyPassphrase() != null && request.privateKeyPassphrase().length() > MAX_SECRET_LENGTH) {
            throw new BizException("SSH 私钥口令过长");
        }
        if (request.hostKeyFingerprint() != null && request.hostKeyFingerprint().length() > 256) {
            throw new BizException("主机指纹格式不正确");
        }
    }

    private static String normalizeAuthType(String raw) {
        String type = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if ("PASSWORD".equals(type) || "PRIVATE_KEY".equals(type)) {
            return type;
        }
        throw new BizException("SSH 认证方式不正确");
    }

    private static String normalizeHost(String raw) {
        if (raw == null) return "";
        String host = raw.trim();
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        return host;
    }

    private static String safeHost(ContainerSshRequest request) {
        return request == null ? "" : normalizeHost(request.host());
    }

    private static String fingerprint(HostKey hostKey) {
        if (hostKey == null || !StringUtils.hasText(hostKey.getKey())) return "";
        try {
            byte[] key = Base64.getDecoder().decode(hostKey.getKey());
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key);
            return "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(digest);
        } catch (IllegalArgumentException | NoSuchAlgorithmException e) {
            return "";
        }
    }

    private static boolean fingerprintMatches(String expected, String actual) {
        return StringUtils.hasText(expected) && StringUtils.hasText(actual)
                && expected.trim().equalsIgnoreCase(actual.trim());
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

    record CommandResult(int exitCode, String output) {
    }

    record SessionHandle(Session session, String fingerprint) implements AutoCloseable {
        @Override
        public void close() {
            session.disconnect();
        }
    }

    private static final class LimitedOutputStream extends OutputStream {
        private static final int MAX_BYTES = 16_000;
        private final OutputStream delegate;
        private int written;

        private LimitedOutputStream(OutputStream delegate) {
            this.delegate = delegate;
        }

        @Override
        public void write(int b) throws IOException {
            if (written < MAX_BYTES) {
                delegate.write(b);
                written++;
            }
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            if (written >= MAX_BYTES) return;
            int count = Math.min(len, MAX_BYTES - written);
            delegate.write(b, off, count);
            written += count;
        }
    }
}
