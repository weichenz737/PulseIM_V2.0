package com.pulse.api.controller;

import com.pulse.api.service.SystemTextService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/system/texts")
@RequiredArgsConstructor
public class SystemTextController {
    private final SystemTextService systemTextService;

    @GetMapping("/{key}")
    public R<Map<String, Object>> get(@PathVariable String key) {
        return R.ok(systemTextService.get(key));
    }
}
