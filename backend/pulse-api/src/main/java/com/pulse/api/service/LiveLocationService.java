package com.pulse.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LiveLocationService {
    // Mobile browsers may pause GPS callbacks while the device is stationary or
    // briefly backgrounded. Keep a wider grace period than the client heartbeat.
    private static final long ACTIVE_WINDOW_MS = 120_000L;
    private static final Duration SESSION_TTL = Duration.ofHours(2);

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public Map<String, Object> update(Long userId, Long conversationId, double latitude,
                                      double longitude, Double accuracy, Double heading, boolean start) {
        requireMember(userId, conversationId);
        if (Boolean.TRUE.equals(redis.hasKey(endedKey(conversationId)))) {
            if (start) redis.delete(endedKey(conversationId));
            else throw new BizException("本次位置共享已结束");
        }
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new BizException("位置信息无效");
        }
        Map<String, Object> profile = jdbcTemplate.queryForMap(
                "SELECT COALESCE(nickname, '') AS nickname, COALESCE(avatar_url, '') AS avatar_url FROM sys_user WHERE id = ?",
                userId);
        long now = System.currentTimeMillis();
        Map<String, Object> participant = new LinkedHashMap<>();
        participant.put("userId", String.valueOf(userId));
        participant.put("nickname", String.valueOf(profile.get("nickname")));
        participant.put("avatarUrl", String.valueOf(profile.get("avatar_url")));
        participant.put("latitude", latitude);
        participant.put("longitude", longitude);
        participant.put("accuracy", accuracy == null || !Double.isFinite(accuracy) ? 0D : Math.max(0D, accuracy));
        participant.put("heading", heading == null || !Double.isFinite(heading) ? null : heading);
        participant.put("updatedAt", now);
        try {
            String hashKey = hashKey(conversationId);
            String activeKey = activeKey(conversationId);
            String ownerKey = ownerKey(conversationId);
            if (start) {
                // A confirmed new session must replace any owner/session keys
                // left behind by a previously timed-out sharing session.
                redis.opsForValue().set(ownerKey, String.valueOf(userId), SESSION_TTL);
                redis.opsForValue().set(sessionKey(conversationId), UUID.randomUUID().toString(), SESSION_TTL);
            } else {
                redis.opsForValue().setIfAbsent(ownerKey, String.valueOf(userId), SESSION_TTL);
                redis.opsForValue().setIfAbsent(sessionKey(conversationId), UUID.randomUUID().toString(), SESSION_TTL);
            }
            redis.opsForHash().put(hashKey, String.valueOf(userId), objectMapper.writeValueAsString(participant));
            redis.opsForZSet().add(activeKey, String.valueOf(userId), now);
            redis.expire(hashKey, SESSION_TTL);
            redis.expire(activeKey, SESSION_TTL);
            redis.expire(ownerKey, SESSION_TTL);
            redis.expire(sessionKey(conversationId), SESSION_TTL);
        } catch (Exception e) {
            throw new BizException("实时位置更新失败");
        }
        return state(userId, conversationId);
    }

    public Map<String, Object> state(Long userId, Long conversationId) {
        requireMember(userId, conversationId);
        String hashKey = hashKey(conversationId);
        String activeKey = activeKey(conversationId);
        long cutoff = System.currentTimeMillis() - ACTIVE_WINDOW_MS;
        Set<String> stale = redis.opsForZSet().rangeByScore(activeKey, 0, cutoff);
        if (stale != null && !stale.isEmpty()) {
            redis.opsForHash().delete(hashKey, stale.toArray());
            redis.opsForZSet().remove(activeKey, stale.toArray());
        }
        Set<String> active = redis.opsForZSet().reverseRangeByScore(activeKey, cutoff + 1, Double.MAX_VALUE);
        List<Map<String, Object>> participants = new ArrayList<>();
        if (active != null) {
            for (String id : active) {
                Object raw = redis.opsForHash().get(hashKey, id);
                if (raw == null) continue;
                try {
                    Map<String, Object> item = objectMapper.readValue(String.valueOf(raw), new TypeReference<>() {});
                    item.put("mine", String.valueOf(userId).equals(id));
                    participants.add(item);
                } catch (Exception ignored) {
                    // Ignore a malformed or expired participant entry.
                }
            }
        }
        if (participants.isEmpty()) {
            clearSession(conversationId);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        String initiatorId = redis.opsForValue().get(ownerKey(conversationId));
        out.put("conversationId", String.valueOf(conversationId));
        out.put("active", !participants.isEmpty());
        out.put("initiatorId", initiatorId);
        out.put("initiator", String.valueOf(userId).equals(initiatorId));
        out.put("sessionId", redis.opsForValue().get(sessionKey(conversationId)));
        out.put("participants", participants);
        return out;
    }

    public void leave(Long userId, Long conversationId) {
        requireMember(userId, conversationId);
        String field = String.valueOf(userId);
        redis.opsForHash().delete(hashKey(conversationId), field);
        redis.opsForZSet().remove(activeKey(conversationId), field);
        Long remaining = redis.opsForZSet().zCard(activeKey(conversationId));
        if (remaining == null || remaining == 0) {
            clearSession(conversationId);
        }
    }

    public void end(Long userId, Long conversationId) {
        requireMember(userId, conversationId);
        String initiatorId = redis.opsForValue().get(ownerKey(conversationId));
        if (initiatorId == null || !String.valueOf(userId).equals(initiatorId)) {
            throw new BizException("只有位置共享发起人可以结束共享");
        }
        clearSession(conversationId);
        // Prevent a participant heartbeat that was already in flight from
        // recreating the session before clients receive the ended state.
        redis.opsForValue().set(endedKey(conversationId), "1", Duration.ofSeconds(10));
    }

    private void clearSession(Long conversationId) {
        redis.delete(List.of(hashKey(conversationId), activeKey(conversationId), ownerKey(conversationId), sessionKey(conversationId)));
    }

    private void requireMember(Long userId, Long conversationId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM im_conversation_member WHERE conversation_id = ? AND user_id = ?",
                Integer.class, conversationId, userId);
        if (count == null || count == 0) throw new BizException("你不在该会话中");
    }

    private String hashKey(Long conversationId) {
        return "im:live-location:" + conversationId + ":participants";
    }

    private String activeKey(Long conversationId) {
        return "im:live-location:" + conversationId + ":active";
    }

    private String ownerKey(Long conversationId) {
        return "im:live-location:" + conversationId + ":initiator";
    }

    private String endedKey(Long conversationId) {
        return "im:live-location:" + conversationId + ":ended";
    }

    private String sessionKey(Long conversationId) {
        return "im:live-location:" + conversationId + ":session";
    }
}
