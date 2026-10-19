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
public class AutoDeleteMessageService {
    private static final int MIN_SECONDS = 60;
    private static final int MAX_SECONDS = 365 * 24 * 60 * 60;
    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getSetting(Long userId, Long conversationId) {
        requirePrivateMember(userId, conversationId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT m.user_id, s.enabled, s.ttl_seconds
                FROM im_conversation_member m
                LEFT JOIN im_auto_delete_setting s
                  ON s.user_id=m.user_id AND s.conversation_id=m.conversation_id
                WHERE m.conversation_id = ?
                """, conversationId);
        boolean enabled = false, peerEnabled = false;
        int seconds = 86400, peerSeconds = 86400;
        for (Map<String, Object> row : rows) {
            boolean mine = row.get("user_id") instanceof Number n && n.longValue() == userId;
            boolean rowEnabled = Boolean.TRUE.equals(row.get("enabled"));
            int rowSeconds = row.get("ttl_seconds") instanceof Number n ? n.intValue() : 86400;
            if (mine) { enabled = rowEnabled; seconds = rowSeconds; }
            else { peerEnabled = rowEnabled; peerSeconds = rowSeconds; }
        }
        Map<String, Object> out = payload(enabled, seconds);
        out.put("peerEnabled", peerEnabled);
        out.put("peerTtlSeconds", peerSeconds);
        return out;
    }

    @Transactional
    public Map<String, Object> updateSetting(Long userId, Long conversationId, boolean enabled, int seconds) {
        requirePrivateMember(userId, conversationId);
        if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
            throw new BizException("自动删除时间需设置在1分钟到365天之间");
        }
        jdbcTemplate.update("""
                INSERT INTO im_auto_delete_setting(user_id, conversation_id, enabled, ttl_seconds, updated_at)
                VALUES (?, ?, ?, ?, NOW())
                ON CONFLICT (user_id, conversation_id) DO UPDATE
                SET enabled=EXCLUDED.enabled, ttl_seconds=EXCLUDED.ttl_seconds, updated_at=NOW()
                """, userId, conversationId, enabled, seconds);
        return payload(enabled, seconds);
    }

    /**
     * Resolve the conversation-wide expiry for a newly sent message.
     *
     * Any enabled private-chat member activates auto-delete for both sides.
     * When the two members choose different TTLs, the shorter TTL wins so a
     * message never remains longer than either member's configured retention.
     */
    public OffsetDateTime resolveExpiry(Long userId, Long conversationId) {
        Integer seconds = resolveEffectiveTtlSeconds(userId, conversationId);
        return seconds == null ? null : OffsetDateTime.now().plusSeconds(seconds);
    }

    public Integer resolveEffectiveTtlSeconds(Long userId, Long conversationId) {
        List<Integer> values = jdbcTemplate.query("""
                SELECT s.ttl_seconds FROM im_auto_delete_setting s
                JOIN im_conversation c ON c.id=s.conversation_id AND c.type=1
                WHERE s.conversation_id=?
                  AND s.enabled=TRUE
                  AND EXISTS (
                      SELECT 1 FROM im_conversation_member configured_member
                      WHERE configured_member.conversation_id=s.conversation_id
                        AND configured_member.user_id=s.user_id
                  )
                  AND EXISTS (
                      SELECT 1 FROM im_conversation_member requester_member
                      WHERE requester_member.conversation_id=s.conversation_id
                        AND requester_member.user_id=?
                  )
                """, (rs, row) -> rs.getInt(1), conversationId, userId);
        return effectiveTtlSeconds(values);
    }

    static Integer effectiveTtlSeconds(List<Integer> enabledTtls) {
        return enabledTtls.stream()
                .filter(seconds -> seconds != null && seconds > 0)
                .min(Integer::compareTo)
                .orElse(null);
    }

    private void requirePrivateMember(Long userId, Long conversationId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM im_conversation c JOIN im_conversation_member m ON m.conversation_id=c.id
                WHERE c.id=? AND c.type=1 AND m.user_id=?
                """, Integer.class, conversationId, userId);
        if (count == null || count == 0) throw new BizException("自动删除记录仅支持好友私聊");
    }

    private Map<String, Object> payload(boolean enabled, int seconds) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled); out.put("ttlSeconds", seconds); return out;
    }
}
