package com.pulse.api.controller;

import com.pulse.api.service.NicknameConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/config/nickname")
@RequiredArgsConstructor
public class NicknameConfigController {
    private final NicknameConfigService nicknameConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(nicknameConfigService.getClientConfig());
    }
}
