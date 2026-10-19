package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ClientAccessConfigService {
    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getClientConfig(String platform) {
        Config config = load();
        boolean windows = isWindowsPlatform(platform);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("windows", windows);
        result.put("phoneLoginEnabled", !windows || config.windowsPhoneLoginEnabled());
        result.put("qrLoginEnabled", !windows || config.windowsQrLoginEnabled());
        result.put("registerEnabled", !windows || config.windowsRegisterEnabled());
        result.put("walletEnabled", !windows || config.windowsWalletEnabled());
        return result;
    }

    public Map<String, Object> getAdminConfig() {
        Config config = load();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("windowsPhoneLoginEnabled", config.windowsPhoneLoginEnabled());
        result.put("windowsQrLoginEnabled", config.windowsQrLoginEnabled());
        result.put("windowsRegisterEnabled", config.windowsRegisterEnabled());
        result.put("windowsWalletEnabled", config.windowsWalletEnabled());
        result.put("updatedAt", config.updatedAt());
        return result;
    }

    @Transactional
    public Map<String, Object> update(boolean phoneLoginEnabled, boolean qrLoginEnabled, boolean registerEnabled) {
        return update(phoneLoginEnabled, qrLoginEnabled, registerEnabled, load().windowsWalletEnabled());
    }

    @Transactional
    public Map<String, Object> update(boolean phoneLoginEnabled, boolean qrLoginEnabled,
                                      boolean registerEnabled, boolean walletEnabled) {
        jdbcTemplate.update("""
                INSERT INTO sys_client_access_config(
                    id, windows_phone_login_enabled, windows_qr_login_enabled, windows_register_enabled,
                    windows_wallet_enabled, updated_at
                ) VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    windows_phone_login_enabled = EXCLUDED.windows_phone_login_enabled,
                    windows_qr_login_enabled = EXCLUDED.windows_qr_login_enabled,
                    windows_register_enabled = EXCLUDED.windows_register_enabled,
                    windows_wallet_enabled = EXCLUDED.windows_wallet_enabled,
                    updated_at = EXCLUDED.updated_at
                """, phoneLoginEnabled, qrLoginEnabled, registerEnabled, walletEnabled, OffsetDateTime.now());
        return getAdminConfig();
    }

    @Transactional
    public Map<String, Object> updateLoginMethods(boolean phoneLoginEnabled, boolean qrLoginEnabled) {
        Config current = load();
        return update(phoneLoginEnabled, qrLoginEnabled, current.windowsRegisterEnabled(), current.windowsWalletEnabled());
    }

    @Transactional
    public Map<String, Object> updateRegister(boolean registerEnabled) {
        Config current = load();
        return update(current.windowsPhoneLoginEnabled(), current.windowsQrLoginEnabled(), registerEnabled, current.windowsWalletEnabled());
    }

    @Transactional
    public Map<String, Object> updateWallet(boolean walletEnabled) {
        Config current = load();
        return update(current.windowsPhoneLoginEnabled(), current.windowsQrLoginEnabled(), current.windowsRegisterEnabled(), walletEnabled);
    }

    public void assertWindowsPhoneLogin(String platform) {
        if (isWindowsPlatform(platform) && !load().windowsPhoneLoginEnabled()) {
            throw new BizException("电脑端手机号登录已关闭");
        }
    }

    public void assertWindowsQrLogin(String platform) {
        if (isWindowsPlatform(platform) && !load().windowsQrLoginEnabled()) {
            throw new BizException("电脑端扫码登录已关闭");
        }
    }

    public void assertWindowsRegister(String platform) {
        if (isWindowsPlatform(platform) && !load().windowsRegisterEnabled()) {
            throw new BizException("电脑端注册已关闭");
        }
    }

    public boolean isWindowsPlatform(String platform) {
        if (platform == null) return false;
        return switch (platform.trim().toLowerCase()) {
            case "windows", "windows_web", "desktop", "desktop_web", "desktop-web" -> true;
            default -> false;
        };
    }

    private Config load() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT windows_phone_login_enabled, windows_qr_login_enabled,
                       windows_register_enabled, windows_wallet_enabled, updated_at
                FROM sys_client_access_config
                WHERE id = 1
                """);
        if (rows.isEmpty()) {
            return new Config(true, true, true, true, null);
        }
        Map<String, Object> row = rows.get(0);
        return new Config(
                !Boolean.FALSE.equals(row.get("windows_phone_login_enabled")),
                !Boolean.FALSE.equals(row.get("windows_qr_login_enabled")),
                !Boolean.FALSE.equals(row.get("windows_register_enabled")),
                !Boolean.FALSE.equals(row.get("windows_wallet_enabled")),
                row.get("updated_at")
        );
    }

    private record Config(
            boolean windowsPhoneLoginEnabled,
            boolean windowsQrLoginEnabled,
            boolean windowsRegisterEnabled,
            boolean windowsWalletEnabled,
            Object updatedAt
    ) {
    }
}
