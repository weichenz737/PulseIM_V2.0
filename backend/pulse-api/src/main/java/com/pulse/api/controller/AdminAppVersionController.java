package com.pulse.api.controller;

import com.pulse.api.service.AppVersionService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/app-version")
@RequiredArgsConstructor
public class AdminAppVersionController {
    private final AppVersionService service;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(service.get());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        return R.ok(service.update(body));
    }
}
