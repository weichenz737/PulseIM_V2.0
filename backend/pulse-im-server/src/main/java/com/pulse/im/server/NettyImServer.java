package com.pulse.im.server;

import com.pulse.im.codec.ProtobufWebSocketDecoder;
import com.pulse.im.codec.ProtobufWebSocketEncoder;
import com.pulse.im.config.ImProperties;
import com.pulse.im.handler.CallSignalInboundHandler;
import com.pulse.im.handler.ImServerHandler;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.stream.ChunkedWriteHandler;
import io.netty.handler.timeout.IdleStateHandler;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class NettyImServer implements ApplicationRunner {
    private final ImProperties properties;
    private final ImServerHandler imServerHandler;
    private final CallSignalInboundHandler callSignalInboundHandler;

    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;

    @Override
    public void run(ApplicationArguments args) {
        Thread t = new Thread(this::start, "netty-im-bootstrap");
        t.setDaemon(false);
        t.start();
    }

    private void start() {
        ImProperties.Im im = properties.getIm();
        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup();
        try {
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .childOption(ChannelOption.SO_KEEPALIVE, true)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ch.pipeline()
                                    .addLast(new IdleStateHandler(im.getHeartbeatTimeoutSeconds(), 0, 0, TimeUnit.SECONDS))
                                    .addLast(new HttpServerCodec())
                                    .addLast(new ChunkedWriteHandler())
                                    .addLast(new HttpObjectAggregator(65536))
                                    .addLast(new WebSocketServerProtocolHandler(im.getPath(), null, true))
                                    // CALL_* 必须在 Protobuf 解码前拦截，否则会变成 CMD_UNKNOWN
                                    .addLast(callSignalInboundHandler)
                                    .addLast(new ProtobufWebSocketDecoder())
                                    .addLast(new ProtobufWebSocketEncoder())
                                    .addLast(imServerHandler);
                        }
                    });
            ChannelFuture future = bootstrap.bind(im.getHost(), im.getPort()).sync();
            log.info("Pulse IM Netty WebSocket started on {}:{}{}", im.getHost(), im.getPort(), im.getPath());
            future.channel().closeFuture().sync();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            shutdown();
        }
    }

    @PreDestroy
    public void shutdown() {
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }
    }
}
