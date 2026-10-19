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
@RequestMapping("/api/admin/client-register")
@RequiredArgsConstructor
public class AdminClientRegisterController {
    private final ClientAccessConfigService clientAccessConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(clientAccessConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        boolean enabled = !Boolean.FALSE.equals(body == null ? null : body.get("windowsRegisterEnabled"));
        return R.ok(clientAccessConfigService.updateRegister(enabled));
    }
}
