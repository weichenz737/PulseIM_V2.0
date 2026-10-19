package com.pulse.im.session;

import io.netty.channel.Channel;
import io.netty.util.AttributeKey;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionManager {
    public static final AttributeKey<Long> USER_ID = AttributeKey.valueOf("userId");
    public static final AttributeKey<String> DEVICE_ID = AttributeKey.valueOf("deviceId");
    public static final AttributeKey<Boolean> AUTHED = AttributeKey.valueOf("authed");
    public static final AttributeKey<Boolean> JSON_CLIENT = AttributeKey.valueOf("jsonClient");

    private final Map<Long, Map<String, Channel>> userChannels = new ConcurrentHashMap<>();
    private final Map<String, Long> channelUsers = new ConcurrentHashMap<>();

    public void bind(Long userId, String deviceId, Channel channel) {
        String key = deviceKey(deviceId, channel);
        userChannels.computeIfAbsent(userId, ignored -> new ConcurrentHashMap<>()).put(key, channel);
        channelUsers.put(channel.id().asLongText(), userId);
        channel.attr(USER_ID).set(userId);
        channel.attr(DEVICE_ID).set(key);
        channel.attr(AUTHED).set(true);
    }

    public Channel getChannel(Long userId) {
        return getChannels(userId).stream().findFirst().orElse(null);
    }

    public Channel getChannel(Long userId, String deviceId) {
        Map<String, Channel> channels = userChannels.get(userId);
        if (channels == null) return null;
        Channel channel = channels.get(deviceKey(deviceId, null));
        return channel != null && channel.isActive() ? channel : null;
    }

    public List<Channel> getChannels(Long userId) {
        Map<String, Channel> channels = userChannels.get(userId);
        if (channels == null || channels.isEmpty()) return List.of();
        List<Channel> active = new ArrayList<>();
        channels.values().forEach(channel -> {
            if (channel != null && channel.isActive()) active.add(channel);
        });
        return active;
    }

    public Channel removeAndGetOld(Long userId, String deviceId, Channel current) {
        Channel old = getChannel(userId, deviceId);
        return old != current ? old : null;
    }

    public void unbind(Channel channel) {
        Long userId = channelUsers.remove(channel.id().asLongText());
        if (userId != null) {
            Map<String, Channel> channels = userChannels.get(userId);
            if (channels != null) {
                String key = channel.attr(DEVICE_ID).get();
                if (key != null) channels.remove(key, channel);
                channels.values().removeIf(value -> value == channel);
                if (channels.isEmpty()) userChannels.remove(userId, channels);
            }
        }
        channel.attr(USER_ID).set(null);
        channel.attr(DEVICE_ID).set(null);
        channel.attr(AUTHED).set(false);
    }

    public Long getUserId(Channel channel) {
        return channel.attr(USER_ID).get();
    }

    public boolean isAuthed(Channel channel) {
        Boolean v = channel.attr(AUTHED).get();
        return v != null && v;
    }

    private String deviceKey(String deviceId, Channel channel) {
        if (deviceId != null && !deviceId.isBlank()) return deviceId.trim();
        return channel == null ? "" : "channel:" + channel.id().asLongText();
    }
}
