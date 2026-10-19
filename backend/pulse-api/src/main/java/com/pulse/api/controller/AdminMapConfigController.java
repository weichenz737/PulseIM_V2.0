package com.pulse.api.controller;

import com.pulse.api.service.MapConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/map-config")
@RequiredArgsConstructor
public class AdminMapConfigController {
    private final MapConfigService mapConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(mapConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        boolean enabled = !Boolean.FALSE.equals(body.get("enabled"));
        String ak = body.get("ak") == null ? "" : String.valueOf(body.get("ak"));
        String appAk = body.get("appAk") == null ? "" : String.valueOf(body.get("appAk"));
        return R.ok(mapConfigService.update(enabled, ak, appAk));
    }
}
