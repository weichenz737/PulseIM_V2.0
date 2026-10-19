package com.pulse.im.codec;

import com.pulse.im.session.SessionManager;
import com.pulse.proto.ImEnvelope;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageDecoder;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

import java.util.List;

/**
 * Decodes WebSocket frames into Protobuf ImEnvelope.
 * Text/JSON frames mark the channel as a JSON client for outbound replies.
 * CALL_* 由 CallSignalInboundHandler 提前拦截。
 */
public class ProtobufWebSocketDecoder extends MessageToMessageDecoder<Object> {
    @Override
    protected void decode(ChannelHandlerContext ctx, Object msg, List<Object> out) throws Exception {
        if (msg instanceof BinaryWebSocketFrame frame) {
            // The IM WebSocket is metadata-only. Binary frames and Base64
            // protobuf payloads are deliberately rejected so file bytes can
            // never accidentally travel through this channel.
            ctx.close();
        } else if (msg instanceof TextWebSocketFrame text) {
            String payload = text.text();
            ctx.channel().attr(SessionManager.JSON_CLIENT).set(true);
            if (!payload.trim().startsWith("{")) {
                ctx.close();
                return;
            }
            out.add(JsonImBridge.toEnvelope(payload));
        }
    }
}
