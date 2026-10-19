package com.pulse.im.service;

import com.pulse.common.constant.RedisKeys;
import com.pulse.im.config.ImProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.stream.ByteRecord;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.PendingMessagesSummary;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * P1 批量落库消费者：
 * - 从 Redis Stream（pulse:im:msg:stream）按批读取消息；
 * - 单事务批量 INSERT + 会话/未读数 UPDATE（一次 commit）；
 * - 成功后 XACK；失败保留 pending 自动重试，超过次数丢弃并告警；
 * - 定时 XAUTOCLAIM 回收崩溃节点遗留的 pending 消息。
 * 多 IM 节点共享同一个 consumer group，落库任务在节点间分摊。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImMessageBatchConsumer {
    private static final String GROUP = "im-persist";
    private static final int BATCH_SIZE = 200;
    private static final int MAX_ATTEMPTS = 5;
    private static final long CLAIM_INTERVAL_MS = 60_000;
    private static final long CLAIM_MIN_IDLE_MS = 60_000;

    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final ImProperties properties;

    private final Map<String, Integer> attempts = new ConcurrentHashMap<>();
    private volatile String consumerName;
    private volatile long lastClaimAt;

    private record Entry(RecordId id, String msgId, long conversationId, long fromUserId,
                         long toUserId, int msgType, String content, String fileId, String clientMsgId,
                         String replyToMsgId, String mentionUserIds, boolean atAll) {
    }

    @PostConstruct
    public void init() {
        consumerName = properties.getIm().getNodeId() + "-" + UUID.randomUUID().toString().substring(0, 8);
        try {
            redis.execute((RedisConnection c) -> {
                c.streamCommands().xGroupCreate(
                        RedisKeys.IM_MSG_STREAM.getBytes(StandardCharsets.UTF_8),
                        GROUP,
                        ReadOffset.from("0"),
                        true);
                return null;
            });
            log.info("IM stream group ready, consumer={}", consumerName);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            if (!msg.contains("BUSYGROUP")) {
                log.warn("IM stream group init warn: {}", msg);
            }
        }
    }

    @Scheduled(fixedDelay = 50)
    public void poll() {
        List<MapRecord<String, Object, Object>> records;
        try {
            records = redis.opsForStream().read(
                    Consumer.from(GROUP, consumerName),
                    StreamReadOptions.empty().count(BATCH_SIZE),
                    StreamOffset.create(RedisKeys.IM_MSG_STREAM, ReadOffset.lastConsumed()));
        } catch (Exception e) {
            log.warn("IM stream read failed: {}", e.getMessage());
            return;
        }
        if (records != null && !records.isEmpty()) {
            List<Entry> entries = new ArrayList<>(records.size());
            for (MapRecord<String, Object, Object> r : records) {
                Map<Object, Object> v = r.getValue();
                Entry e = toEntry(r.getId(), v);
                if (e != null) {
                    entries.add(e);
                }
            }
            processEntries(entries);
        }
        maybeReclaim();
    }

    private void processEntries(List<Entry> entries) {
        if (entries.isEmpty()) {
            return;
        }
        List<RecordId> ids = entries.stream().map(Entry::id).toList();
        try {
            transactionTemplate.executeWithoutResult(status -> {
                List<Object[]> inserts = new ArrayList<>();
                for (Entry e : entries) {
                    if (e.clientMsgId() != null && !e.clientMsgId().isBlank()) {
                        List<String> existing = jdbcTemplate.query(
                                "SELECT msg_id FROM im_message WHERE client_msg_id = ? AND from_user_id = ? AND conversation_id = ? LIMIT 1",
                                (rs, n) -> rs.getString(1),
                                e.clientMsgId(), e.fromUserId(), e.conversationId());
                        if (!existing.isEmpty()) {
                            continue;
                        }
                    }
                    inserts.add(new Object[]{
                            e.msgId(), e.conversationId(), e.fromUserId(), e.msgType(),
                            e.content(), e.fileId(), e.clientMsgId() == null ? null : e.clientMsgId(),
                            e.replyToMsgId().isBlank() ? null : e.replyToMsgId(),
                            e.mentionUserIds().isBlank() ? null : e.mentionUserIds(), e.atAll()
                    });
                }
                if (!inserts.isEmpty()) {
                    jdbcTemplate.batchUpdate("""
                            INSERT INTO im_message(msg_id, conversation_id, from_user_id, msg_type, content, file_id,
                                                    client_msg_id, reply_to_msg_id, mention_user_ids, at_all, send_time)
                            VALUES (?,?,?,?,?,?,?,?,?,?,NOW())
                            """, inserts);
                }

                // 会话最新消息：同一会话只保留本批最后一条
                Map<Long, String> lastByConv = new LinkedHashMap<>();
                for (Entry e : entries) {
                    lastByConv.put(e.conversationId(), preview(e.content()));
                }
                List<Object[]> convArgs = new ArrayList<>(lastByConv.size());
                for (Map.Entry<Long, String> e : lastByConv.entrySet()) {
                    convArgs.add(new Object[]{e.getValue(), e.getKey()});
                }
                if (!convArgs.isEmpty()) {
                    jdbcTemplate.batchUpdate("""
                            UPDATE im_conversation
                            SET last_msg_preview = ?, last_msg_time = NOW(), updated_at = NOW()
                            WHERE id = ?
                            """, convArgs);
                }

                List<Object[]> unreadArgs = new ArrayList<>(entries.size());
                List<Object[]> senderArgs = new ArrayList<>(entries.size());
                for (Entry e : entries) {
                    unreadArgs.add(new Object[]{e.conversationId(), e.fromUserId()});
                    senderArgs.add(new Object[]{e.conversationId(), e.fromUserId()});
                }
                jdbcTemplate.batchUpdate("""
                        UPDATE im_conversation_member
                        SET unread_count = COALESCE(unread_count, 0) + 1, hidden = FALSE
                        WHERE conversation_id = ? AND user_id <> ?
                        """, unreadArgs);
                jdbcTemplate.batchUpdate("""
                        UPDATE im_conversation_member SET hidden = FALSE
                        WHERE conversation_id = ? AND user_id = ?
                        """, senderArgs);
            });

            redis.opsForStream().acknowledge(RedisKeys.IM_MSG_STREAM, GROUP, ids.toArray(RecordId[]::new));
            for (RecordId id : ids) {
                attempts.remove(id.getValue());
            }
        } catch (Exception e) {
            log.error("IM batch persist failed for {} entries: {}", entries.size(), e.getMessage());
            for (RecordId id : ids) {
                int n = attempts.merge(id.getValue(), 1, Integer::sum);
                if (n >= MAX_ATTEMPTS) {
                    log.error("IM drop poison stream entry {} after {} attempts", id.getValue(), n);
                    redis.opsForStream().acknowledge(RedisKeys.IM_MSG_STREAM, GROUP, id);
                    attempts.remove(id.getValue());
                }
            }
        }
    }

    private void maybeReclaim() {
        long now = System.currentTimeMillis();
        if (now - lastClaimAt < CLAIM_INTERVAL_MS) {
            return;
        }
        lastClaimAt = now;
        try {
            redis.execute((RedisConnection c) -> {
                byte[] key = RedisKeys.IM_MSG_STREAM.getBytes(StandardCharsets.UTF_8);
                PendingMessagesSummary summary = c.streamCommands().xPending(key, GROUP);
                if (summary == null || summary.getPendingMessagesPerConsumer() == null) {
                    return null;
                }
                List<RecordId> pendingIds = new ArrayList<>();
                for (Map.Entry<String, Long> perConsumer : summary.getPendingMessagesPerConsumer().entrySet()) {
                    if (consumerName.equals(perConsumer.getKey())) {
                        continue;
                    }
                    PendingMessages pm = c.streamCommands().xPending(
                            key,
                            GROUP,
                            perConsumer.getKey(),
                            Range.unbounded(),
                            100L);
                    if (pm != null) {
                        for (PendingMessage m : pm) {
                            pendingIds.add(m.getId());
                        }
                    }
                }
                if (pendingIds.isEmpty()) {
                    return null;
                }
                List<ByteRecord> claimed = c.streamCommands().xClaim(
                        key,
                        GROUP,
                        consumerName,
                        Duration.ofMillis(CLAIM_MIN_IDLE_MS),
                        pendingIds.toArray(RecordId[]::new));
                if (claimed != null && !claimed.isEmpty()) {
                    List<Entry> entries = new ArrayList<>(claimed.size());
                    for (ByteRecord br : claimed) {
                        Map<Object, Object> value = new HashMap<>();
                        br.getValue().forEach((k, v) ->
                                value.put(new String(k, StandardCharsets.UTF_8), new String(v, StandardCharsets.UTF_8)));
                        Entry e = toEntry(br.getId(), value);
                        if (e != null) {
                            entries.add(e);
                        }
                    }
                    processEntries(entries);
                }
                return null;
            });
        } catch (Exception e) {
            log.warn("IM stream reclaim failed: {}", e.getMessage());
        }
    }

    private Entry toEntry(RecordId id, Map<Object, Object> v) {
        try {
            return new Entry(
                    id,
                    str(v, "msgId"),
                    lng(v, "conversationId"),
                    lng(v, "fromUserId"),
                    lng(v, "toUserId"),
                    (int) lng(v, "msgType"),
                    str(v, "content"),
                    str(v, "fileId"),
                    str(v, "clientMsgId"),
                    str(v, "replyToMsgId"),
                    str(v, "mentionUserIds"),
                    Boolean.parseBoolean(str(v, "atAll")));
        } catch (Exception e) {
            log.warn("IM stream entry parse failed id={}: {}", id.getValue(), e.getMessage());
            return null;
        }
    }

    private static String str(Map<Object, Object> v, String key) {
        Object o = v.get(key);
        return o == null ? "" : o.toString();
    }

    private static long lng(Map<Object, Object> v, String key) {
        Object o = v.get(key);
        return o == null ? 0L : Long.parseLong(o.toString());
    }

    private static String preview(String content) {
        if (content == null || content.isEmpty()) {
            return "";
        }
        return content.length() > 100 ? content.substring(0, 100) : content;
    }
}
