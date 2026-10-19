package com.pulse.im.codec;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pulse.proto.AuthAckPayload;
import com.pulse.proto.AuthPayload;
import com.pulse.proto.ChatMessage;
import com.pulse.proto.Cmd;
import com.pulse.proto.ErrorPayload;
import com.pulse.proto.ImEnvelope;
import com.pulse.proto.KickPayload;
import com.pulse.proto.MsgAckPayload;
import com.pulse.proto.MsgType;

import java.util.ArrayList;
import java.util.List;

/**
 * JSON bridge for Vue web clients (text WebSocket frames).
 */
public final class JsonImBridge {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonImBridge() {
    }

    public static ImEnvelope toEnvelope(String json) throws Exception {
        JsonNode node = MAPPER.readTree(json);
        String cmd = node.path("cmd").asText("CMD_UNKNOWN");
        ImEnvelope.Builder builder = ImEnvelope.newBuilder()
                .setTimestamp(System.currentTimeMillis())
                .setSeq(node.path("seq").asLong(0));

        return switch (cmd) {
            case "AUTH" -> builder.setCmd(Cmd.AUTH)
                    .setPayload(AuthPayload.newBuilder()
                            .setToken(node.path("token").asText())
                            .setDeviceId(node.path("deviceId").asText("web"))
                            .setPlatform(node.path("platform").asText("web"))
                            .build().toByteString())
                    .build();
            case "HEARTBEAT" -> builder.setCmd(Cmd.HEARTBEAT).build();
            case "SEND_MSG" -> {
                int typeNum = node.path("msgType").asInt(0);
                MsgType type = MsgType.forNumber(typeNum);
                if (type == null) {
                    type = MsgType.TEXT;
                }
                String content = node.path("fileId").asText("").trim();
                if (!content.isBlank()) content = "file:" + content;
                else content = node.path("content").asText("");
                List<Long> mentionUserIds = parseLongList(node.get("mentionUserIds"));
                ChatMessage msg = ChatMessage.newBuilder()
                        .setConversationId(node.path("conversationId").asLong())
                        .setToUserId(node.path("toUserId").asLong())
                        .setMsgType(type)
                        .setContent(content)
                        .setClientMsgId(node.path("clientMsgId").asText())
                        .setSendTime(System.currentTimeMillis())
                        .setReplyToMsgId(node.path("replyToMsgId").asText(""))
                        .addAllMentionUserIds(mentionUserIds)
                        .setAtAll(node.path("atAll").asBoolean(false))
                        .build();
                yield builder.setCmd(Cmd.SEND_MSG).setPayload(msg.toByteString()).build();
            }
            default -> builder.setCmd(Cmd.CMD_UNKNOWN).build();
        };
    }

    public static String toJson(ImEnvelope envelope) throws Exception {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("cmd", envelope.getCmd().name());
        root.put("seq", envelope.getSeq());
        root.put("timestamp", envelope.getTimestamp());

        switch (envelope.getCmd()) {
            case AUTH_ACK -> {
                AuthAckPayload p = AuthAckPayload.parseFrom(envelope.getPayload());
                root.put("success", p.getSuccess());
                root.put("userId", p.getUserId());
                root.put("message", p.getMessage());
            }
            case MSG_ACK -> {
                MsgAckPayload p = MsgAckPayload.parseFrom(envelope.getPayload());
                root.put("clientMsgId", p.getClientMsgId());
                root.put("msgId", p.getMsgId());
                root.put("id", p.getMsgId());
                root.put("success", p.getSuccess());
                root.put("message", p.getMessage());
            }
            case PUSH_MSG, SEND_MSG -> {
                ChatMessage p = ChatMessage.parseFrom(envelope.getPayload());
                root.put("id", p.getMsgId());
                root.put("msgId", p.getMsgId());
                root.put("conversationId", String.valueOf(p.getConversationId()));
                root.put("fromUserId", String.valueOf(p.getFromUserId()));
                root.put("toUserId", String.valueOf(p.getToUserId()));
                root.put("msgType", p.getMsgTypeValue());
                root.put("content", p.getContent());
                if (p.getContent().startsWith("file:")) {
                    root.put("fileId", p.getContent().substring("file:".length()));
                }
                root.put("clientMsgId", p.getClientMsgId());
                root.put("sendTime", p.getSendTime());
                if (!p.getReplyToMsgId().isBlank()) root.put("replyToMsgId", p.getReplyToMsgId());
                root.put("atAll", p.getAtAll());
                root.set("mentionUserIds", MAPPER.valueToTree(p.getMentionUserIdsList()));
                // 兼容前端旧监听
                root.put("type", "message");
            }
            case KICK -> {
                KickPayload p = KickPayload.parseFrom(envelope.getPayload());
                root.put("reason", p.getReason());
            }
            case ERROR -> {
                ErrorPayload p = ErrorPayload.parseFrom(envelope.getPayload());
                root.put("code", p.getCode());
                root.put("message", p.getMessage());
            }
            default -> {
            }
        }
        return MAPPER.writeValueAsString(root);
    }

    private static List<Long> parseLongList(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<Long> values = new ArrayList<>();
        for (JsonNode value : node) {
            try {
                long id = value.isNumber() ? value.asLong() : Long.parseLong(value.asText("0").trim());
                if (id > 0) values.add(id);
            } catch (Exception ignored) {
                // Ignore malformed mention IDs; membership validation happens
                // in the message service before the message is persisted.
            }
        }
        return values;
    }
}
