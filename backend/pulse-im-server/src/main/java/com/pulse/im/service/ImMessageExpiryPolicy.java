package com.pulse.im.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

/** Snapshot the sender's retention settings when a WebSocket message is accepted. */
@Service
@RequiredArgsConstructor
public class ImMessageExpiryPolicy {
    private static final Set<Integer> BURN_TYPES = Set.of(0, 1, 2, 3, 5, 6);
    private final JdbcTemplate jdbcTemplate;

    public record Snapshot(Integer burnSeconds, OffsetDateTime autoDeleteExpiresAt) {
        public boolean burnAfterRead() { return burnSeconds != null; }
    }

    public Snapshot resolve(long fromUserId, long conversationId, int msgType, OffsetDateTime sentAt) {
        Integer burnSeconds = null;
        if (BURN_TYPES.contains(msgType)) {
            List<Integer> values = jdbcTemplate.query("""
                    SELECT s.burn_seconds FROM im_burn_after_read_setting s
                    JOIN im_conversation c ON c.id = s.conversation_id AND c.type = 1
                    WHERE s.user_id = ? AND s.conversation_id = ? AND s.enabled = TRUE
                    """, (rs, row) -> rs.getInt(1), fromUserId, conversationId);
            if (!values.isEmpty()) burnSeconds = values.get(0);
        }
        Integer ttlSeconds = jdbcTemplate.queryForObject("""
                SELECT MIN(s.ttl_seconds) FROM im_auto_delete_setting s
                JOIN im_conversation c ON c.id = s.conversation_id AND c.type = 1
                WHERE s.conversation_id = ? AND s.enabled = TRUE
                  AND EXISTS (SELECT 1 FROM im_conversation_member m
                              WHERE m.conversation_id = s.conversation_id AND m.user_id = s.user_id)
                  AND EXISTS (SELECT 1 FROM im_conversation_member m
                              WHERE m.conversation_id = s.conversation_id AND m.user_id = ?)
                """, Integer.class, conversationId, fromUserId);
        return new Snapshot(burnSeconds,
                ttlSeconds != null && ttlSeconds > 0 ? sentAt.plusSeconds(ttlSeconds) : null);
    }
}
