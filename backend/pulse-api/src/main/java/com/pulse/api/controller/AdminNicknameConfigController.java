package com.pulse.api.controller;

import com.pulse.api.service.NicknameConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/nickname-config")
@RequiredArgsConstructor
public class AdminNicknameConfigController {
    private final NicknameConfigService nicknameConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(nicknameConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        return R.ok(nicknameConfigService.update(
                integer(body, "userNicknameMaxLength"),
                integer(body, "communityNicknameMaxLength")
        ));
    }

    private static Integer integer(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value == null ? null : Integer.valueOf(String.valueOf(value));
    }
}
