package com.pulse.im.service;

import com.pulse.common.constant.RedisKeys;
import com.pulse.im.config.ImProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImMessageService {
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redis;
    private final ImProperties properties;
    private final SensitiveWordService sensitiveWordService;
    private final TransactionTemplate transactionTemplate;
    private final ImMessageExpiryPolicy expiryPolicy;

    public record EnqueuedMessage(String msgId, ImMessageExpiryPolicy.Snapshot expiry) {}

    public void markOnline(Long userId, String channelId) {
        markOnline(userId, null, channelId);
    }

    public void markOnline(Long userId, String deviceId, String channelId) {
        String node = properties.getIm().getNodeId();
        Duration ttl = Duration.ofSeconds(properties.getIm().getHeartbeatTimeoutSeconds() * 2L);
        redis.opsForValue().set(
                RedisKeys.online(userId),
                node + ":" + channelId,
                ttl
        );
        redis.opsForValue().set(
                RedisKeys.conn(userId),
                node + ":" + channelId,
                ttl
        );
        if (StringUtils.hasText(deviceId)) {
            redis.opsForValue().set(
                    RedisKeys.deviceOnline(userId, deviceId),
                    node + ":" + channelId,
                    ttl
            );
        }
        touchLastOnline(userId, true);
    }

    /** @return true when the expired lease had to be recreated. */
    public boolean refreshOnline(Long userId, String channelId) {
        return refreshOnline(userId, null, channelId);
    }

    /** @return true when the expired lease had to be recreated. */
    public boolean refreshOnline(Long userId, String deviceId, String channelId) {
        String key = RedisKeys.online(userId);
        String conn = RedisKeys.conn(userId);
        Duration ttl = Duration.ofSeconds(properties.getIm().getHeartbeatTimeoutSeconds() * 2L);
        Boolean has = redis.hasKey(key);
        if (Boolean.TRUE.equals(has)) {
            redis.expire(key, ttl);
            redis.expire(conn, ttl);
        } else {
            // key 已过期时重建，避免“已连着却显示离线”
            markOnline(userId, deviceId, channelId);
            return true;
        }
        if (StringUtils.hasText(deviceId)) {
            String deviceKey = RedisKeys.deviceOnline(userId, deviceId);
            if (Boolean.TRUE.equals(redis.hasKey(deviceKey))) {
                redis.expire(deviceKey, ttl);
            } else {
                redis.opsForValue().set(
                        deviceKey,
                        properties.getIm().getNodeId() + ":" + channelId,
                        ttl
                );
            }
        }
        touchLastOnline(userId, false);
        return false;
    }

    public void markOffline(Long userId) {
        markOffline(userId, null);
    }

    /**
     * 标记离线。若传入 channelId，仅当 Redis 中在线记录仍属于该连接时才清除，
     * 避免“新连接已上线、旧连接关闭”时把在线状态清掉。
     */
    public void markOffline(Long userId, String channelId) {
        if (userId == null) {
            return;
        }
        String key = RedisKeys.online(userId);
        if (channelId != null && !channelId.isBlank()) {
            String val = redis.opsForValue().get(key);
            if (val != null && !val.isBlank()) {
                String suffix = ":" + channelId;
                if (!val.endsWith(suffix)) {
                    return;
                }
            }
        }
        // 重连宽限：20 秒内重新 AUTH 会 markOnline 覆盖；否则自然过期为离线
        Duration grace = Duration.ofSeconds(10);
        Boolean has = redis.hasKey(key);
        if (Boolean.TRUE.equals(has)) {
            redis.expire(key, grace);
            redis.expire(RedisKeys.conn(userId), grace);
        } else {
            redis.delete(key);
            redis.delete(RedisKeys.conn(userId));
        }
        touchLastOnline(userId, true);
    }

    /**
     * 下线时只清除该设备自己的在线标记，不影响同账号其他设备（手机与电脑可同时在线）。
     * 传入 channelId 时，仅当该设备的在线记录仍属于该连接时才清除，避免新连接刚建立
     * 就被旧连接关闭事件误删。
     */
    public void markDeviceOffline(Long userId, String deviceId, String channelId) {
        if (userId == null || !StringUtils.hasText(deviceId)) {
            return;
        }
        String deviceKey = RedisKeys.deviceOnline(userId, deviceId);
        String value = redis.opsForValue().get(deviceKey);
        if (value != null && channelId != null && !channelId.isBlank()) {
            if (!value.endsWith(":" + channelId)) {
                return;
            }
        }
        // 重连宽限：10 秒内新连接 markOnline 会覆盖；否则自然过期为离线
        if (Boolean.TRUE.equals(redis.hasKey(deviceKey))) {
            redis.expire(deviceKey, Duration.ofSeconds(10));
        } else {
            redis.delete(deviceKey);
        }
    }

    /** 刷新最近在线：写 Redis；persistDb=true 时同步落库 */
    private void touchLastOnline(Long userId, boolean persistDb) {
        if (userId == null) {
            return;
        }
        String now = OffsetDateTime.now().toString();
        redis.opsForValue().set(RedisKeys.lastOnline(userId), now);
        if (persistDb) {
            try {
                jdbcTemplate.update(
                        "UPDATE sys_user SET last_online_at = NOW(), updated_at = NOW() WHERE id = ?",
                        userId
                );
            } catch (Exception ignored) {
                // 不影响在线状态主流程
            }
        }
    }

    /**
     * 异步落库入口（P1）：
     * 1) 同步只读校验（会话/成员/好友/拉黑/敏感词/长度），非法消息直接抛错；
     * 2) 客户端幂等去重；
     * 3) 消息入 Redis Stream 后立即返回 msgId（由调用方回 ACK 并推送）；
     * 4) Redis Stream 不可用时回退到同步落库，保证消息不丢。
     */
    public EnqueuedMessage enqueueMessage(Long fromUserId, long conversationId, long toUserId,
                                  int msgType, String content, String clientMsgId) {
        return enqueueMessage(fromUserId, conversationId, toUserId, msgType, content, clientMsgId,
                "", List.of(), false);
    }

    /**
     * Metadata-only WebSocket enqueue with the same reply/mention semantics as
     * the HTTP message endpoint. Attachment bytes never enter this payload.
     */
    public EnqueuedMessage enqueueMessage(Long fromUserId, long conversationId, long toUserId,
                                  int msgType, String content, String clientMsgId,
                                  String replyToMsgId, List<Long> mentionUserIds, boolean atAll) {
        validateMessage(fromUserId, conversationId, toUserId, msgType, content);
        String fileId = fileIdFromContent(content);
        if (msgType == 1 || msgType == 2 || msgType == 3) {
            if (!StringUtils.hasText(fileId)) {
                throw new IllegalArgumentException("file message requires fileId");
            }
            Integer owned = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM im_file WHERE file_id = ? AND uploader_id = ? AND status = 'READY'",
                    Integer.class, fileId, fromUserId);
            if (owned == null || owned == 0) throw new IllegalArgumentException("file is not uploaded by sender");
            content = "file:" + fileId;
        }

        String normalizedReplyToMsgId = StringUtils.hasText(replyToMsgId) ? replyToMsgId.trim() : "";
        if (!normalizedReplyToMsgId.isEmpty()) {
            Integer replyExists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM im_message WHERE msg_id = ? AND conversation_id = ?",
                    Integer.class, normalizedReplyToMsgId, conversationId);
            if (replyExists == null || replyExists == 0) {
                throw new IllegalArgumentException("reply target not found");
            }
        }

        boolean useAtAll = false;
        List<Long> normalizedMentions = List.of();
        if (msgType == 0) {
            if (atAll) {
                Boolean manager = jdbcTemplate.queryForObject("""
                        SELECT EXISTS (
                            SELECT 1
                            FROM im_conversation c
                            JOIN im_conversation_member m ON m.conversation_id = c.id AND m.user_id = ?
                            WHERE c.id = ? AND c.type = 2
                              AND (c.owner_id = ? OR LOWER(COALESCE(m.role, 'member')) IN ('owner', 'admin'))
                        )
                        """, Boolean.class, fromUserId, conversationId, fromUserId);
                if (!Boolean.TRUE.equals(manager)) {
                    throw new IllegalArgumentException("only group owner or admin can mention everyone");
                }
                useAtAll = true;
            } else {
                normalizedMentions = filterGroupMemberIds(conversationId, mentionUserIds, fromUserId);
            }
        }

        String msgId = UUID.randomUUID().toString().replace("-", "");
        ImMessageExpiryPolicy.Snapshot expiry = expiryPolicy.resolve(
                fromUserId, conversationId, msgType, OffsetDateTime.now());
        Map<String, Object> fields = new HashMap<>();
        fields.put("msgId", msgId);
        fields.put("conversationId", String.valueOf(conversationId));
        fields.put("fromUserId", String.valueOf(fromUserId));
        fields.put("toUserId", String.valueOf(toUserId));
        fields.put("msgType", String.valueOf(msgType));
        fields.put("content", content == null ? "" : content);
        fields.put("fileId", fileId == null ? "" : fileId);
        fields.put("clientMsgId", clientMsgId == null ? "" : clientMsgId);
        fields.put("replyToMsgId", normalizedReplyToMsgId);
        fields.put("mentionUserIds", joinIds(normalizedMentions));
        fields.put("atAll", String.valueOf(useAtAll));
        fields.put("sendTime", String.valueOf(System.currentTimeMillis()));
        fields.put("burnAfterRead", String.valueOf(expiry.burnAfterRead()));
        fields.put("burnSeconds", expiry.burnSeconds() == null ? "" : String.valueOf(expiry.burnSeconds()));
        fields.put("autoDeleteExpiresAt", expiry.autoDeleteExpiresAt() == null ? "" : expiry.autoDeleteExpiresAt().toString());
        try {
            // 近似 MAXLEN 增量裁剪，避免大批量精确 XTRIM 阻塞 Redis 单线程
            redis.execute((RedisConnection c) -> {
                Map<byte[], byte[]> body = new HashMap<>(fields.size());
                fields.forEach((k, v) -> body.put(
                        k.toString().getBytes(StandardCharsets.UTF_8),
                        String.valueOf(v).getBytes(StandardCharsets.UTF_8)));
                c.streamCommands().xAdd(
                        StreamRecords.mapBacked(body)
                                .withStreamKey(RedisKeys.IM_MSG_STREAM.getBytes(StandardCharsets.UTF_8)),
                        RedisStreamCommands.XAddOptions.maxlen(100_000).approximateTrimming(true));
                return null;
            });
            return new EnqueuedMessage(msgId, expiry);
        } catch (Exception e) {
            log.warn("IM stream enqueue failed, fallback to sync persist: {}", e.getMessage());
            return new EnqueuedMessage(persistSync(fromUserId, conversationId, toUserId, msgType, content, clientMsgId, msgId,
                    normalizedReplyToMsgId, normalizedMentions, useAtAll, expiry), expiry);
        }
    }

    /**
     * 同步落库（回退路径/兜底）：单事务写入，尽量少 commit。
     */
    private String persistSync(Long fromUserId, long conversationId, long toUserId,
                               int msgType, String content, String clientMsgId, String msgId,
                               String replyToMsgId, List<Long> mentionUserIds, boolean atAll,
                               ImMessageExpiryPolicy.Snapshot expiry) {
        transactionTemplate.executeWithoutResult(status -> {
            jdbcTemplate.update("""
                            INSERT INTO im_message(msg_id, conversation_id, from_user_id, msg_type, content, file_id,
                                                    client_msg_id, reply_to_msg_id, mention_user_ids, at_all,
                                                    burn_after_read, burn_seconds, auto_delete_expires_at, send_time)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
                            """,
                    msgId, conversationId, fromUserId, msgType, content, fileIdFromContent(content), clientMsgId,
                    StringUtils.hasText(replyToMsgId) ? replyToMsgId : null, joinIds(mentionUserIds), atAll,
                    expiry.burnAfterRead(), expiry.burnSeconds(), expiry.autoDeleteExpiresAt());
            jdbcTemplate.update("""
                            UPDATE im_conversation
                            SET last_msg_preview = ?, last_msg_time = NOW(), updated_at = NOW()
                            WHERE id = ?
                            """,
                    content == null ? "" : (content.length() > 100 ? content.substring(0, 100) : content),
                    conversationId);
            jdbcTemplate.update("""
                            UPDATE im_conversation_member
                            SET unread_count = COALESCE(unread_count, 0) + 1, hidden = FALSE
                            WHERE conversation_id = ? AND user_id <> ?
                            """,
                    conversationId, fromUserId);
            jdbcTemplate.update("""
                            UPDATE im_conversation_member SET hidden = FALSE
                            WHERE conversation_id = ? AND user_id = ?
                            """,
                    conversationId, fromUserId);
        });
        return msgId;
    }

    /** 只读校验，与原有同步路径保持一致：拒绝越权/非法消息 */
    private void validateMessage(Long fromUserId, long conversationId, long toUserId,
                                 int msgType, String content) {
        if (conversationId <= 0) {
            throw new IllegalArgumentException("invalid conversationId");
        }
        if (fromUserId == null) {
            throw new IllegalArgumentException("unauthorized");
        }
        if (toUserId > 0 && toUserId == fromUserId) {
            throw new IllegalArgumentException("cannot send message to self");
        }

        if (msgType < 0 || msgType > 6) {
            throw new IllegalArgumentException("unsupported msgType");
        }

        // 单条 SQL 合并路由校验：会话类型/全员禁言 + 成员角色/禁言 + 私聊对方 + 好友/拉黑状态，
        // 把原来 5~6 次串行往返压到 1 次，避免 Netty 事件循环被逐条查询占满。
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT c.type AS conv_type, c.mute_all AS mute_all,
                       m.role AS member_role, m.speak_muted AS speak_muted, m.peer_user_id AS peer_user_id,
                       f.id AS friend_id,
                       (SELECT COUNT(*) FROM im_user_block b
                         WHERE (b.user_id = ? AND b.blocked_user_id = m.peer_user_id)
                            OR (b.user_id = m.peer_user_id AND b.blocked_user_id = ?)) AS block_cnt
                FROM im_conversation c
                JOIN im_conversation_member m ON m.conversation_id = c.id AND m.user_id = ?
                LEFT JOIN im_friend f ON f.user_id = ? AND f.friend_id = m.peer_user_id
                WHERE c.id = ?
                """,
                fromUserId, fromUserId, fromUserId, fromUserId, conversationId);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("conversation not found or not a member");
        }
        Map<String, Object> row = rows.get(0);
        int convType = ((Number) row.get("conv_type")).intValue();

        if (convType == 1) {
            Long peer = row.get("peer_user_id") == null ? null : ((Number) row.get("peer_user_id")).longValue();
            if (peer == null) {
                peer = jdbcTemplate.query(
                        "SELECT user_id FROM im_conversation_member WHERE conversation_id = ? AND user_id <> ? ORDER BY id LIMIT 1",
                        (rs, rowNum) -> rs.getLong(1),
                        conversationId, fromUserId).stream().findFirst().orElse(null);
            }
            if (peer == null || (toUserId > 0 && toUserId != peer)) {
                throw new IllegalArgumentException("invalid private conversation target");
            }
            if (row.get("friend_id") == null) {
                throw new IllegalArgumentException("not friends, cannot send message");
            }
            long blockCnt = row.get("block_cnt") == null ? 0 : ((Number) row.get("block_cnt")).longValue();
            if (blockCnt > 0) {
                throw new IllegalArgumentException("blocked, cannot send message");
            }
        } else if (convType == 2) {
            String role = row.get("member_role") == null ? "member" : String.valueOf(row.get("member_role"));
            boolean ownerOrAdmin = "owner".equalsIgnoreCase(role) || "admin".equalsIgnoreCase(role);
            if (Boolean.TRUE.equals(row.get("mute_all")) && !ownerOrAdmin) {
                throw new IllegalArgumentException("group is muted");
            }
            if (Boolean.TRUE.equals(row.get("speak_muted")) && !ownerOrAdmin) {
                throw new IllegalArgumentException("speak muted");
            }
        } else {
            throw new IllegalArgumentException("unsupported conversation type");
        }

        if (msgType == 0 && content != null && !content.isBlank()) {
            assertTextClean(content);
        }
        if (content != null && content.length() > 5000) {
            throw new IllegalArgumentException("message too long");
        }
    }

    /** 会话内除发送者外的接收者列表（私聊定向 / 群聊广播共用） */
    public List<Long> listRecipientIds(long conversationId, long fromUserId) {
        return jdbcTemplate.query(
                "SELECT user_id FROM im_conversation_member WHERE conversation_id = ? AND user_id <> ?",
                (rs, rowNum) -> rs.getLong(1),
                conversationId, fromUserId);
    }

    /**
     * 返回需要接收实时消息的全部会话成员，包括发送者的其他设备。
     * 发送者当前设备由 IM 推送层按 sourceDeviceId 排除，避免重复回显。
     */
    public List<Long> listPushRecipientIds(long conversationId) {
        return jdbcTemplate.query(
                "SELECT user_id FROM im_conversation_member WHERE conversation_id = ?",
                (rs, rowNum) -> rs.getLong(1),
                conversationId);
    }

    private void assertTextClean(String content) {
        if (sensitiveWordService.contains(content)) {
            throw new IllegalArgumentException("message contains forbidden word");
        }
    }

    private List<Long> filterGroupMemberIds(long conversationId, List<Long> rawIds, Long excludeUserId) {
        if (rawIds == null || rawIds.isEmpty()) return List.of();
        LinkedHashSet<Long> wanted = new LinkedHashSet<>();
        for (Long id : rawIds) {
            if (id != null && id > 0 && !id.equals(excludeUserId)) wanted.add(id);
        }
        if (wanted.isEmpty()) return List.of();
        String placeholders = String.join(",", wanted.stream().map(id -> "?").toList());
        List<Object> args = new ArrayList<>();
        args.add(conversationId);
        args.addAll(wanted);
        return jdbcTemplate.query(
                "SELECT user_id FROM im_conversation_member WHERE conversation_id = ? AND user_id IN (" + placeholders + ") ORDER BY id",
                args.toArray(),
                (rs, rowNum) -> rs.getLong(1));
    }

    private static String joinIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return "";
        return ids.stream().filter(id -> id != null && id > 0).map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static String fileIdFromContent(String content) {
        if (content == null || !content.startsWith("file:")) return "";
        String value = content.substring("file:".length()).trim();
        return value.matches("[A-Za-z0-9_-]{16,64}") ? value : "";
    }
}
