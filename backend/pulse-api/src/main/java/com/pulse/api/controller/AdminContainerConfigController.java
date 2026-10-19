package com.pulse.api.controller;

import com.pulse.api.service.ContainerConfigService;
import com.pulse.api.service.SshLegacyDataMigrationService;
import com.pulse.api.service.SshContainerControlService;
import com.pulse.api.dto.ContainerDataMigrationRequest;
import com.pulse.api.dto.ContainerCleanupRequest;
import com.pulse.api.dto.ContainerSshRequest;
import com.pulse.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/container-config")
@RequiredArgsConstructor
public class AdminContainerConfigController {
    private final ContainerConfigService containerConfigService;
    private final SshContainerControlService sshContainerControlService;
    private final SshLegacyDataMigrationService legacyDataMigrationService;

    @GetMapping
    public R<Map<String, Object>> get(HttpServletRequest request) {
        return R.ok(containerConfigService.getAdminConfig(currentOrigin(request)));
    }

    @PutMapping
    public R<Map<String, Object>> update(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        String target = body == null || body.get("targetServerOrigin") == null
                ? ""
                : String.valueOf(body.get("targetServerOrigin"));
        Boolean migrateLegacyData = body != null && body.containsKey("migrateLegacyData")
                ? booleanValue(body.get("migrateLegacyData"))
                : null;
        return R.ok(containerConfigService.updateTarget(currentOrigin(request), target, migrateLegacyData));
    }

    @PostMapping("/prepare")
    public R<Map<String, Object>> prepare(HttpServletRequest request) {
        return R.ok(containerConfigService.prepareMigration(currentOrigin(request)));
    }

    @PostMapping("/migration/activate")
    public R<Map<String, Object>> activate(HttpServletRequest request) {
        return R.ok(containerConfigService.activateMigration(currentOrigin(request)));
    }

    @PostMapping("/ssh/test")
    public R<Map<String, Object>> testSsh(@RequestBody ContainerSshRequest body) {
        return R.ok(sshContainerControlService.testConnection(body));
    }

    @PostMapping("/ssh/preflight")
    public R<Map<String, Object>> preflight(@RequestBody ContainerSshRequest body) {
        return R.ok(sshContainerControlService.preflight(body));
    }

    @PostMapping("/migration/preview")
    public R<Map<String, Object>> migrationPreview(@RequestBody ContainerDataMigrationRequest body) {
        requireLegacyDataMigrationEnabled();
        return R.ok(legacyDataMigrationService.preview(body));
    }

    @PostMapping("/migration/start")
    public R<Map<String, Object>> migrationStart(@RequestBody ContainerDataMigrationRequest body) {
        requireLegacyDataMigrationEnabled();
        return R.ok(legacyDataMigrationService.migrate(body));
    }

    @PostMapping("/cleanup-old/preview")
    public R<Map<String, Object>> cleanupPreview(@RequestBody ContainerSshRequest body) {
        containerConfigService.assertCleanupSourceIsNotTarget(body == null ? null : body.host());
        return R.ok(sshContainerControlService.cleanupPreview(body));
    }

    @PostMapping("/cleanup-old")
    public R<Map<String, Object>> cleanupOld(@RequestBody ContainerCleanupRequest body) {
        containerConfigService.assertCleanupSourceIsNotTarget(
                body == null || body.ssh() == null ? null : body.ssh().host());
        return R.ok(sshContainerControlService.cleanup(body));
    }

    private static String currentOrigin(HttpServletRequest request) {
        String forwardedProto = firstHeader(request, "X-Forwarded-Proto");
        String forwardedHost = firstHeader(request, "X-Forwarded-Host");
        String scheme = forwardedProto.isEmpty() ? request.getScheme() : forwardedProto;
        String host = forwardedHost.isEmpty() ? request.getServerName() : forwardedHost;
        int port = request.getServerPort();
        boolean standardPort = ("http".equalsIgnoreCase(scheme) && port == 80)
                || ("https".equalsIgnoreCase(scheme) && port == 443);
        if (forwardedHost.isEmpty() && !standardPort && port > 0) {
            host = host + ":" + port;
        }
        return scheme + "://" + host;
    }

    private static String firstHeader(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        if (value == null) return "";
        int comma = value.indexOf(',');
        return (comma >= 0 ? value.substring(0, comma) : value).trim();
    }

    private void requireLegacyDataMigrationEnabled() {
        if (!containerConfigService.legacyDataMigrationEnabled()) {
            throw new com.pulse.common.exception.BizException("请先在系统容器配置中开启“迁移旧数据”并保存");
        }
    }

    private static Boolean booleanValue(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Boolean value) return value;
        return Boolean.valueOf(String.valueOf(raw).trim());
    }
}
