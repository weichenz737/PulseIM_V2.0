package com.pulse.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.config.SmsProperties;
import com.pulse.api.dto.AuthDtos;
import com.pulse.api.entity.SysAdmin;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.support.UserIdentityAllocator;
import com.pulse.api.vo.LoginVO;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.constant.SecurityConstants;
import com.pulse.common.exception.BizException;
import com.pulse.common.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class AuthService {
    private static final ObjectMapper SESSION_EVENT_MAPPER = new ObjectMapper();
    private static final String LOGIN_FAIL_KEY = "pulse:auth:fail:";
    private static final String LOGIN_LOCK_KEY = "pulse:auth:lock:";
    private static final int LOGIN_MAX_FAILURES = 5;
    private static final long LOGIN_FAIL_TTL_SECONDS = 900L;
    private static final long LOGIN_LOCK_TTL_SECONDS = 900L;

    private final SysUserMapper userMapper;
    private final SysAdminMapper adminMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redis;
    private final SmsProperties smsProperties;
    private final UserIdentityAllocator identityAllocator;
    private final LoginLogService loginLogService;
    private final AdminAuditService adminAuditService;
    private final AdminPermissionService adminPermissionService;
    private final JdbcTemplate jdbcTemplate;
    private final DefaultFriendService defaultFriendService;
    private final ClientAccessConfigService clientAccessConfigService;
    private NicknameConfigService nicknameConfigService;

    @Autowired
    public void setNicknameConfigService(NicknameConfigService nicknameConfigService) {
        this.nicknameConfigService = nicknameConfigService;
    }

    public void sendSms(AuthDtos.SendSmsReq req) {
        String scene = StringUtils.hasText(req.getScene()) ? req.getScene().trim().toLowerCase() : "login";
        if ("login".equals(scene)) {
            clientAccessConfigService.assertWindowsPhoneLogin(req.getPlatform());
        } else if ("register".equals(scene)) {
            clientAccessConfigService.assertWindowsRegister(req.getPlatform());
        }
        if ("register".equals(scene) || "change_phone".equals(scene)) {
            if (findUserByPhone(req.getPhone()) != null) {
                throw new BizException("手机号已注册");
            }
        } else if ("reset".equals(scene) || "change_password".equals(scene)) {
            if (findUserByPhone(req.getPhone()) == null) {
                throw new BizException("该手机号未注册");
            }
        }
        String code = smsProperties.getDevFixedCode();
        redis.opsForValue().set(
                RedisKeys.smsCode(req.getPhone()),
                code,
                smsProperties.getExpireSeconds(),
                TimeUnit.SECONDS
        );
    }

    public LoginVO loginByPassword(AuthDtos.LoginPasswordReq req) {
        clientAccessConfigService.assertWindowsPhoneLogin(req.getPlatform());
        String scope = "pw:" + req.getPhone();
        checkLoginLocked(scope);
        SysUser user = findUserByPhone(req.getPhone());
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            recordLoginFailure(scope);
            loginLogService.recordFailure(req.getPhone(), "password", "手机号或密码错误");
            throw new BizException("手机号或密码错误");
        }
        try {
            assertActive(user);
        } catch (BizException e) {
            recordLoginFailure(scope);
            loginLogService.recordFailure(req.getPhone(), "password", e.getMessage());
            throw e;
        }
        SecurityCheckResult security = verifySecurityCode(user, req.getDeviceId(), req.getSecurityCode());
        if (!security.ok()) {
            recordLoginFailure(scope);
            loginLogService.recordFailure(
                    req.getPhone(),
                    "password",
                    security.failReason(),
                    false,
                    security.newDevice()
            );
            throw new BizException(security.failReason());
        }
        String deviceId = registerDevice(user, req.getDeviceId(), req.getDeviceName(), req.getPlatform(), security.checked(), true, true);
        LoginVO vo = buildLogin(user, deviceId);
        clearLoginFailures(scope);
        loginLogService.recordSuccess(user, "password", security.checked(), security.newDevice());
        return vo;
    }

    public LoginVO loginBySms(AuthDtos.LoginSmsReq req) {
        clientAccessConfigService.assertWindowsPhoneLogin(req.getPlatform());
        try {
            verifyCode(req.getPhone(), req.getCode());
        } catch (BizException e) {
            loginLogService.recordFailure(req.getPhone(), "sms", e.getMessage());
            throw e;
        }
        SysUser user = findUserByPhone(req.getPhone());
        if (user == null) {
            loginLogService.recordFailure(req.getPhone(), "sms", "用户不存在");
            throw new BizException("用户不存在，请先注册");
        }
        try {
            assertActive(user);
        } catch (BizException e) {
            loginLogService.recordFailure(req.getPhone(), "sms", e.getMessage());
            throw e;
        }
        String deviceId = registerDevice(user, req.getDeviceId(), req.getDeviceName(), req.getPlatform(), false, true, true);
        LoginVO vo = buildLogin(user, deviceId);
        // 短信验证码本身已完成手机号所有权校验，无需再次校验账号安全码。
        loginLogService.recordSuccess(user, "sms", false, false);
        return vo;
    }

    /** 手机端已确认桌面二维码后的无密码登录。 */
    public LoginVO loginByQr(Long userId, String deviceId, String deviceName, String platform) {
        clientAccessConfigService.assertWindowsQrLogin(platform);
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        assertActive(user);
        touchLastOnline(user);
        String activeDeviceId = registerDevice(user, deviceId, deviceName, platform, true, true, true);
        LoginVO vo = buildLogin(user, activeDeviceId);
        loginLogService.recordSuccess(user, "qr", true, false);
        return vo;
    }

    /**
     * @return ok=false 时带失败原因；ok=true 时 checked 表示是否刚校验过安全码，newDevice 表示本次为未信任设备
     */
    private SecurityCheckResult verifySecurityCode(SysUser user, String deviceId, String securityCode) {
        if (!Boolean.TRUE.equals(user.getSecurityCodeEnabled())) {
            return SecurityCheckResult.ok(false, false);
        }
        String device = StringUtils.hasText(deviceId) ? deviceId.trim() : "";
        Integer trusted = device.isEmpty() ? 0 : jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user_trusted_device WHERE user_id=? AND device_id=? AND trusted=TRUE AND revoked_at IS NULL",
                Integer.class, user.getId(), device);
        if (trusted != null && trusted > 0) {
            return SecurityCheckResult.ok(false, false);
        }
        if (!StringUtils.hasText(securityCode)) {
            return SecurityCheckResult.fail("SECURITY_CODE_REQUIRED", true);
        }
        if (user.getSecurityCode() == null
                || !user.getSecurityCode().equalsIgnoreCase(securityCode.trim())) {
            return SecurityCheckResult.fail("安全码错误", true);
        }
        return SecurityCheckResult.ok(true, true);
    }

    private record SecurityCheckResult(boolean ok, boolean checked, boolean newDevice, String failReason) {
        static SecurityCheckResult ok(boolean checked, boolean newDevice) {
            return new SecurityCheckResult(true, checked, newDevice, null);
        }

        static SecurityCheckResult fail(String reason, boolean newDevice) {
            return new SecurityCheckResult(false, false, newDevice, reason);
        }
    }

    @Transactional
    public LoginVO register(AuthDtos.RegisterReq req) {
        clientAccessConfigService.assertWindowsRegister(req.getPlatform());
        try {
            verifyCode(req.getPhone(), req.getCode());
        } catch (BizException e) {
            loginLogService.recordFailure(req.getPhone(), "register", e.getMessage());
            throw e;
        }
        if (findUserByPhone(req.getPhone()) != null) {
            loginLogService.recordFailure(req.getPhone(), "register", "手机号已注册");
            throw new BizException("手机号已注册");
        }
        SysUser user = new SysUser();
        user.setId(identityAllocator.allocateUserId());
        user.setPhone(req.getPhone());
        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        user.setWalletBalance(0L);
        user.setNickname(normalizeUserNickname(req.getNickname()));
        user.setAvatarUrl(normalizeAvatarUrl(req.getAvatarUrl()));
        user.setStatus(1);
        user.setPulseId(identityAllocator.allocatePulseId());
        user.setCreatedAt(OffsetDateTime.now());
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.insert(user);
        defaultFriendService.applyToNewUser(user.getId());
        redis.delete(RedisKeys.smsCode(req.getPhone()));
        String deviceId = registerDevice(user, req.getDeviceId(), req.getDeviceName(), req.getPlatform(), false, true, true);
        LoginVO vo = buildLogin(user, deviceId);
        loginLogService.recordSuccess(user, "register");
        return vo;
    }

    private String normalizeUserNickname(String raw) {
        if (nicknameConfigService != null) {
            return nicknameConfigService.normalizeUserNickname(raw);
        }
        String nickname = raw == null ? "" : raw.trim();
        if (!StringUtils.hasText(nickname)) {
            throw new BizException("用户昵称不能为空");
        }
        if (nickname.length() > 32) {
            throw new BizException("用户昵称不能超过32个字符");
        }
        return nickname;
    }

    @Transactional
    public void resetPassword(AuthDtos.ResetPasswordReq req) {
        verifyCode(req.getPhone(), req.getCode());
        SysUser user = findUserByPhone(req.getPhone());
        if (user == null) {
            throw new BizException("用户不存在");
        }
        assertActive(user);
        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
        redis.delete(RedisKeys.smsCode(req.getPhone()));
        redis.opsForValue().increment(RedisKeys.userAuthVersion(user.getId()));
    }

    /** 拒绝 dataURL / 超长字符串，避免 varchar(512) 溢出 */
    private String normalizeAvatarUrl(String avatarUrl) {
        if (!StringUtils.hasText(avatarUrl)) {
            return null;
        }
        String url = avatarUrl.trim();
        if (url.startsWith("data:") || url.length() > 512) {
            return null;
        }
        return url;
    }

    public LoginVO adminLogin(AuthDtos.AdminLoginReq req) {
        String username = req.getUsername() == null ? "" : req.getUsername().trim();
        String scope = "adm:" + username;
        checkLoginLocked(scope);
        try {
            SysAdmin admin = adminMapper.selectOne(new LambdaQueryWrapper<SysAdmin>()
                    .eq(SysAdmin::getUsername, username));
            if (admin == null || !passwordEncoder.matches(req.getPassword(), admin.getPasswordHash())) {
                recordLoginFailure(scope);
                throw new BizException("用户名或密码错误");
            }
            if (admin.getStatus() != null && admin.getStatus() != 1) {
                recordLoginFailure(scope);
                throw new BizException("账号已禁用");
            }
            String token = jwtUtil.createToken(admin.getId(), SecurityConstants.ROLE_ADMIN);
            clearLoginFailures(scope);
            adminAuditService.recordLoginSuccess(admin);
            return buildAdminLogin(admin, token);
        } catch (BizException e) {
            adminAuditService.recordLoginFailure(username, e.getMessage());
            throw e;
        }
    }

    public LoginVO getAdminProfile(Long adminId) {
        SysAdmin admin = requireAdmin(adminId);
        return buildAdminLogin(admin, null);
    }

    @Transactional
    public LoginVO updateAdminProfile(Long adminId, String nickname, String avatarUrl) {
        SysAdmin admin = requireAdmin(adminId);
        if (nickname != null) {
            String n = nickname.trim();
            if (!StringUtils.hasText(n)) {
                throw new BizException("昵称不能为空");
            }
            if (n.length() > 32) {
                throw new BizException("昵称过长");
            }
            admin.setNickname(n);
        }
        if (avatarUrl != null) {
            admin.setAvatarUrl(normalizeAvatarUrl(avatarUrl));
        }
        adminMapper.updateById(admin);
        return getAdminProfile(adminId);
    }

    @Transactional
    public void changeAdminPassword(Long adminId, String oldPassword, String newPassword) {
        SysAdmin admin = requireAdmin(adminId);
        if (!StringUtils.hasText(oldPassword) || !StringUtils.hasText(newPassword)) {
            throw new BizException("请填写原密码和新密码");
        }
        if (newPassword.length() < 6 || newPassword.length() > 32) {
            throw new BizException("新密码长度需为 6-32 位");
        }
        if (!passwordEncoder.matches(oldPassword, admin.getPasswordHash())) {
            throw new BizException("原密码不正确");
        }
        if (passwordEncoder.matches(newPassword, admin.getPasswordHash())) {
            throw new BizException("新密码不能与原密码相同");
        }
        admin.setPasswordHash(passwordEncoder.encode(newPassword));
        adminMapper.updateById(admin);
    }

    private SysAdmin requireAdmin(Long adminId) {
        if (adminId == null) {
            throw new BizException("未登录");
        }
        SysAdmin admin = adminMapper.selectById(adminId);
        if (admin == null) {
            throw new BizException("管理员不存在");
        }
        if (admin.getStatus() != null && admin.getStatus() != 1) {
            throw new BizException("账号已禁用");
        }
        return admin;
    }

    private LoginVO buildAdminLogin(SysAdmin admin, String token) {
        return LoginVO.builder()
                .token(token)
                .userId(admin.getId())
                .username(admin.getUsername())
                .nickname(admin.getNickname())
                .avatarUrl(admin.getAvatarUrl())
                .superAdmin(Boolean.TRUE.equals(admin.getSuperAdmin()))
                .permissions(adminPermissionService.resolvePermissions(admin))
                .build();
    }

    private void verifyCode(String phone, String code) {
        String cached = redis.opsForValue().get(RedisKeys.smsCode(phone));
        if (!StringUtils.hasText(cached) || !cached.equals(code)) {
            throw new BizException("验证码错误或已过期");
        }
    }

    private SysUser findUserByPhone(String phone) {
        return userMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getPhone, phone));
    }

    private void assertActive(SysUser user) {
        if (user == null) {
            return;
        }
        if (user.getStatus() == null || user.getStatus() == 1) {
            return;
        }
        // 限时封禁到期自动解封
        if (user.getBanUntil() != null && !user.getBanUntil().isAfter(OffsetDateTime.now())) {
            user.setStatus(1);
            user.setBanUntil(null);
            user.setBanReason(null);
            user.setUpdatedAt(OffsetDateTime.now());
            userMapper.updateById(user);
            return;
        }
        if (user.getBanUntil() == null) {
            throw new BizException("账号已被永久封禁");
        }
        String until = user.getBanUntil().toString().replace('T', ' ');
        if (until.length() > 19) {
            until = until.substring(0, 19);
        }
        throw new BizException("账号已被封禁，解封时间：" + until);
    }

    private LoginVO buildLogin(SysUser user) {
        return buildLogin(user, null);
    }

    private LoginVO buildLogin(SysUser user, String deviceId) {
        identityAllocator.ensurePulseId(user);
        String token = jwtUtil.createToken(
                user.getId(), SecurityConstants.ROLE_USER, currentUserAuthVersion(user.getId()), deviceId);
        return LoginVO.builder()
                .token(token)
                .userId(user.getId())
                .pulseId(user.getPulseId())
                .nickname(user.getNickname())
                .avatarUrl(user.getAvatarUrl())
                .phone(user.getPhone())
                .build();
    }

    public LoginVO refreshToken(Long userId, String deviceId) {
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        assertActive(user);
        touchLastOnline(user);
        String activeDeviceId = registerDevice(user, deviceId, null, null, false, false, false);
        return buildLogin(user, activeDeviceId);
    }

    /** 登出当前设备；没有设备标识的旧令牌继续走全量吊销兜底。 */
    public void logout(Long userId, String deviceId) {
        if (userId == null) {
            return;
        }
        if (StringUtils.hasText(deviceId)) {
            revokeDevice(userId, deviceId);
            notifyDeviceRevoked(userId, deviceId, "logout");
            return;
        }
        redis.opsForValue().increment(RedisKeys.userAuthVersion(userId));
        redis.delete(RedisKeys.online(userId));
        redis.delete(RedisKeys.conn(userId));
        notifyAllDevicesRevoked(userId, "logout");
    }

    private void notifyDeviceRevoked(Long userId, String deviceId, String reason) {
        try {
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, SESSION_EVENT_MAPPER.writeValueAsString(
                    java.util.Map.of("event", "session_logout", "toUserId", userId,
                            "deviceId", deviceId, "reason", reason)));
        } catch (Exception ignored) {
            // Session invalidation remains effective even if the realtime notification fails.
        }
    }

    private void notifyAllDevicesRevoked(Long userId, String reason) {
        try {
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, SESSION_EVENT_MAPPER.writeValueAsString(
                    java.util.Map.of("event", "session_logout", "toUserId", userId,
                            "deviceId", "", "reason", reason)));
        } catch (Exception ignored) {
            // Session invalidation remains effective even if the realtime notification fails.
        }
    }

    private long currentUserAuthVersion(Long userId) {
        String value = redis.opsForValue().get(RedisKeys.userAuthVersion(userId));
        return StringUtils.hasText(value) ? Long.parseLong(value) : 0L;
    }

    private String registerDevice(SysUser user, String deviceId, String deviceName, String platform, boolean trusted, boolean claimExclusive, boolean login) {
        String device = deviceId == null ? "" : deviceId.trim();
        if (user == null || device.isEmpty() || device.length() > 128) {
            return device.isEmpty() ? null : device.substring(0, Math.min(device.length(), 128));
        }
        String name = normalizeDeviceField(deviceName, 128);
        String normalizedPlatform = normalizeDeviceField(platform, 32);
        // Old desktop-web and mobile-web builds shared one localStorage key
        // (pulse_device_id) on the same origin, which let the same device_id
        // stay active under two accounts and made them kick each other in a
        // loop. When a fresh login claims an id still active under another
        // account, revoke the old owner's record and invalidate its session
        // immediately. Token refresh only extends the current session and must
        // not steal the id back, otherwise two legacy clients keep fighting.
        if (claimExclusive) {
            java.util.List<Long> previousOwners = jdbcTemplate.queryForList(
                    "SELECT DISTINCT user_id FROM sys_user_trusted_device WHERE device_id=? AND user_id<>? AND revoked_at IS NULL",
                    Long.class, device, user.getId());
            if (!previousOwners.isEmpty()) {
                jdbcTemplate.update("""
                        UPDATE sys_user_trusted_device
                           SET revoked_at=NOW(), last_active_at=NOW()
                         WHERE device_id=? AND user_id<>? AND revoked_at IS NULL
                        """, device, user.getId());
                for (Long owner : previousOwners) {
                    redis.opsForValue().set(RedisKeys.userDeviceRevoked(owner, device), "1");
                    notifyDeviceRevoked(owner, device, "device_claimed_by_other_account");
                }
            }
        }
        jdbcTemplate.update("""
                INSERT INTO sys_user_trusted_device(
                    user_id, device_id, device_name, platform, trusted, trusted_at, login_at, last_active_at, revoked_at)
                VALUES (?, ?, ?, ?, ?, CASE WHEN ? THEN NOW() ELSE NULL END, NOW(), NOW(), NULL)
                ON CONFLICT (user_id, device_id) DO UPDATE SET
                    device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), sys_user_trusted_device.device_name),
                    platform = COALESCE(NULLIF(EXCLUDED.platform, ''), sys_user_trusted_device.platform),
                    trusted = CASE WHEN EXCLUDED.trusted THEN TRUE ELSE sys_user_trusted_device.trusted END,
                    trusted_at = CASE WHEN EXCLUDED.trusted THEN NOW() ELSE sys_user_trusted_device.trusted_at END,
                    login_at = CASE WHEN ? THEN NOW() ELSE sys_user_trusted_device.login_at END,
                    last_active_at = NOW(),
                    revoked_at = NULL
                """, user.getId(), device, name == null ? "" : name,
                normalizedPlatform == null ? "" : normalizedPlatform, trusted, trusted, login);
        redis.delete(RedisKeys.userDeviceRevoked(user.getId(), device));
        return device;
    }

    private String normalizeDeviceField(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private void revokeDevice(Long userId, String deviceId) {
        String device = deviceId == null ? "" : deviceId.trim();
        if (!StringUtils.hasText(device)) {
            return;
        }
        jdbcTemplate.update("""
                UPDATE sys_user_trusted_device
                   SET revoked_at=NOW(), last_active_at=NOW()
                 WHERE user_id=? AND device_id=? AND revoked_at IS NULL
                """, userId, device);
        redis.opsForValue().set(RedisKeys.userDeviceRevoked(userId, device), "1");
    }

    private void checkLoginLocked(String scope) {
        if (Boolean.TRUE.equals(redis.hasKey(LOGIN_LOCK_KEY + scope))) {
            throw new BizException("尝试次数过多，请15分钟后再试");
        }
    }

    private void recordLoginFailure(String scope) {
        String failKey = LOGIN_FAIL_KEY + scope;
        Long count = redis.opsForValue().increment(failKey);
        if (count != null && count == 1) {
            redis.expire(failKey, LOGIN_FAIL_TTL_SECONDS, TimeUnit.SECONDS);
        }
        if (count != null && count >= LOGIN_MAX_FAILURES) {
            redis.opsForValue().set(LOGIN_LOCK_KEY + scope, "1", LOGIN_LOCK_TTL_SECONDS, TimeUnit.SECONDS);
            redis.delete(failKey);
        }
    }

    private void clearLoginFailures(String scope) {
        redis.delete(LOGIN_FAIL_KEY + scope);
        redis.delete(LOGIN_LOCK_KEY + scope);
    }

    private void touchLastOnline(SysUser user) {
        if (user == null || user.getId() == null) {
            return;
        }
        OffsetDateTime now = OffsetDateTime.now();
        user.setLastOnlineAt(now);
        user.setUpdatedAt(now);
        userMapper.updateById(user);
        redis.opsForValue().set(RedisKeys.lastOnline(user.getId()), now.toString());
    }
}
