package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.security.SecureRandom;

@Service
@RequiredArgsConstructor
public class AccountSecurityService {
    private static final String FIXED_VERIFICATION_CODE = "1234";

    private final SysUserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbcTemplate;
    private final SessionRevocationService sessionRevocationService;
    private final SystemTextService systemTextService;
    private final AdminUserService adminUserService;

    public Map<String, Object> get(Long userId) {
        SysUser user = requireUser(userId);
        return Map.of(
                "phone", user.getPhone() == null ? "" : user.getPhone(),
                "securityCodeEnabled", Boolean.TRUE.equals(user.getSecurityCodeEnabled()),
                "securityCode", user.getSecurityCode() == null ? "" : user.getSecurityCode());
    }

    @Transactional
    public Map<String, Object> setSecurityCode(Long userId, boolean enabled) {
        SysUser user = requireUser(userId);
        user.setSecurityCodeEnabled(enabled);
        if (enabled && !StringUtils.hasText(user.getSecurityCode())) {
            user.setSecurityCode(generateSecurityCode());
        }
        userMapper.updateById(user);
        if (!enabled) {
            jdbcTemplate.update("UPDATE sys_user_trusted_device SET trusted=FALSE WHERE user_id=?", userId);
        }
        return get(userId);
    }

    @Transactional
    public Map<String, Object> refreshSecurityCode(Long userId) {
        SysUser user = requireUser(userId);
        user.setSecurityCode(generateSecurityCode());
        user.setSecurityCodeEnabled(true);
        userMapper.updateById(user);
        jdbcTemplate.update("UPDATE sys_user_trusted_device SET trusted=FALSE WHERE user_id=?", userId);
        return get(userId);
    }

    public Map<String, Object> listDevices(Long userId, String currentDeviceId) {
        requireUser(userId);
        List<Map<String, Object>> list = jdbcTemplate.query("""
                SELECT device_id, device_name, platform, trusted, trusted_at, login_at, last_active_at
                  FROM sys_user_trusted_device
                 WHERE user_id=? AND revoked_at IS NULL
                 ORDER BY COALESCE(login_at, last_active_at) DESC NULLS LAST, trusted_at DESC NULLS LAST
                """, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            String deviceId = rs.getString("device_id");
            String name = rs.getString("device_name");
            String platform = rs.getString("platform");
            row.put("deviceId", deviceId);
            row.put("name", StringUtils.hasText(name) ? name : defaultDeviceName(platform));
            row.put("platform", platform == null ? "" : platform);
            row.put("trusted", rs.getBoolean("trusted"));
            row.put("trustedAt", rs.getObject("trusted_at"));
            row.put("loginAt", rs.getObject("login_at"));
            row.put("lastActiveAt", rs.getObject("last_active_at"));
            row.put("current", Objects.equals(deviceId, currentDeviceId));
            // 实时在线标记由 IM 服务写入：该设备当前是否有活跃的 WebSocket 连接。
            // 离线（网页关闭/客户端退出）后标记消失，移动端据此隐藏电脑图标。
            row.put("online", Boolean.TRUE.equals(redis.hasKey(RedisKeys.deviceOnline(userId, deviceId))));
            return row;
        }, userId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("currentDeviceId", currentDeviceId == null ? "" : currentDeviceId);
        return result;
    }

    @Transactional
    public void revokeDevice(Long userId, String currentDeviceId, String targetDeviceId) {
        requireUser(userId);
        String target = targetDeviceId == null ? "" : targetDeviceId.trim();
        if (!StringUtils.hasText(target)) {
            throw new BizException("设备标识不能为空");
        }
        if (Objects.equals(target, currentDeviceId)) {
            throw new BizException("当前设备请使用退出登录");
        }
        int updated = jdbcTemplate.update("""
                UPDATE sys_user_trusted_device
                   SET revoked_at=NOW(), last_active_at=NOW()
                 WHERE user_id=? AND device_id=? AND revoked_at IS NULL
                """, userId, target);
        if (updated == 0) {
            throw new BizException("设备不存在或已退出");
        }
        redis.opsForValue().set(RedisKeys.userDeviceRevoked(userId, target), "1");
        sessionRevocationService.notifyDeviceRevoked(userId, target, "device_revoked");
    }

    @Transactional
    public int revokeOtherDevices(Long userId, String currentDeviceId) {
        requireUser(userId);
        List<String> deviceIds;
        if (StringUtils.hasText(currentDeviceId)) {
            deviceIds = jdbcTemplate.query("""
                    SELECT device_id FROM sys_user_trusted_device
                     WHERE user_id=? AND revoked_at IS NULL AND device_id<>?
                    """, (rs, rowNum) -> rs.getString("device_id"), userId, currentDeviceId);
        } else {
            deviceIds = jdbcTemplate.query("""
                    SELECT device_id FROM sys_user_trusted_device
                     WHERE user_id=? AND revoked_at IS NULL
                    """, (rs, rowNum) -> rs.getString("device_id"), userId);
        }
        if (deviceIds.isEmpty()) {
            return 0;
        }
        if (StringUtils.hasText(currentDeviceId)) {
            jdbcTemplate.update("""
                    UPDATE sys_user_trusted_device SET revoked_at=NOW(), last_active_at=NOW()
                     WHERE user_id=? AND revoked_at IS NULL AND device_id<>?
                    """, userId, currentDeviceId);
        } else {
            jdbcTemplate.update("""
                    UPDATE sys_user_trusted_device SET revoked_at=NOW(), last_active_at=NOW()
                     WHERE user_id=? AND revoked_at IS NULL
                    """, userId);
        }
        deviceIds.forEach(device -> {
            redis.opsForValue().set(RedisKeys.userDeviceRevoked(userId, device), "1");
            sessionRevocationService.notifyDeviceRevoked(userId, device, "device_revoked");
        });
        return deviceIds.size();
    }

    private String defaultDeviceName(String platform) {
        if ("windows".equalsIgnoreCase(platform)) return "Windows 客户端";
        if ("windows_web".equalsIgnoreCase(platform)) return "Windows 网页端";
        if ("android".equalsIgnoreCase(platform)) return "Android 设备";
        if ("ios".equalsIgnoreCase(platform)) return "iPhone / iPad";
        if ("web".equalsIgnoreCase(platform)) return "Web 浏览器";
        return "未知设备";
    }

    private String generateSecurityCode() {
        final String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) code.append(chars.charAt(random.nextInt(chars.length())));
        return code.toString();
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword, String code) {
        SysUser user = requireUser(userId);
        String phone = user.getPhone() == null ? "" : user.getPhone().trim();
        if (!StringUtils.hasText(phone)) {
            throw new BizException("\u8d26\u53f7\u672a\u7ed1\u5b9a\u624b\u673a\u53f7");
        }
        verifyFixedVerificationCode(code);
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BizException("原密码不正确");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new BizException("新密码不能与原密码相同");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
        invalidateUserTokens(userId);
    }

    @Transactional
    public Map<String, Object> changePhone(Long userId, String newPhone, String code) {
        SysUser user = requireUser(userId);
        String phone = newPhone == null ? "" : newPhone.trim();
        verifyFixedVerificationCode(code);
        SysUser occupied = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getPhone, phone).last("LIMIT 1"));
        if (occupied != null && !occupied.getId().equals(userId)) {
            throw new BizException("该手机号已被使用");
        }
        String oldPhone = user.getPhone();
        if (phone.equals(oldPhone)) {
            throw new BizException("新手机号不能与原手机号相同");
        }
        user.setPhone(phone);
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
        jdbcTemplate.update("""
                INSERT INTO sys_user_phone_change_log(user_id, old_phone, new_phone, created_at)
                VALUES (?, ?, ?, NOW())
                """, userId, oldPhone, phone);
        invalidateUserTokens(userId);
        return Map.of("phone", phone);
    }

    /** 注销当前账号，并保留注销时的用户和协议快照。 */
    @Transactional
    public void deleteAccount(Long userId, String agreementKey) {
        SysUser user = requireUser(userId);
        Long balance = jdbcTemplate.queryForObject(
                "SELECT COALESCE(wallet_balance, 0) FROM sys_user WHERE id=? FOR UPDATE",
                Long.class,
                userId);
        long currentBalance = balance == null ? 0L : balance;
        Map<String, Object> agreement = systemTextService.get(
                StringUtils.hasText(agreementKey) ? agreementKey : "account_deletion_agreement");
        jdbcTemplate.update("""
                INSERT INTO sys_user_deletion_log(
                    user_id, phone, pulse_id, nickname, wallet_balance,
                    agreement_key, agreement_title, agreement_content, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                """,
                user.getId(), user.getPhone(), user.getPulseId(), user.getNickname(), currentBalance,
                agreement.get("key"), agreement.get("title"), agreement.get("content"));

        sessionRevocationService.notifyAllDevicesRevoked(userId, "account_deleted");
        jdbcTemplate.update("DELETE FROM sys_user_trusted_device WHERE user_id=?", userId);
        invalidateUserTokens(userId);
        adminUserService.deleteUser(userId, null, null);
    }

    private void verifyFixedVerificationCode(String code) {
        if (!FIXED_VERIFICATION_CODE.equals(code == null ? "" : code.trim())) {
            throw new BizException("验证码错误，请输入 1234");
        }
    }

    private void invalidateUserTokens(Long userId) {
        redis.opsForValue().increment(RedisKeys.userAuthVersion(userId));
    }

    private SysUser requireUser(Long userId) {
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        if (user.getStatus() != null && user.getStatus() != 1) {
            throw new BizException("账号已被禁用");
        }
        return user;
    }
}
