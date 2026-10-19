package com.pulse.api.controller;

import com.pulse.api.service.WalletAmountConfigService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/amount-config")
@RequiredArgsConstructor
public class AdminWalletAmountConfigController {
    private final WalletAmountConfigService walletAmountConfigService;

    @GetMapping
    public R<Map<String, Object>> get() {
        return R.ok(walletAmountConfigService.getAdminConfig());
    }

    @PutMapping
    public R<Map<String, Object>> update(@RequestBody Map<String, Object> body) {
        return R.ok(walletAmountConfigService.update(
                decimal(body, "redPacketMaxAmount"),
                decimal(body, "transferMaxAmount")
        ));
    }

    private static BigDecimal decimal(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value == null ? null : new BigDecimal(String.valueOf(value));
    }
}
