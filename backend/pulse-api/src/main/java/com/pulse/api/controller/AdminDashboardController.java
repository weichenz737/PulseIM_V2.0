package com.pulse.api.controller;

import com.pulse.api.service.AdminDashboardService;
import com.pulse.api.service.AdminPermissionService;
import com.pulse.api.security.AuthContext;
import com.pulse.api.support.AdminPermissionCodes;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/dashboard")
@RequiredArgsConstructor
public class AdminDashboardController {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private final AdminDashboardService dashboardService;
    private final AdminPermissionService permissionService;

    @GetMapping("/overview")
    public R<Map<String, Object>> overview(@RequestParam(required = false) String startDate,
                                           @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_VIEW);
        return R.ok(dashboardService.overview(range.start(), range.end()));
    }

    @GetMapping("/user-trend")
    public R<List<Map<String, Object>>> userTrend(@RequestParam(required = false) String startDate,
                                                   @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_USER);
        return R.ok(dashboardService.userTrend(range.start(), range.end()));
    }

    @GetMapping("/online-trend")
    public R<List<Map<String, Object>>> onlineTrend(@RequestParam(required = false) String startDate,
                                                     @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_USER);
        return R.ok(dashboardService.onlineTrend(range.start(), range.end()));
    }

    @GetMapping("/message-stat")
    public R<Map<String, Object>> messageStat(@RequestParam(required = false) String startDate,
                                               @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_MESSAGE);
        return R.ok(dashboardService.messageStat(range.start(), range.end()));
    }

    @GetMapping("/user-ranking")
    public R<List<Map<String, Object>>> userRanking(@RequestParam(required = false) String startDate,
                                                     @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_USER);
        return R.ok(dashboardService.userRanking(range.start(), range.end()));
    }

    @GetMapping("/group-ranking")
    public R<List<Map<String, Object>>> groupRanking(@RequestParam(required = false) String startDate,
                                                      @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_USER);
        return R.ok(dashboardService.groupRanking(range.start(), range.end()));
    }

    @GetMapping("/moment-stat")
    public R<List<Map<String, Object>>> momentStat(@RequestParam(required = false) String startDate,
                                                    @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_USER);
        return R.ok(dashboardService.momentStat(range.start(), range.end()));
    }

    @GetMapping("/risk-stat")
    public R<Map<String, Object>> riskStat(@RequestParam(required = false) String startDate,
                                            @RequestParam(required = false) String endDate) {
        DateRange range = range(startDate, endDate);
        assertPermission(AdminPermissionCodes.DASHBOARD_VIEW);
        return R.ok(dashboardService.riskStat(range.start(), range.end()));
    }

    private void assertPermission(String code) {
        permissionService.assertPermission(AuthContext.currentUserId(), code);
    }

    private static DateRange range(String rawStart, String rawEnd) {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        LocalDate start = parse(rawStart, today.minusDays(6));
        LocalDate end = parse(rawEnd, today);
        if (start.isAfter(end)) {
            LocalDate swap = start;
            start = end;
            end = swap;
        }
        // 避免误传超长区间拖慢运营查询；一年足够覆盖所有快捷筛选和常用自定义查询。
        if (end.toEpochDay() - start.toEpochDay() > 365) {
            start = end.minusDays(365);
        }
        return new DateRange(start, end);
    }

    private static LocalDate parse(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return LocalDate.parse(value, DATE);
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private record DateRange(LocalDate start, LocalDate end) { }
}
