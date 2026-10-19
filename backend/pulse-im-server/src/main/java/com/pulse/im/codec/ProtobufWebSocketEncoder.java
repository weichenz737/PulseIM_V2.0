package com.pulse.im.codec;

import com.pulse.im.session.SessionManager;
import com.pulse.proto.ImEnvelope;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageEncoder;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

@Slf4j
public class ProtobufWebSocketEncoder extends MessageToMessageEncoder<ImEnvelope> {
    @Override
    protected void encode(ChannelHandlerContext ctx, ImEnvelope msg, List<Object> out) {
        Boolean jsonClient = ctx.channel().attr(SessionManager.JSON_CLIENT).get();
        try {
            // Outbound IM frames are always JSON metadata, never protobuf
            // binary. This also keeps the transport contract enforceable at
            // the edge and makes accidental file streaming impossible.
            out.add(new TextWebSocketFrame(JsonImBridge.toJson(msg)));
        } catch (Exception e) {
            log.warn("JSON encode failed: {}", e.getMessage());
            out.add(new TextWebSocketFrame("{\"cmd\":\"ERROR\",\"code\":\"SERIALIZE_ERROR\"}"));
        }
    }
}
