package com.pulse.im.handler;

import com.google.protobuf.InvalidProtocolBufferException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pulse.common.constant.SecurityConstants;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.util.JwtUtil;
import com.pulse.im.service.ImMessageService;
import com.pulse.im.service.PresenceService;
import com.pulse.im.session.SessionManager;
import com.pulse.proto.AuthAckPayload;
import com.pulse.proto.AuthPayload;
import com.pulse.proto.ChatMessage;
import com.pulse.proto.Cmd;
import com.pulse.proto.ErrorPayload;
import com.pulse.proto.ImEnvelope;
import com.pulse.proto.KickPayload;
import com.pulse.proto.MsgAckPayload;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.timeout.IdleStateEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@ChannelHandler.Sharable
@RequiredArgsConstructor
public class ImServerHandler extends SimpleChannelInboundHandler<ImEnvelope> {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final JwtUtil jwtUtil;
    private final SessionManager sessionManager;
    private final ImMessageService messageService;
    private final PresenceService presenceService;
    private final StringRedisTemplate redis;

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, ImEnvelope msg) {
        switch (msg.getCmd()) {
            case AUTH -> handleAuth(ctx, msg);
            case HEARTBEAT -> handleHeartbeat(ctx, msg);
            case SEND_MSG -> handleSend(ctx, msg);
            default -> writeError(ctx, 400, "unsupported cmd");
        }
    }

    private void handleAuth(ChannelHandlerContext ctx, ImEnvelope msg) {
        try {
            AuthPayload auth = AuthPayload.parseFrom(msg.getPayload());
            String token = auth.getToken();
            if (!jwtUtil.isValid(token)) {
                writeAuthAck(ctx, false, 0, "invalid token");
                ctx.close();
                return;
            }
            String role = jwtUtil.getRole(token);
            if (!SecurityConstants.ROLE_USER.equals(role)) {
                writeAuthAck(ctx, false, 0, "role not allowed");
                ctx.close();
                return;
            }
            Long userId = jwtUtil.getUserId(token);
            if (jwtUtil.getAuthVersion(token) != currentAuthVersion(userId)) {
                writeAuthAck(ctx, false, 0, "token expired");
                ctx.close();
                return;
            }
            String deviceId = StringUtils.hasText(jwtUtil.getDeviceId(token))
                    ? jwtUtil.getDeviceId(token)
                    : auth.getDeviceId();
            Channel old = sessionManager.removeAndGetOld(userId, deviceId, ctx.channel());
            // 重连宽限期内 online key 仍然存在，说明好友端只是断线重连，
            // 无需再次广播上线（否则在线好友会收到频繁的 PRESENCE 并重绘）。
            boolean wasOnline = Boolean.TRUE.equals(redis.hasKey(RedisKeys.online(userId)));
            // 先绑定并标记在线，再踢旧连接，避免旧 channelInactive 抢先清掉在线状态
            sessionManager.bind(userId, deviceId, ctx.channel());
            messageService.markOnline(userId, deviceId, ctx.channel().id().asShortText());
            if (!wasOnline) {
                presenceService.publishOnline(userId);
            }
            presenceService.syncFor(userId);
            if (old != null && old.isActive() && old != ctx.channel()) {
                old.writeAndFlush(ImEnvelope.newBuilder()
                        .setCmd(Cmd.KICK)
                        .setTimestamp(System.currentTimeMillis())
                        .setPayload(KickPayload.newBuilder().setReason("账号在其他设备登录").build().toByteString())
                        .build());
                old.close();
            }
            writeAuthAck(ctx, true, userId, "ok");
            log.info("IM auth ok userId={}", userId);
        } catch (Exception e) {
            log.warn("AUTH failed", e);
            writeAuthAck(ctx, false, 0, e.getMessage());
            ctx.close();
        }
    }

    private long currentAuthVersion(Long userId) {
        String value = redis.opsForValue().get(RedisKeys.userAuthVersion(userId));
        return StringUtils.hasText(value) ? Long.parseLong(value) : 0L;
    }

    private void handleHeartbeat(ChannelHandlerContext ctx, ImEnvelope msg) {
        if (!sessionManager.isAuthed(ctx.channel())) {
            writeError(ctx, 401, "unauthorized");
            return;
        }
        Long userId = sessionManager.getUserId(ctx.channel());
        String deviceId = ctx.channel().attr(SessionManager.DEVICE_ID).get();
        boolean revived = messageService.refreshOnline(userId, deviceId, ctx.channel().id().asShortText());
        if (revived) {
            presenceService.publishOnline(userId);
        }
        ctx.writeAndFlush(ImEnvelope.newBuilder()
                .setCmd(Cmd.HEARTBEAT_ACK)
                .setSeq(msg.getSeq())
                .setTimestamp(System.currentTimeMillis())
                .build());
    }

    private void handleSend(ChannelHandlerContext ctx, ImEnvelope msg) {
        if (!sessionManager.isAuthed(ctx.channel())) {
            writeError(ctx, 401, "unauthorized");
            return;
        }
        try {
            Long fromUserId = sessionManager.getUserId(ctx.channel());
            ChatMessage chat = ChatMessage.parseFrom(msg.getPayload());
            ImMessageService.EnqueuedMessage enqueued = messageService.enqueueMessage(
                    fromUserId,
                    chat.getConversationId(),
                    chat.getToUserId(),
                    chat.getMsgTypeValue(),
                    chat.getContent(),
                    chat.getClientMsgId(),
                    chat.getReplyToMsgId(),
                    chat.getMentionUserIdsList(),
                    chat.getAtAll()
            );
            ctx.writeAndFlush(ImEnvelope.newBuilder()
                    .setCmd(Cmd.MSG_ACK)
                    .setSeq(msg.getSeq())
                    .setTimestamp(System.currentTimeMillis())
                    .setPayload(MsgAckPayload.newBuilder()
                            .setClientMsgId(chat.getClientMsgId())
                            .setMsgId(enqueued.msgId())
                            .setSuccess(true)
                            .build().toByteString())
                    .build());

            ChatMessage push = chat.toBuilder()
                    .setMsgId(enqueued.msgId())
                    .setFromUserId(fromUserId)
                    .setSendTime(System.currentTimeMillis())
                    .build();
            // P2：推送给会话内除发送者外的所有成员，经 Redis 广播由各 IM 节点本地投递，
            // 支持多节点水平扩容；本节点同样通过订阅投递，不会重复。
            List<Long> recipients = messageService.listPushRecipientIds(chat.getConversationId());
            String sourceDeviceId = ctx.channel().attr(SessionManager.DEVICE_ID).get();
            for (Long uid : recipients) {
                try {
                    ObjectNode json = MAPPER.createObjectNode();
                    json.put("msgId", push.getMsgId());
                    json.put("conversationId", String.valueOf(push.getConversationId()));
                    json.put("fromUserId", String.valueOf(push.getFromUserId()));
                    json.put("toUserId", String.valueOf(uid));
                    json.put("msgType", push.getMsgTypeValue());
                    json.put("content", push.getContent());
                    if (push.getContent().startsWith("file:")) {
                        json.put("fileId", push.getContent().substring("file:".length()));
                    }
                    json.put("clientMsgId", push.getClientMsgId());
                    json.put("sendTime", push.getSendTime());
                    json.put("burnAfterRead", enqueued.expiry().burnAfterRead());
                    if (enqueued.expiry().burnSeconds() != null) {
                        json.put("burnSeconds", enqueued.expiry().burnSeconds());
                    }
                    if (enqueued.expiry().autoDeleteExpiresAt() != null) {
                        json.put("autoDeleteExpiresAt", enqueued.expiry().autoDeleteExpiresAt().toString());
                    }
                    if (!push.getReplyToMsgId().isBlank()) json.put("replyToMsgId", push.getReplyToMsgId());
                    json.put("atAll", push.getAtAll());
                    json.set("mentionUserIds", MAPPER.valueToTree(push.getMentionUserIdsList()));
                    json.put("sourceDeviceId", sourceDeviceId == null ? "" : sourceDeviceId);
                    // Retention metadata is not part of the protobuf ACK. Echo these
                    // messages to the sending device so its bubble reflects server truth.
                    json.put("excludeSourceDevice",
                            !enqueued.expiry().burnAfterRead() && enqueued.expiry().autoDeleteExpiresAt() == null);
                    redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json.toString());
                } catch (Exception e) {
                    log.warn("IM push publish failed to userId={}: {}", uid, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("SEND_MSG failed", e);
            writeError(ctx, 500, e.getMessage());
        }
    }

    private void writeAuthAck(ChannelHandlerContext ctx, boolean ok, long userId, String message) {
        ctx.writeAndFlush(ImEnvelope.newBuilder()
                .setCmd(Cmd.AUTH_ACK)
                .setTimestamp(System.currentTimeMillis())
                .setPayload(AuthAckPayload.newBuilder()
                        .setSuccess(ok)
                        .setUserId(userId)
                        .setMessage(message == null ? "" : message)
                        .build().toByteString())
                .build());
    }

    private void writeError(ChannelHandlerContext ctx, int code, String message) {
        ctx.writeAndFlush(ImEnvelope.newBuilder()
                .setCmd(Cmd.ERROR)
                .setTimestamp(System.currentTimeMillis())
                .setPayload(ErrorPayload.newBuilder().setCode(code).setMessage(message).build().toByteString())
                .build());
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        Long userId = sessionManager.getUserId(ctx.channel());
        String channelId = ctx.channel().id().asShortText();
        String deviceId = ctx.channel().attr(SessionManager.DEVICE_ID).get();
        sessionManager.unbind(ctx.channel());
        if (userId != null) {
            messageService.markDeviceOffline(userId, deviceId, channelId);
            Channel current = sessionManager.getChannel(userId);
            if (current != null && current.isActive() && current != ctx.channel()) {
                // 已有更新的活跃连接，保留在线
                log.info("IM old channel closed userId={}, keep online", userId);
                return;
            }
            messageService.markOffline(userId, channelId);
            // 好友端 WebSocket 频繁断线重连时，立即广播离线会让在线好友每
            // 1~2 秒收到一次 PRESENCE 并整页重绘。延迟到重连宽限之后：若期间
            // 已重连（online key 被刷新），跳过广播，消除上下线抖动。
            ctx.executor().schedule(() -> {
                if (userId == null) return;
                if (Boolean.TRUE.equals(redis.hasKey(RedisKeys.online(userId)))) return;
                presenceService.publishOffline(userId);
            }, 12, TimeUnit.SECONDS);
            log.info("IM disconnect userId={}", userId);
        }
    }

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
        if (evt instanceof IdleStateEvent) {
            log.info("IM idle timeout, close {}", ctx.channel().id().asShortText());
            ctx.close();
        } else {
            super.userEventTriggered(ctx, evt);
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        log.warn("IM channel error: {}", cause.getMessage());
        ctx.close();
    }
}
