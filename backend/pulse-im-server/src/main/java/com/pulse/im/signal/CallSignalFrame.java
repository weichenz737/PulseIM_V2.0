package com.pulse.im.signal;

/**
 * WebRTC 通话信令（JSON 文本帧短路，不经 Protobuf）。
 */
public record CallSignalFrame(String json) {
}
