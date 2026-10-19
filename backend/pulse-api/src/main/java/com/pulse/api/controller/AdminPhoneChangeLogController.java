package com.pulse.api.controller;

import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/user-phone-change-logs")
@RequiredArgsConstructor
public class AdminPhoneChangeLogController {
    private final JdbcTemplate jdbcTemplate;

    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long userId
    ) {
        int safeSize = Math.min(100, Math.max(1, size));
        int offset = (Math.max(1, page) - 1) * safeSize;
        String where = userId == null ? "" : " WHERE l.user_id = ?";
        Object[] countArgs = userId == null ? new Object[]{} : new Object[]{userId};
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user_phone_change_log l" + where, Long.class, countArgs);
        Object[] args = userId == null
                ? new Object[]{safeSize, offset}
                : new Object[]{userId, safeSize, offset};
        List<Map<String, Object>> list = jdbcTemplate.queryForList("""
                SELECT l.id, l.user_id, u.nickname, l.old_phone, l.new_phone, l.created_at
                FROM sys_user_phone_change_log l
                LEFT JOIN sys_user u ON u.id = l.user_id
                """ + where + " ORDER BY l.created_at DESC LIMIT ? OFFSET ?", args);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total == null ? 0 : total);
        result.put("page", Math.max(1, page));
        result.put("size", safeSize);
        return R.ok(result);
    }
}
