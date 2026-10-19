package com.pulse.api.controller;

import com.pulse.api.dto.AuthDtos;
import com.pulse.api.security.AuthContext;
import com.pulse.api.service.AccountSecurityService;
import com.pulse.common.result.R;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/user/security")
@RequiredArgsConstructor
public class AccountSecurityController {
    private final AccountSecurityService accountSecurityService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(accountSecurityService.get(AuthContext.currentUserId()));
    }

    @PutMapping("/password")
    public R<Void> changePassword(@Valid @RequestBody AuthDtos.UserChangePasswordReq req) {
        accountSecurityService.changePassword(
                AuthContext.currentUserId(), req.getOldPassword(), req.getNewPassword(), req.getCode());
        return R.ok();
    }

    @PutMapping("/phone")
    public R<Map<String, Object>> changePhone(@Valid @RequestBody AuthDtos.UserChangePhoneReq req) {
        return R.ok(accountSecurityService.changePhone(
                AuthContext.currentUserId(), req.getNewPhone(), req.getCode()));
    }

    @PutMapping("/security-code")
    public R<Map<String, Object>> setSecurityCode(@RequestBody Map<String, Object> body) {
        boolean enabled = Boolean.parseBoolean(String.valueOf(body.getOrDefault("enabled", false)));
        return R.ok(accountSecurityService.setSecurityCode(AuthContext.currentUserId(), enabled));
    }

    @PostMapping("/security-code/refresh")
    public R<Map<String, Object>> refreshSecurityCode() {
        return R.ok(accountSecurityService.refreshSecurityCode(AuthContext.currentUserId()));
    }

    @DeleteMapping("/account")
    public R<Void> deleteAccount(@RequestBody(required = false) Map<String, Object> body) {
        String agreementKey = body == null || body.get("agreementKey") == null
                ? "account_deletion_agreement"
                : String.valueOf(body.get("agreementKey"));
        accountSecurityService.deleteAccount(AuthContext.currentUserId(), agreementKey);
        return R.ok();
    }

    @GetMapping("/devices")
    public R<Map<String, Object>> devices() {
        return R.ok(accountSecurityService.listDevices(
                AuthContext.currentUserId(), AuthContext.currentDeviceId()));
    }

    @DeleteMapping("/devices/{deviceId}")
    public R<Void> revokeDevice(@PathVariable String deviceId) {
        accountSecurityService.revokeDevice(
                AuthContext.currentUserId(), AuthContext.currentDeviceId(), deviceId);
        return R.ok();
    }

    @PostMapping("/devices/logout-others")
    public R<Map<String, Object>> revokeOtherDevices() {
        int count = accountSecurityService.revokeOtherDevices(
                AuthContext.currentUserId(), AuthContext.currentDeviceId());
        return R.ok(Map.of("count", count));
    }
}
