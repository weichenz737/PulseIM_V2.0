package com.pulse.im.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pulse.im.session.SessionManager;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImPushService implements MessageListener {
    private final SessionManager sessionManager;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String body = new String(message.getBody(), StandardCharsets.UTF_8);
        pushJson(body);
    }

    /** Redis 订阅：API 落库后推送给在线对端 */
    public void pushJson(String body) {
        try {
            JsonNode node = objectMapper.readTree(body);
            long toUserId = parseLongId(node.path("toUserId"));
            if (toUserId <= 0) {
                return;
            }
            String event = node.path("event").asText("");
            if ("session_logout".equals(event)) {
                pushSessionLogout(node, toUserId);
                return;
            }
            // 已读回执需要同步到同一账号的所有在线设备，不能只取一个连接。
            if ("read_receipt".equals(event)) {
                pushReadReceipt(node, toUserId);
                return;
            }
            List<Channel> targets = sessionManager.getChannels(toUserId);
            if (targets.isEmpty()) {
                log.debug("push skip, user offline: {}", toUserId);
                return;
            }

            if ("burn_started".equals(event) || "burn_expired".equals(event)) {
                ObjectNode out = objectMapper.createObjectNode();
                out.put("cmd", "burn_expired".equals(event) ? "BURN_EXPIRED" : "BURN_STARTED");
                out.put("type", event);
                out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
                out.put("msgId", node.path("msgId").asText(""));
                out.set("burnExpiresAt", node.path("burnExpiresAt").deepCopy());
                final String payload = objectMapper.writeValueAsString(out);
                writeText(targets, payload);
                return;
            }

            // WebRTC 通话信令：原样透传 signal JSON
            if ("call".equals(event)) {
                String signal = node.path("signal").asText("");
                if (!StringUtils.hasText(signal)) {
                    return;
                }
                // 本机已直推过时，Redis 回环可能造成重复；前端按 callId 去重
                final String payload = signal;
                writeText(targets, payload);
                log.debug("CALL push via redis toUserId={}", toUserId);
                return;
            }

            // 在线状态实时事件：好友上线/下线，前端立即刷新（P2 增强）
            if ("presence".equals(event)) {
                ObjectNode out = objectMapper.createObjectNode();
                out.put("cmd", "PRESENCE");
                out.put("type", "presence");
                out.put("userId", node.path("userId").asText(""));
                out.put("online", node.path("online").asBoolean(false));
                out.put("onlineHidden", node.path("onlineHidden").asBoolean(false));
                final String payload = objectMapper.writeValueAsString(out);
                writeText(targets, payload);
                return;
            }

            // 输入状态是短暂事件，不落库，只转发给接收方的所有在线设备。
            if ("typing_status".equals(event)) {
                ObjectNode out = objectMapper.createObjectNode();
                out.put("cmd", "TYPING_STATUS");
                out.put("type", "typing_status");
                out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
                out.put("fromUserId", String.valueOf(node.path("fromUserId").asLong()));
                out.put("toUserId", String.valueOf(toUserId));
                out.put("typing", node.path("typing").asBoolean(false));
                out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
                final String payload = objectMapper.writeValueAsString(out);
                writeText(targets, payload);
                return;
            }

            // 红包/转账状态变更（领取、领完、过期退款）：JSON 客户端即时更新卡片状态
            if ("business_status".equals(event)) {
                ObjectNode out = objectMapper.createObjectNode();
                out.put("cmd", "BUSINESS_STATUS");
                out.put("type", "business_status");
                out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
                out.put("msgId", node.path("msgId").asText(""));
                out.put("id", node.path("id").asText(""));
                out.put("msgType", node.path("msgType").asInt(0));
                out.put("businessNo", node.path("businessNo").asText(""));
                out.put("status", node.path("status").asText(""));
                out.put("toUserId", String.valueOf(toUserId));
                out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
                final String payload = objectMapper.writeValueAsString(out);
                writeText(targets, payload);
                return;
            }

            // 只有 IM 长连接直接发送的消息才排除来源设备。HTTP 发消息时
            // sourceDeviceId 只是请求方的设备标识，不能拿它过滤接收方，
            // 否则同一标识的桌面连接会被误判为发送端而整条私聊推送丢失。
            String sourceDeviceId = node.path("sourceDeviceId").asText("").trim();
            boolean excludeSourceDevice = node.path("excludeSourceDevice").asBoolean(false);
            List<Channel> messageTargets = !excludeSourceDevice || sourceDeviceId.isEmpty()
                    ? targets
                    : targets.stream()
                            .filter(target -> !sourceDeviceId.equals(target.attr(SessionManager.DEVICE_ID).get()))
                            .toList();
            if (messageTargets.isEmpty()) {
                return;
            }

            // All current Vue clients (mobile web/native and desktop web/Electron)
            // speak the JSON bridge. Keep message delivery as text even if a
            // connection was previously marked as protobuf; otherwise the
            // desktop JSON listener silently ignores the binary frame and the
            // message only appears after an HTTP refresh.
            ObjectNode jsonOut = buildJsonPush(node, toUserId, event);
            final String jsonPayload = objectMapper.writeValueAsString(jsonOut);
            for (Channel target : messageTargets) {
                writeText(target, jsonPayload);
            }
        } catch (Exception e) {
            log.warn("IM push failed: {}", e.getMessage());
        }
    }

    private void writeText(List<Channel> targets, String payload) {
        for (Channel target : targets) {
            writeText(target, payload);
        }
    }

    private void writeText(Channel target, String payload) {
        target.eventLoop().execute(() -> {
            if (target.isActive()) {
                target.writeAndFlush(new TextWebSocketFrame(payload));
            }
        });
    }

    private void pushReadReceipt(JsonNode node, long toUserId) {
        List<Channel> targets = sessionManager.getChannels(toUserId);
        if (targets.isEmpty()) {
            log.debug("read receipt push skip, user offline: {}", toUserId);
            return;
        }
        try {
            ObjectNode out = buildJsonPush(node, toUserId, "read_receipt");
            final String payload = objectMapper.writeValueAsString(out);
            for (Channel target : targets) {
                target.eventLoop().execute(() -> {
                    if (target.isActive()) {
                        target.writeAndFlush(new TextWebSocketFrame(payload));
                    }
                });
            }
        } catch (Exception e) {
            log.warn("read receipt push encode failed: {}", e.getMessage());
        }
    }

    private void pushSessionLogout(JsonNode node, long toUserId) {
        String deviceId = node.path("deviceId").asText("").trim();
        Channel matched = StringUtils.hasText(deviceId) ? sessionManager.getChannel(toUserId, deviceId) : null;
        List<Channel> targets = StringUtils.hasText(deviceId)
                ? (matched == null ? List.of() : List.of(matched))
                : sessionManager.getChannels(toUserId);
        if (targets.isEmpty()) return;

        ObjectNode out = objectMapper.createObjectNode();
        out.put("cmd", "SESSION_REVOKED");
        out.put("type", "session_revoked");
        out.put("deviceId", deviceId);
        out.put("reason", node.path("reason").asText("device_revoked"));
        final String payload;
        try {
            payload = objectMapper.writeValueAsString(out);
        } catch (Exception e) {
            log.warn("session logout push encode failed: {}", e.getMessage());
            return;
        }
        for (Channel target : targets) {
            target.eventLoop().execute(() -> {
                if (target.isActive()) {
                    target.writeAndFlush(new TextWebSocketFrame(payload)).addListener(future -> target.close());
                }
            });
        }
    }

    private ObjectNode buildJsonPush(JsonNode node, long toUserId, String event) {
        ObjectNode out = objectMapper.createObjectNode();
        if ("friend_request".equals(event)) {
            out.put("cmd", "FRIEND_REQUEST");
            out.put("type", "friend_request");
            out.put("action", node.path("action").asText(""));
            out.put("requestId", String.valueOf(node.path("requestId").asLong()));
            out.put("fromUserId", String.valueOf(node.path("fromUserId").asLong()));
            out.put("toUserId", String.valueOf(toUserId));
            out.put("message", node.path("message").asText(""));
            out.put("fromNickname", node.path("fromNickname").asText(""));
            out.put("fromAvatarUrl", node.path("fromAvatarUrl").asText(""));
            out.put("status", node.path("status").asInt(0));
            out.put("pendingCount", node.path("pendingCount").asInt(0));
            out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
            return out;
        }
        if ("recall".equals(event)) {
            out.put("cmd", "RECALL_MSG");
            out.put("type", "recall");
            out.put("msgId", node.path("msgId").asText(""));
            out.put("id", node.path("msgId").asText(""));
            out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
            out.put("fromUserId", String.valueOf(node.path("fromUserId").asLong()));
            out.put("toUserId", String.valueOf(toUserId));
            out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
            return out;
        }
        if ("read_receipt".equals(event)) {
            out.put("cmd", "READ_RECEIPT");
            out.put("type", "read_receipt");
            out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
            out.put("fromUserId", String.valueOf(node.path("fromUserId").asLong()));
            out.put("toUserId", String.valueOf(toUserId));
            out.put("lastReadMsgId", node.path("lastReadMsgId").asText(""));
            out.put("lastReadSendTime", node.path("lastReadSendTime").asLong(0));
            out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
            return out;
        }
        out.put("cmd", "PUSH_MSG");
        out.put("type", "message");
        out.put("msgId", node.path("msgId").asText(""));
        out.put("id", node.path("msgId").asText(node.path("id").asText("")));
        out.put("conversationId", String.valueOf(node.path("conversationId").asLong()));
        out.put("fromUserId", String.valueOf(node.path("fromUserId").asLong()));
        out.put("fromNickname", node.path("fromNickname").asText(""));
        out.put("fromAvatarUrl", node.path("fromAvatarUrl").asText(""));
        out.put("toUserId", String.valueOf(toUserId));
        out.put("msgType", node.path("msgType").asInt(0));
        String transportContent = node.path("content").asText("");
        boolean legacyFilePayload = node.path("legacyFile").asBoolean(false)
                || ((node.path("msgType").asInt(0) >= 1 && node.path("msgType").asInt(0) <= 3)
                && node.path("fileId").asText("").isBlank()
                && (transportContent.length() > 512 || transportContent.startsWith("data:")));
        out.put("content", legacyFilePayload ? "[legacy-file]" : transportContent);
        out.put("legacyFile", legacyFilePayload);
        String fileId = node.path("fileId").asText("");
        if (fileId.isBlank() && transportContent.startsWith("file:")) {
            fileId = transportContent.substring("file:".length());
        }
        out.put("fileId", fileId);
        if (node.has("file")) out.set("file", node.get("file").deepCopy());
        out.put("clientMsgId", node.path("clientMsgId").asText(""));
        out.put("sendTime", node.path("sendTime").asLong(System.currentTimeMillis()));
        out.put("recalled", node.path("recalled").asBoolean(false));
        out.put("burnAfterRead", node.path("burnAfterRead").asBoolean(false));
        if (!node.path("burnSeconds").isMissingNode() && !node.path("burnSeconds").isNull()) {
            out.put("burnSeconds", node.path("burnSeconds").asInt());
        }
        if (!node.path("burnReadAt").isMissingNode() && !node.path("burnReadAt").isNull()) {
            out.set("burnReadAt", node.path("burnReadAt").deepCopy());
        }
        if (!node.path("burnExpiresAt").isMissingNode() && !node.path("burnExpiresAt").isNull()) {
            out.set("burnExpiresAt", node.path("burnExpiresAt").deepCopy());
        }
        if (!node.path("autoDeleteExpiresAt").isMissingNode() && !node.path("autoDeleteExpiresAt").isNull()) {
            out.set("autoDeleteExpiresAt", node.path("autoDeleteExpiresAt").deepCopy());
        }
        String replyTo = node.path("replyToMsgId").asText("");
        if (!replyTo.isEmpty()) {
            out.put("replyToMsgId", replyTo);
            out.put("replyToContent", node.path("replyToContent").asText(""));
            out.put("replyToMsgType", node.path("replyToMsgType").asInt(0));
            out.put("replyToNickname", node.path("replyToNickname").asText(""));
            out.put("replyToRecalled", node.path("replyToRecalled").asBoolean(false));
        }
        out.put("atAll", node.path("atAll").asBoolean(false));
        out.put("mentionedMe", node.path("mentionedMe").asBoolean(false));
        out.put("notificationAllowed", node.path("notificationAllowed").asBoolean(true));
        if (node.has("mentionUserIds") && node.get("mentionUserIds").isArray()) {
            out.set("mentionUserIds", node.get("mentionUserIds").deepCopy());
        }
        return out;
    }

    private static long parseLongId(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return 0;
        if (n.isNumber()) return n.asLong();
        try {
            return Long.parseLong(n.asText("0").trim());
        } catch (Exception e) {
            return 0;
        }
    }
}
