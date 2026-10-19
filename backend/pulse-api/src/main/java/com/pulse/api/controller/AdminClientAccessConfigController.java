package com.pulse.api.controller;

import com.pulse.api.service.ClientAccessConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/client-login-methods")
@RequiredArgsConstructor
public class AdminClientAccessConfigController {
    private final ClientAccessConfigService clientAccessConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(clientAccessConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        return R.ok(clientAccessConfigService.updateLoginMethods(
                booleanValue(body, "windowsPhoneLoginEnabled"),
                booleanValue(body, "windowsQrLoginEnabled")
        ));
    }

    private boolean booleanValue(Map<String, Object> body, String key) {
        return !Boolean.FALSE.equals(body == null ? null : body.get(key));
    }
}
