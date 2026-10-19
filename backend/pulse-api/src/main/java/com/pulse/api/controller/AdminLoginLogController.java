package com.pulse.api.controller;

import com.pulse.api.service.LoginLogService;
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
public class AdminLoginLogController {
    private final LoginLogService loginLogService;

    @GetMapping("/login-logs")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String loginType,
            @RequestParam(required = false) Boolean success,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        return R.ok(loginLogService.listLogs(page, size, keyword, loginType, success, userId, from, to));
    }

    @PostMapping("/login-logs/batch-delete")
    public R<Map<String, Object>> batchDelete(@RequestBody Map<String, Object> body) {
        int deleted = loginLogService.deleteByIds(parseIds(body));
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    @PostMapping("/login-logs/clear-all")
    public R<Map<String, Object>> clearAll() {
        int deleted = loginLogService.clearAll();
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
