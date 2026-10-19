package com.pulse.api.controller;

import com.pulse.api.service.AdminAuditService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminAuditController {
    private final AdminAuditService adminAuditService;

    @GetMapping("/admin-login-logs")
    public R<Map<String, Object>> loginLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean success
    ) {
        return R.ok(adminAuditService.listLoginLogs(page, size, keyword, success));
    }

    @PostMapping("/admin-login-logs/batch-delete")
    public R<Map<String, Object>> deleteLoginLogs(@RequestBody Map<String, Object> body) {
        int deleted = adminAuditService.deleteLoginLogs(parseIds(body));
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    @PostMapping("/admin-login-logs/clear-all")
    public R<Map<String, Object>> clearLoginLogs() {
        int deleted = adminAuditService.clearAllLoginLogs();
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    @GetMapping("/admin-operation-logs")
    public R<Map<String, Object>> operationLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String module
    ) {
        return R.ok(adminAuditService.listOperationLogs(page, size, keyword, module));
    }

    @PostMapping("/admin-operation-logs/batch-delete")
    public R<Map<String, Object>> deleteOperationLogs(@RequestBody Map<String, Object> body) {
        int deleted = adminAuditService.deleteOperationLogs(parseIds(body));
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    @PostMapping("/admin-operation-logs/clear-all")
    public R<Map<String, Object>> clearOperationLogs() {
        int deleted = adminAuditService.clearAllOperationLogs();
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    private static List<Long> parseIds(Map<String, Object> body) {
        List<Long> ids = new ArrayList<>();
        if (body == null || !(body.get("ids") instanceof List<?> list)) {
            return ids;
        }
        for (Object o : list) {
            if (o == null) continue;
            try {
                ids.add(Long.valueOf(String.valueOf(o)));
            } catch (Exception ignored) {
                // skip
            }
        }
        return ids;
    }
}
