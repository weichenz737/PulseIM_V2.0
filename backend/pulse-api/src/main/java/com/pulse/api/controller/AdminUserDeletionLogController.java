package com.pulse.api.controller;

import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/user-deletion-logs")
@RequiredArgsConstructor
public class AdminUserDeletionLogController {
    private final JdbcTemplate jdbcTemplate;

    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String keyword
    ) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        int offset = (safePage - 1) * safeSize;
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> filterArgs = new ArrayList<>();
        if (userId != null && userId > 0) {
            where.append(" AND l.user_id = ?");
            filterArgs.add(userId);
        }
        if (keyword != null && !keyword.trim().isEmpty()) {
            String pattern = "%" + keyword.trim() + "%";
            where.append(" AND (l.phone ILIKE ? OR l.pulse_id ILIKE ? OR l.nickname ILIKE ?)");
            filterArgs.add(pattern);
            filterArgs.add(pattern);
            filterArgs.add(pattern);
        }
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user_deletion_log l" + where,
                Long.class,
                filterArgs.toArray());
        List<Object> listArgs = new ArrayList<>(filterArgs);
        listArgs.add(safeSize);
        listArgs.add(offset);
        List<Map<String, Object>> list = jdbcTemplate.queryForList("""
                SELECT l.id, l.user_id, l.phone, l.pulse_id, l.nickname, l.wallet_balance,
                       l.agreement_title, l.created_at
                FROM sys_user_deletion_log l
                """ + where + " ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?", listArgs.toArray());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total == null ? 0 : total);
        result.put("page", safePage);
        result.put("size", safeSize);
        return R.ok(result);
    }
}
