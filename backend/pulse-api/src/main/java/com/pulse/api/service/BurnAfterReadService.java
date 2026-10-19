package com.pulse.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@EnableScheduling
@RequiredArgsConstructor
public class BurnAfterReadService {
    private static final Set<Integer> SUPPORTED_TYPES = Set.of(0, 1, 2, 3, 5, 6);

    private final JdbcTemplate jdbcTemplate;
    private final ImConversationMapper conversationMapper;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public Map<String, Object> getSetting(Long userId, Long conversationId) {
        requirePrivateMember(userId, conversationId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT enabled, burn_seconds
                FROM im_burn_after_read_setting
                WHERE user_id = ? AND conversation_id = ?
                """, userId, conversationId);
        boolean enabled = !rows.isEmpty() && Boolean.TRUE.equals(rows.get(0).get("enabled"));
        int seconds = rows.isEmpty() ? 10 : ((Number) rows.get(0).get("burn_seconds")).intValue();
        return settingPayload(conversationId, enabled, seconds);
    }

    @Transactional
    public Map<String, Object> updateSetting(Long userId, Long conversationId, boolean enabled, int seconds) {
        requirePrivateMember(userId, conversationId);
        if (seconds < 0 || seconds > 300) {
            throw new BizException("阅后即焚时间需设置在0到300秒之间");
        }
        jdbcTemplate.update("""
                INSERT INTO im_burn_after_read_setting(user_id, conversation_id, enabled, burn_seconds, updated_at)
                VALUES (?, ?, ?, ?, NOW())
                ON CONFLICT (user_id, conversation_id)
                DO UPDATE SET enabled = EXCLUDED.enabled,
                              burn_seconds = EXCLUDED.burn_seconds,
                              updated_at = NOW()
                """, userId, conversationId, enabled, seconds);
        return settingPayload(conversationId, enabled, seconds);
    }

    public Integer resolveBurnSeconds(Long userId, Long conversationId, int msgType) {
        if (!SUPPORTED_TYPES.contains(msgType)) {
            return null;
        }
        List<Integer> rows = jdbcTemplate.query("""
                SELECT s.burn_seconds
                FROM im_burn_after_read_setting s
                JOIN im_conversation c ON c.id = s.conversation_id AND c.type = 1
                WHERE s.user_id = ? AND s.conversation_id = ? AND s.enabled = TRUE
                """, (rs, rowNum) -> rs.getInt(1), userId, conversationId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * Starts countdowns only for burn messages sent by the peer and covered by the
     * recipient's current read watermark. Rows remain in im_message for audit.
     */
    @Transactional
    public List<Map<String, Object>> startCountdowns(Long readerId, Long conversationId, String lastReadMsgId) {
        if (lastReadMsgId == null || lastReadMsgId.isBlank()) {
            return List.of();
        }
        List<Map<String, Object>> started = jdbcTemplate.queryForList("""
                WITH target AS (
                    SELECT send_time FROM im_message
                    WHERE conversation_id = ? AND msg_id = ?
                ), updated AS (
                    UPDATE im_message m
                    SET burn_read_at = NOW(),
                        burn_expires_at = NOW() + (COALESCE(m.burn_seconds, 0) * INTERVAL '1 second')
                    FROM target
                    WHERE m.conversation_id = ?
                      AND m.from_user_id <> ?
                      AND m.burn_after_read = TRUE
                      AND m.burn_read_at IS NULL
                      AND m.msg_type <> 1
                      AND NOT (
                          m.msg_type = 2
                          AND COALESCE(m.content, '') ~* '"contentType"\\s*:\\s*"video/'
                      )
                      AND m.send_time <= target.send_time
                    RETURNING m.msg_id, m.burn_seconds, m.burn_read_at, m.burn_expires_at
                )
                SELECT * FROM updated
                """, conversationId, lastReadMsgId, conversationId, readerId);
        boolean expiredImmediately = false;
        for (Map<String, Object> row : started) {
            String msgId = String.valueOf(row.get("msg_id"));
            OffsetDateTime expiresAt = timestamp(row.get("burn_expires_at"));
            publishBurnEvent("burn_started", conversationId, msgId, expiresAt);
            if (((Number) row.get("burn_seconds")).intValue() == 0) {
                expiredImmediately = true;
                jdbcTemplate.update("""
                        UPDATE im_message
                        SET burn_expired_notified = TRUE
                        WHERE conversation_id = ?
                          AND msg_id = ?
                          AND burn_expired_notified = FALSE
                        """, conversationId, msgId);
                publishBurnEvent("burn_expired", conversationId, msgId, expiresAt);
            }
        }
        if (expiredImmediately) {
            refreshConversationPreview(conversationId);
        }
        return started;
    }

    /**
     * Images and videos start burning only after the recipient explicitly opens
     * the media. A normal conversation read receipt must not start them.
     */
    @Transactional
    public Map<String, Object> viewMedia(Long viewerId, Long conversationId, String msgId) {
        requirePrivateMember(viewerId, conversationId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                UPDATE im_message m
                SET burn_read_at = COALESCE(m.burn_read_at, NOW()),
                    burn_expires_at = COALESCE(
                        m.burn_expires_at,
                        NOW() + (COALESCE(m.burn_seconds, 0) * INTERVAL '1 second')
                    )
                WHERE m.conversation_id = ?
                  AND m.msg_id = ?
                  AND m.from_user_id <> ?
                  AND m.burn_after_read = TRUE
                  AND (
                      m.msg_type = 1
                      OR (
                          m.msg_type = 2
                          AND COALESCE(m.content, '') ~* '"contentType"\\s*:\\s*"video/'
                      )
                  )
                RETURNING m.msg_id, m.burn_seconds, m.burn_read_at, m.burn_expires_at
                """, conversationId, msgId, viewerId);
        if (rows.isEmpty()) {
            throw new BizException("只能查看收到的阅后即焚图片或视频");
        }

        Map<String, Object> row = rows.get(0);
        OffsetDateTime readAt = timestamp(row.get("burn_read_at"));
        OffsetDateTime expiresAt = timestamp(row.get("burn_expires_at"));
        Boolean notNotified = jdbcTemplate.queryForObject("""
                SELECT burn_expired_notified = FALSE
                FROM im_message
                WHERE conversation_id = ? AND msg_id = ?
                """, Boolean.class, conversationId, msgId);

        // Publishing an idempotent start event is harmless and repairs clients
        // that may have missed the first realtime event.
        publishBurnEvent("burn_started", conversationId, msgId, expiresAt);
        if (!expiresAt.isAfter(OffsetDateTime.now()) && Boolean.TRUE.equals(notNotified)) {
            jdbcTemplate.update("""
                    UPDATE im_message
                    SET burn_expired_notified = TRUE
                    WHERE conversation_id = ? AND msg_id = ?
                    """, conversationId, msgId);
            publishBurnEvent("burn_expired", conversationId, msgId, expiresAt);
            refreshConversationPreview(conversationId);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("msgId", msgId);
        out.put("burnReadAt", readAt);
        out.put("burnExpiresAt", expiresAt);
        return out;
    }

    public boolean isExpired(OffsetDateTime expiresAt) {
        return expiresAt != null && !expiresAt.isAfter(OffsetDateTime.now());
    }

    @Scheduled(fixedDelay = 250)
    public void publishNewExpirations() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                UPDATE im_message
                SET burn_expired_notified = TRUE
                WHERE id IN (
                    SELECT id FROM im_message
                    WHERE burn_after_read = TRUE
                      AND burn_expires_at IS NOT NULL
                      AND burn_expires_at <= NOW()
                      AND burn_expired_notified = FALSE
                    ORDER BY burn_expires_at
                    LIMIT 100
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING conversation_id, msg_id, burn_expires_at
                """);
        for (Map<String, Object> row : rows) {
            publishBurnEvent("burn_expired", ((Number) row.get("conversation_id")).longValue(),
                    String.valueOf(row.get("msg_id")), timestamp(row.get("burn_expires_at")));
        }
        rows.stream()
                .map(row -> ((Number) row.get("conversation_id")).longValue())
                .distinct()
                .forEach(this::refreshConversationPreview);
    }

    private void refreshConversationPreview(Long conversationId) {
        jdbcTemplate.update("""
                UPDATE im_conversation c
                SET last_msg_preview = COALESCE((
                        SELECT CASE
                            WHEN m.recalled = TRUE THEN '撤回了一条消息'
                            WHEN m.msg_type = 1 THEN '[图片]'
                            WHEN m.msg_type = 2 THEN '[文件]'
                            WHEN m.msg_type = 3 THEN '[语音]'
                            WHEN m.msg_type = 4 THEN '[聊天记录]'
                            WHEN m.msg_type = 5 THEN '[名片]'
                            WHEN m.msg_type = 6 THEN '[位置]'
                            WHEN m.msg_type = 9 THEN '[通话]'
                            ELSE LEFT(COALESCE(m.content, ''), 100)
                        END
                        FROM im_message m
                        WHERE m.conversation_id = c.id
                          AND (m.burn_expires_at IS NULL OR m.burn_expires_at > NOW())
                        ORDER BY m.send_time DESC, m.id DESC
                        LIMIT 1
                    ), ''),
                    last_msg_time = (
                        SELECT m.send_time
                        FROM im_message m
                        WHERE m.conversation_id = c.id
                          AND (m.burn_expires_at IS NULL OR m.burn_expires_at > NOW())
                        ORDER BY m.send_time DESC, m.id DESC
                        LIMIT 1
                    ),
                    updated_at = NOW()
                WHERE c.id = ?
                """, conversationId);
    }

    private void publishBurnEvent(String event, Long conversationId, String msgId, OffsetDateTime expiresAt) {
        List<Long> members = jdbcTemplate.query(
                "SELECT user_id FROM im_conversation_member WHERE conversation_id = ?",
                (rs, rowNum) -> rs.getLong(1), conversationId);
        for (Long userId : members) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("event", event);
                payload.put("cmd", "burn_expired".equals(event) ? "BURN_EXPIRED" : "BURN_STARTED");
                payload.put("toUserId", userId);
                payload.put("conversationId", conversationId);
                payload.put("msgId", msgId);
                payload.put("burnExpiresAt", expiresAt);
                redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, objectMapper.writeValueAsString(payload));
            } catch (Exception ignored) {
                // REST history filtering remains authoritative if realtime delivery fails.
            }
        }
    }

    private void requirePrivateMember(Long userId, Long conversationId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null || conversation.getType() == null || conversation.getType() != 1) {
            throw new BizException("阅后即焚仅支持好友私聊");
        }
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM im_conversation_member
                WHERE conversation_id = ? AND user_id = ?
                """, Integer.class, conversationId, userId);
        if (count == null || count == 0) {
            throw new BizException("你不在该会话中");
        }
    }

    private Map<String, Object> settingPayload(Long conversationId, boolean enabled, int seconds) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("conversationId", conversationId);
        out.put("enabled", enabled);
        out.put("burnSeconds", seconds);
        out.put("ttlSeconds", seconds);
        out.put("minSeconds", 0);
        out.put("maxSeconds", 300);
        return out;
    }

    private OffsetDateTime timestamp(Object value) {
        if (value instanceof OffsetDateTime dateTime) {
            return dateTime;
        }
        if (value instanceof ZonedDateTime dateTime) {
            return dateTime.toOffsetDateTime();
        }
        if (value instanceof Instant instant) {
            return instant.atOffset(ZoneOffset.UTC);
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant().atOffset(ZoneOffset.UTC);
        }
        if (value instanceof LocalDateTime dateTime) {
            return dateTime.atOffset(ZoneOffset.UTC);
        }
        return null;
    }
}
