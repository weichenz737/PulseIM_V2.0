package com.pulse.api.service;

import com.pulse.api.support.UserIdentityAllocator;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Ensures every user has a normal private conversation with the built-in file
 * transfer assistant. Messages continue to use the regular IM pipeline.
 */
@Service
@RequiredArgsConstructor
public class FileTransferAssistantService {
    private static final long ASSISTANT_LOCK_ID = 7_041_155_021L;
    private static final String ASSISTANT_NAME = "文件传输助手";

    private final JdbcTemplate jdbcTemplate;
    private final UserIdentityAllocator identityAllocator;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public void ensureForUser(Long userId) {
        if (userId == null) {
            return;
        }
        Long assistantId = ensureAssistantUser();
        if (userId.equals(assistantId)) {
            return;
        }

        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, remark, created_at)
                VALUES (?, ?, NULL, NOW())
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """, userId, assistantId);
        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, remark, created_at)
                VALUES (?, ?, NULL, NOW())
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """, assistantId, userId);

        Long conversationId = jdbcTemplate.query("""
                SELECT m1.conversation_id
                  FROM im_conversation_member m1
                  JOIN im_conversation_member m2
                    ON m2.conversation_id = m1.conversation_id
                   AND m2.user_id = ?
                  JOIN im_conversation c ON c.id = m1.conversation_id AND c.type = 1
                 WHERE m1.user_id = ?
                 ORDER BY m1.conversation_id
                 LIMIT 1
                """, ps -> {
                    ps.setLong(1, assistantId);
                    ps.setLong(2, userId);
                }, rs -> rs.next() ? rs.getLong(1) : null);
        if (conversationId == null) {
            conversationId = jdbcTemplate.queryForObject("""
                    INSERT INTO im_conversation(
                        type, title, last_msg_preview, last_msg_time, created_at, updated_at)
                    VALUES (1, ?, '可以把文件发送到这里', NOW(), NOW(), NOW())
                    RETURNING id
                    """, Long.class, ASSISTANT_NAME);
        }

        insertMember(conversationId, userId, assistantId);
        insertMember(conversationId, assistantId, userId);
    }

    public boolean isAssistant(Long userId) {
        if (userId == null) {
            return false;
        }
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE id = ? AND file_transfer_assistant = TRUE",
                Integer.class, userId);
        return count != null && count > 0;
    }

    private void insertMember(Long conversationId, Long userId, Long peerUserId) {
        jdbcTemplate.update("""
                INSERT INTO im_conversation_member(
                    conversation_id, user_id, unread_count, mute, archived, pinned, hidden,
                    peer_user_id, role, joined_at)
                VALUES (?, ?, 0, FALSE, FALSE, FALSE, FALSE, ?, 'member', NOW())
                ON CONFLICT (conversation_id, user_id) DO UPDATE SET
                    peer_user_id = EXCLUDED.peer_user_id,
                    hidden = FALSE
                """, conversationId, userId, peerUserId);
    }

    private Long ensureAssistantUser() {
        jdbcTemplate.execute("SELECT pg_advisory_xact_lock(" + ASSISTANT_LOCK_ID + ")");
        Long existing = jdbcTemplate.query("""
                SELECT id FROM sys_user
                 WHERE file_transfer_assistant = TRUE
                 ORDER BY id
                 LIMIT 1
                """, rs -> rs.next() ? rs.getLong(1) : null);
        if (existing != null) {
            return existing;
        }

        String phone = nextReservedPhone();
        Long id = identityAllocator.allocateUserId();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update("""
                INSERT INTO sys_user(
                    id, phone, password_hash, nickname, file_transfer_assistant,
                    status, created_at, updated_at)
                VALUES (?, ?, ?, ?, TRUE, 1, ?, ?)
                """, id, phone, passwordEncoder.encode(UUID.randomUUID().toString()),
                ASSISTANT_NAME, now, now);
        return id;
    }

    private String nextReservedPhone() {
        for (long suffix = 0; suffix < 1000; suffix++) {
            String candidate = "100000000" + String.format("%03d", suffix);
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_user WHERE phone = ?", Integer.class, candidate);
            if (count == null || count == 0) {
                return candidate;
            }
        }
        throw new IllegalStateException("无法为文件传输助手分配保留手机号");
    }
}
