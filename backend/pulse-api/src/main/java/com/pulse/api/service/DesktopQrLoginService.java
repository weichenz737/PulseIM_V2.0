package com.pulse.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.api.security.AuthContext;
import com.pulse.api.vo.LoginVO;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Redis-backed, single-use desktop QR login tickets. */
@Service
@RequiredArgsConstructor
public class DesktopQrLoginService {
    private static final long TTL_SECONDS = 120L;
    private final StringRedisTemplate redis;
    private final AuthService authService;
    private final ClientAccessConfigService clientAccessConfigService;
    private final ObjectMapper objectMapper;

    public Map<String, Object> start(Map<String, String> request) {
        clientAccessConfigService.assertWindowsQrLogin(request == null ? null : request.get("platform"));
        String ticket = UUID.randomUUID().toString().replace("-", "");
        String expiresAt = OffsetDateTime.now().plusSeconds(TTL_SECONDS).toString();
        Map<String, String> values = new LinkedHashMap<>();
        values.put("status", "PENDING");
        values.put("deviceId", normalize(request == null ? null : request.get("deviceId"), 128));
        values.put("deviceName", normalize(request == null ? null : request.get("deviceName"), 128));
        values.put("platform", normalize(request == null ? null : request.get("platform"), 32));
        values.put("expiresAt", expiresAt);
        String key = RedisKeys.desktopQrLogin(ticket);
        redis.opsForHash().putAll(key, values);
        redis.expire(key, TTL_SECONDS, TimeUnit.SECONDS);

        return Map.of(
                "ticket", ticket,
                "payload", "pulse://desktop-login/" + ticket,
                "expiresAt", expiresAt,
                "expiresIn", TTL_SECONDS
        );
    }

    public Map<String, Object> status(String ticket) {
        String key = key(ticket);
        Map<Object, Object> values = redis.opsForHash().entries(key);
        if (values.isEmpty()) {
            return Map.of("status", "EXPIRED");
        }
        clientAccessConfigService.assertWindowsQrLogin(String.valueOf(values.getOrDefault("platform", "")));
        String status = String.valueOf(values.getOrDefault("status", "EXPIRED"));
        if (isExpired(values)) {
            redis.delete(key);
            return Map.of("status", "EXPIRED");
        }
        if (!"CONFIRMED".equals(status)) {
            return Map.of(
                    "status", status,
                    "expiresAt", String.valueOf(values.getOrDefault("expiresAt", ""))
            );
        }
        Map<String, Object> login = readLogin(String.valueOf(values.get("login")));
        // The desktop consumes the token once. The Redis TTL remains a safety net
        // if the status response is interrupted after the server has confirmed it.
        redis.delete(key);
        return Map.of("status", "CONFIRMED", "login", login);
    }

    public Map<String, Object> confirm(String ticket) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            throw new BizException("请先在手机端登录");
        }
        String key = key(ticket);
        Map<Object, Object> values = redis.opsForHash().entries(key);
        if (values.isEmpty() || isExpired(values) || !"PENDING".equals(String.valueOf(values.get("status")))) {
            redis.delete(key);
            throw new BizException("二维码已失效，请刷新二维码");
        }
        String platform = String.valueOf(values.getOrDefault("platform", "windows"));
        clientAccessConfigService.assertWindowsQrLogin(platform);
        LoginVO login = authService.loginByQr(
                userId,
                String.valueOf(values.getOrDefault("deviceId", "")),
                String.valueOf(values.getOrDefault("deviceName", "Windows 客户端")),
                platform
        );
        try {
            Map<String, Object> loginPayload = objectMapper.convertValue(
                    login, new TypeReference<Map<String, Object>>() { });
            redis.opsForHash().putAll(key, Map.of(
                    "status", "CONFIRMED",
                    "login", objectMapper.writeValueAsString(loginPayload)
            ));
        } catch (Exception e) {
            throw new BizException("二维码登录确认失败");
        }
        return Map.of("status", "CONFIRMED");
    }

    private Map<String, Object> readLogin(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            throw new BizException("二维码登录结果无效，请刷新二维码");
        }
    }

    private String key(String ticket) {
        if (!StringUtils.hasText(ticket) || !ticket.matches("[A-Za-z0-9]{20,64}")) {
            throw new BizException("二维码无效，请刷新二维码");
        }
        return RedisKeys.desktopQrLogin(ticket.trim());
    }

    private boolean isExpired(Map<Object, Object> values) {
        String expiresAt = String.valueOf(values.getOrDefault("expiresAt", ""));
        try {
            return !StringUtils.hasText(expiresAt) || !OffsetDateTime.parse(expiresAt).isAfter(OffsetDateTime.now());
        } catch (Exception e) {
            return true;
        }
    }

    private String normalize(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String normalized = value.trim();
        return normalized.substring(0, Math.min(normalized.length(), maxLength));
    }
}
