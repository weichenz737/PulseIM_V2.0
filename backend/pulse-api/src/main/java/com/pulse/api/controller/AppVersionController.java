package com.pulse.api.controller;

import com.pulse.api.service.AppVersionService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/app-version")
@RequiredArgsConstructor
public class AppVersionController {
    private final AppVersionService service;

    @GetMapping("/latest")
    public R<Map<String, Object>> latest() {
        return R.ok(service.get());
    }
}
