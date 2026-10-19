package com.pulse.api.controller;

import com.pulse.api.service.AdminGroupOpLogService;
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
public class AdminGroupOpLogController {
    private final AdminGroupOpLogService adminGroupOpLogService;

    @GetMapping("/group-operation-logs")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long conversationId,
            @RequestParam(required = false) String opType
    ) {
        return R.ok(adminGroupOpLogService.list(page, size, keyword, conversationId, opType));
    }

    @PostMapping("/group-operation-logs/batch-delete")
    public R<Map<String, Object>> batchDelete(@RequestBody Map<String, Object> body) {
        int deleted = adminGroupOpLogService.deleteByIds(parseIds(body));
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
