package com.pulse.im.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pulse.common.constant.RedisKeys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 在线状态实时推送（P2 增强）：
 * 用户上线/下线时，将 presence 事件经 Redis pub/sub 广播给其私聊会话对端，
 * 对端收到后立即刷新在线状态，不再依赖轮询。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PresenceService {
    private static final int HIDE_FLAG_BATCH = 500;

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void publishOnline(Long userId) {
        publish(userId, true);
    }

    public void publishOffline(Long userId) {
        publish(userId, false);
    }

    /**
     * 将当前好友的在线状态补发给刚建立连接的设备，避免设备连接晚于好友上线事件而一直显示旧状态。
     */
    public void syncFor(Long viewerId) {
        if (viewerId == null) {
            return;
        }
        try {
            List<Long> peers = findPeers(viewerId);
            if (peers.isEmpty()) {
                return;
            }
            boolean viewerHides = hidesOnline(viewerId);
            Map<Long, Boolean> peerHides = loadHideFlags(peers);
            for (Long peer : peers) {
                boolean hidden = viewerHides || Boolean.TRUE.equals(peerHides.getOrDefault(peer, false));
                boolean online = StringUtils.hasText(redis.opsForValue().get(RedisKeys.online(peer)));
                publishEvent(viewerId, peer, !hidden && online, hidden);
            }
        } catch (Exception e) {
            log.warn("presence sync failed viewerId={}: {}", viewerId, e.getMessage());
        }
    }

    private void publish(Long userId, boolean online) {
        if (userId == null) {
            return;
        }
        try {
            List<Long> peers = findPeers(userId);
            if (peers.isEmpty()) {
                return;
            }
            boolean userHides = hidesOnline(userId);
            Map<Long, Boolean> peerHides = loadHideFlags(peers);
            for (Long peer : peers) {
                boolean hidden = userHides || Boolean.TRUE.equals(peerHides.getOrDefault(peer, false));
                publishEvent(peer, userId, !hidden && online, hidden);
            }
        } catch (Exception e) {
            log.warn("presence publish failed userId={}: {}", userId, e.getMessage());
        }
    }

    private List<Long> findPeers(Long userId) {
        return jdbcTemplate.query("""
                SELECT DISTINCT peer_user_id
                FROM (
                    SELECT m2.user_id AS peer_user_id
                    FROM im_conversation_member m1
                    JOIN im_conversation c ON c.id = m1.conversation_id AND c.type = 1
                    JOIN im_conversation_member m2
                      ON m2.conversation_id = m1.conversation_id AND m2.user_id <> m1.user_id
                    WHERE m1.user_id = ?
                    UNION ALL
                    SELECT f.user_id AS peer_user_id
                    FROM im_friend f
                    WHERE f.friend_id = ?
                    UNION ALL
                    SELECT f.friend_id AS peer_user_id
                    FROM im_friend f
                    WHERE f.user_id = ?
                ) peers
                WHERE peer_user_id IS NOT NULL AND peer_user_id <> ?
                """, (rs, rowNum) -> rs.getLong(1), userId, userId, userId, userId);
    }

    private void publishEvent(Long toUserId, Long userId, boolean online, boolean hidden) throws Exception {
        ObjectNode out = objectMapper.createObjectNode();
        out.put("event", "presence");
        out.put("toUserId", toUserId);
        out.put("userId", userId);
        out.put("online", online);
        out.put("onlineHidden", hidden);
        redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, objectMapper.writeValueAsString(out));
    }

    private boolean hidesOnline(Long userId) {
        List<Boolean> rows = jdbcTemplate.query(
                "SELECT hide_online_status FROM sys_user WHERE id = ?",
                (rs, rowNum) -> rs.getBoolean(1), userId);
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.get(0));
    }

    private Map<Long, Boolean> loadHideFlags(List<Long> peers) {
        Map<Long, Boolean> result = new HashMap<>();
        for (int i = 0; i < peers.size(); i += HIDE_FLAG_BATCH) {
            List<Long> chunk = peers.subList(i, Math.min(peers.size(), i + HIDE_FLAG_BATCH));
            String in = String.join(",", chunk.stream().map(String::valueOf).toList());
            jdbcTemplate.query(
                    "SELECT id, hide_online_status FROM sys_user WHERE id IN (" + in + ")",
                    (ResultSetExtractor<Void>) rs -> {
                        while (rs.next()) {
                            result.put(rs.getLong(1), rs.getBoolean(2));
                        }
                        return null;
                    });
        }
        return result;
    }
}
