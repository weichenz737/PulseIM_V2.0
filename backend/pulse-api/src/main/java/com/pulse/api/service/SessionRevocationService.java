package com.pulse.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.constant.RedisKeys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/** Publishes device-session revocations to the IM WebSocket layer. */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionRevocationService {
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * Revoke every active session for a user. The auth-version bump makes all
     * existing JWTs unusable, while the device rows and presence keys keep the
     * session/device views consistent. The websocket notification logs online
     * clients out immediately; the JWT check remains authoritative for offline
     * clients and in-flight requests.
     */
    public void revokeAllSessions(Long userId, String reason) {
        if (userId == null) return;
        redis.opsForValue().increment(RedisKeys.userAuthVersion(userId));
        jdbcTemplate.update("""
                UPDATE sys_user_trusted_device
                   SET revoked_at=NOW(), last_active_at=NOW()
                 WHERE user_id=? AND revoked_at IS NULL
                """, userId);
        redis.delete(RedisKeys.online(userId));
        redis.delete(RedisKeys.conn(userId));
        notifyAllDevicesRevoked(userId, reason);
    }

    public void notifyDeviceRevoked(Long userId, String deviceId, String reason) {
        if (userId == null || deviceId == null || deviceId.isBlank()) return;
        publish(userId, deviceId.trim(), reason);
    }

    public void notifyAllDevicesRevoked(Long userId, String reason) {
        if (userId == null) return;
        publish(userId, "", reason);
    }

    private void publish(Long userId, String deviceId, String reason) {
        try {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("event", "session_logout");
            event.put("toUserId", userId);
            event.put("deviceId", deviceId);
            event.put("reason", reason == null || reason.isBlank() ? "device_revoked" : reason);
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, objectMapper.writeValueAsString(event));
        } catch (Exception e) {
            log.warn("device session revoke notification failed userId={} deviceId={}: {}",
                    userId, deviceId, e.getMessage());
        }
    }
}
