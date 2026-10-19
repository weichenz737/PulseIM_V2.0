package com.pulse.api.controller;

import com.pulse.api.service.CommunityService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 圈子运营数据中心接口。统计接口与现有圈子业务接口隔离，便于后续扩展。 */
@RestController
@RequestMapping("/api/admin/circle/dashboard")
@RequiredArgsConstructor
public class AdminCircleDashboardController {
    private final CommunityService communityService;

    @GetMapping("/overview")
    public R<?> overview(@RequestParam(required = false) String startDate,
                         @RequestParam(required = false) String endDate) {
        return R.ok(communityService.circleDashboardOverview(startDate, endDate));
    }

    @GetMapping("/trend")
    public R<?> trend(@RequestParam(required = false) String startDate,
                      @RequestParam(required = false) String endDate) {
        return R.ok(communityService.circleDashboardTrend(startDate, endDate));
    }

    @GetMapping("/ranking")
    public R<?> ranking(@RequestParam(required = false) String startDate,
                        @RequestParam(required = false) String endDate) {
        return R.ok(communityService.circleDashboardRanking(startDate, endDate));
    }

    @GetMapping("/income")
    public R<?> income(@RequestParam(required = false) String startDate,
                       @RequestParam(required = false) String endDate) {
        return R.ok(communityService.circleDashboardIncome(startDate, endDate));
    }

    @GetMapping("/content")
    public R<?> content(@RequestParam(required = false) String startDate,
                        @RequestParam(required = false) String endDate) {
        return R.ok(communityService.circleDashboardContent(startDate, endDate));
    }
}
