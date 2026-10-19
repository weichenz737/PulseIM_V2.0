package com.pulse.api.controller;

import com.pulse.api.service.ClientAccessConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/config/client-access")
@RequiredArgsConstructor
public class ClientAccessConfigController {
    private final ClientAccessConfigService clientAccessConfigService;

    @GetMapping
    public R<Map<String, Object>> get(@RequestParam(value = "platform", defaultValue = "web") String platform) {
        return R.ok(clientAccessConfigService.getClientConfig(platform));
    }
}
