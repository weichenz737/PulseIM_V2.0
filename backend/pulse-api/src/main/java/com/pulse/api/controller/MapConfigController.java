package com.pulse.api.controller;

import com.pulse.api.service.MapConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/config/map")
@RequiredArgsConstructor
public class MapConfigController {
    private final MapConfigService mapConfigService;

    @GetMapping
    public R<Map<String, Object>> getMapConfig(
            @RequestParam(value = "platform", defaultValue = "web") String platform) {
        return R.ok(mapConfigService.getClientConfig(platform));
    }
}
