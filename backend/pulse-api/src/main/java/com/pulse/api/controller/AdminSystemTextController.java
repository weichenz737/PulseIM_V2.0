package com.pulse.api.controller;

import com.pulse.api.service.SystemTextService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/system-texts")
@RequiredArgsConstructor
public class AdminSystemTextController {
    private final SystemTextService systemTextService;

    @GetMapping
    public R<List<Map<String, Object>>> list() {
        return R.ok(systemTextService.list());
    }

    @GetMapping("/{key}")
    public R<Map<String, Object>> get(@PathVariable String key) {
        return R.ok(systemTextService.get(key));
    }

    @PutMapping("/{key}")
    public R<Map<String, Object>> update(@PathVariable String key, @RequestBody Map<String, Object> body) {
        String title = body.get("title") == null ? null : String.valueOf(body.get("title"));
        String content = body.get("content") == null ? "" : String.valueOf(body.get("content"));
        return R.ok(systemTextService.update(key, title, content));
    }
}
