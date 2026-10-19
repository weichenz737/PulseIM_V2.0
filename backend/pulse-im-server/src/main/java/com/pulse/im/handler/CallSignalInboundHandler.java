package com.pulse.im.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pulse.common.constant.RedisKeys;
import com.pulse.im.session.SessionManager;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 在 Protobuf 解码之前拦截 CALL_* 和 TYPING_STATUS 文本帧，避免临时信令被未知 cmd 丢掉。
 */
@Slf4j
@Component
@ChannelHandler.Sharable
@RequiredArgsConstructor
public class CallSignalInboundHandler extends ChannelInboundHandlerAdapter {
    private final SessionManager sessionManager;
    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
        if (msg instanceof TextWebSocketFrame text) {
            String payload = text.text();
            if (payload != null && payload.startsWith("{") && looksLikeTyping(payload)) {
                try {
                    handleTypingJson(ctx, payload);
                } finally {
                    text.release();
                }
                return;
            }
            if (payload != null && payload.startsWith("{") && looksLikeCall(payload)) {
                try {
                    handleCallJson(ctx, payload);
                } finally {
                    text.release();
                }
                return;
            }
        }
        ctx.fireChannelRead(msg);
    }

    private static boolean looksLikeCall(String payload) {
        int i = payload.indexOf("\"cmd\"");
        if (i < 0) return false;
        // 允许 cmd 前后有空格；不限制字段顺序过严
        int colon = payload.indexOf(':', i);
        if (colon < 0 || colon > i + 12) return false;
        int c = payload.indexOf("CALL_", colon);
        return c > colon && c < colon + 16;
    }

    private boolean looksLikeTyping(String payload) {
        try {
            return "TYPING_STATUS".equals(objectMapper.readTree(payload).path("cmd").asText(""));
        } catch (Exception ignored) {
            return false;
        }
    }

    private void handleTypingJson(ChannelHandlerContext ctx, String payload) {
        if (!sessionManager.isAuthed(ctx.channel())) {
            writeJson(ctx.channel(), "{\"cmd\":\"ERROR\",\"code\":401,\"message\":\"unauthorized\"}");
            return;
        }
        Long fromUserId = sessionManager.getUserId(ctx.channel());
        if (fromUserId == null) return;
        try {
            ObjectNode node = (ObjectNode) objectMapper.readTree(payload);
            long toUserId = parseUserId(node.path("toUserId"));
            long conversationId = parseUserId(node.path("conversationId"));
            if (toUserId <= 0 || conversationId <= 0 || toUserId == fromUserId) return;
            if (!isPersonalConversation(conversationId, fromUserId, toUserId)) return;

            boolean typing = node.path("typing").asBoolean(false);
            // 停止事件用于清理对端状态，即使发送方刚刚关闭了开关也要允许透传；
            // 开始事件必须由服务端同时校验双方开关，不能只相信客户端。
            if (typing && !typingEnabledForBoth(fromUserId, toUserId)) return;

            ObjectNode out = objectMapper.createObjectNode();
            out.put("event", "typing_status");
            out.put("toUserId", toUserId);
            out.put("fromUserId", fromUserId);
            out.put("conversationId", conversationId);
            out.put("typing", typing);
            out.put("sendTime", System.currentTimeMillis());
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, objectMapper.writeValueAsString(out));
        } catch (Exception e) {
            log.debug("typing status ignored: {}", e.getMessage());
        }
    }

    private boolean isPersonalConversation(long conversationId, long fromUserId, long toUserId) {
        try {
            Integer count = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*)
                    FROM im_conversation c
                    JOIN im_conversation_member m1 ON m1.conversation_id = c.id AND m1.user_id = ?
                    JOIN im_conversation_member m2 ON m2.conversation_id = c.id AND m2.user_id = ?
                    WHERE c.id = ? AND c.type = 1
                    """, Integer.class, fromUserId, toUserId, conversationId);
            return count != null && count > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean typingEnabledForBoth(long fromUserId, long toUserId) {
        try {
            Integer count = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*)
                    FROM sys_user a
                    JOIN sys_user b ON b.id = ?
                    WHERE a.id = ?
                      AND COALESCE(a.typing_status_enabled, TRUE)
                      AND COALESCE(b.typing_status_enabled, TRUE)
                    """, Integer.class, toUserId, fromUserId);
            return count != null && count > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void handleCallJson(ChannelHandlerContext ctx, String payload) {
        if (!sessionManager.isAuthed(ctx.channel())) {
            writeJson(ctx.channel(), errorPayload(0, "", "unauthorized"));
            return;
        }
        Long fromUserId = sessionManager.getUserId(ctx.channel());
        if (fromUserId == null) {
            return;
        }
        try {
            ObjectNode node = (ObjectNode) objectMapper.readTree(payload);
            String cmd = node.path("cmd").asText("");
            if (!cmd.startsWith("CALL_")) {
                return;
            }
            long toUserId = parseUserId(node.path("toUserId"));
            String callId = node.path("callId").asText("");
            if (!StringUtils.hasText(callId) || toUserId <= 0) {
                writeJson(ctx.channel(), errorPayload(fromUserId, callId, "invalid call signal"));
                return;
            }
            if (toUserId == fromUserId) {
                writeJson(ctx.channel(), errorPayload(fromUserId, callId, "cannot call self"));
                return;
            }
            if (isFileTransferAssistant(fromUserId) || isFileTransferAssistant(toUserId)) {
                writeJson(ctx.channel(), errorPayload(fromUserId, callId,
                        "file transfer assistant does not support calls"));
                return;
            }

            node.put("fromUserId", String.valueOf(fromUserId));
            node.put("toUserId", String.valueOf(toUserId));
            node.put("timestamp", System.currentTimeMillis());
            // 保证昵称头像字段存在（字符串）
            if (!node.has("fromNickname") || node.get("fromNickname").isNull()) {
                node.put("fromNickname", "");
            }
            String out = objectMapper.writeValueAsString(node);

            // A user may have both mobile and desktop sessions. Call signaling
            // must reach every active session; picking one arbitrary channel
            // leaves the desktop client stuck on "connecting" when Netty's
            // map happens to return the mobile channel.
            List<Channel> targets = sessionManager.getChannels(toUserId);
            boolean delivered = false;
            for (Channel target : targets) {
                if (target != null && target.isActive()) {
                    writeJson(target, out);
                    delivered = true;
                }
            }
            if (delivered) {
                log.info("CALL relay local cmd={} from={} to={} callId={} channels={}",
                        cmd, fromUserId, toUserId, callId, targets.size());
            }

            // 终态信令（挂断/拒绝/忙线/不可用/错误）即使本机已投递也同步走 Redis 兜底：
            // 避免跨节点或对端连接切换瞬间只走一条通道导致漏收，接听方一直停在来电界面。
            // 终态信令客户端幂等，重复送达不会造成 offer glare。
            if (!delivered || isTerminalSignal(cmd)) {
                publishCall(out, toUserId, fromUserId, callId, cmd);
                if (!delivered && "CALL_INVITE".equals(cmd)) {
                    log.info("CALL invite via redis only from={} to={} callId={}",
                            fromUserId, toUserId, callId);
                    // 不再根据 online key 立即回 CALL_UNAVAILABLE：
                    // 刷新后重连瞬间 online 会空窗，误报「对方不在线/无网络」。
                    // 由前端响铃超时与 INVITE 重试覆盖真实离线。
                }
            }
        } catch (Exception e) {
            log.warn("CALL signal failed: {}", e.getMessage());
            writeJson(ctx.channel(), errorPayload(fromUserId, "", e.getMessage()));
        }
    }

    private boolean isFileTransferAssistant(long userId) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_user WHERE id = ? AND file_transfer_assistant = TRUE",
                    Integer.class, userId);
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("failed to inspect file transfer assistant flag for user={}: {}", userId, e.getMessage());
            return false;
        }
    }

    private static boolean isTerminalSignal(String cmd) {
        return "CALL_HANGUP".equals(cmd)
                || "CALL_REJECT".equals(cmd)
                || "CALL_BUSY".equals(cmd)
                || "CALL_UNAVAILABLE".equals(cmd)
                || "CALL_ERROR".equals(cmd);
    }

    private void publishCall(String signalJson, long toUserId, long fromUserId, String callId, String cmd) {
        try {
            ObjectNode wrap = objectMapper.createObjectNode();
            wrap.put("event", "call");
            wrap.put("toUserId", toUserId);
            wrap.put("fromUserId", fromUserId);
            wrap.put("callId", callId);
            wrap.put("cmd", cmd);
            wrap.put("signal", signalJson);
            wrap.put("sendTime", System.currentTimeMillis());
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, objectMapper.writeValueAsString(wrap));
        } catch (Exception e) {
            log.warn("publish call signal failed: {}", e.getMessage());
        }
    }

    private static long parseUserId(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return 0;
        if (n.isNumber()) return n.asLong();
        try {
            return Long.parseLong(n.asText("0").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private String errorPayload(long toUserId, String callId, String message) {
        try {
            ObjectNode out = objectMapper.createObjectNode();
            out.put("cmd", "CALL_ERROR");
            out.put("callId", callId == null ? "" : callId);
            out.put("toUserId", String.valueOf(toUserId));
            out.put("message", message == null ? "" : message);
            out.put("timestamp", System.currentTimeMillis());
            return objectMapper.writeValueAsString(out);
        } catch (Exception e) {
            return "{\"cmd\":\"CALL_ERROR\"}";
        }
    }

    private void writeJson(Channel channel, String json) {
        if (channel == null || !channel.isActive()) return;
        channel.eventLoop().execute(() -> {
            if (channel.isActive()) {
                channel.writeAndFlush(new TextWebSocketFrame(json));
            }
        });
    }
}
