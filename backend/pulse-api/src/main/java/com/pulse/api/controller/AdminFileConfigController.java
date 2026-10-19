package com.pulse.api.controller;

import com.pulse.api.service.FileConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/file-config")
@RequiredArgsConstructor
public class AdminFileConfigController {
    private final FileConfigService fileConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(fileConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        int maxSizeMb = body.get("maxSizeMb") == null
                ? 100
                : ((Number) body.get("maxSizeMb")).intValue();
        List<String> allowed = new ArrayList<>();
        Object raw = body.get("allowedExtensions");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) allowed.add(String.valueOf(o));
            }
        } else if (raw != null) {
            for (String part : String.valueOf(raw).split(",")) {
                if (StringUtils.hasText(part)) allowed.add(part.trim());
            }
        }
        return R.ok(fileConfigService.update(maxSizeMb, allowed));
    }
}
