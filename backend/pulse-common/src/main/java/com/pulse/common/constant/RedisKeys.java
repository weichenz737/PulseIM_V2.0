package com.pulse.common.constant;

public final class RedisKeys {
    private RedisKeys() {
    }

    public static final String SMS_CODE = "pulse:sms:";
    public static final String ONLINE = "pulse:online:";
    public static final String CONN = "pulse:conn:";
    /** 单个设备的实时在线标记：pulse:online:device:{userId}:{deviceId} -> node:channelId */
    public static final String DEVICE_ONLINE = "pulse:online:device:";
    /** 最近在线时间（ISO-8601），离线后仍保留 */
    public static final String LAST_ONLINE = "pulse:last_online:";
    public static final String TOKEN_BLACKLIST = "pulse:token:bl:";
    public static final String USER_AUTH_VERSION = "pulse:user:auth_version:";
    public static final String USER_DEVICE_REVOKED = "pulse:user:device:revoked:";
    /** API 落库后通知 IM 向前端推送 */
    public static final String IM_PUSH_CHANNEL = "pulse:im:push";
    /** IM WebSocket 消息异步落库队列（Redis Stream） */
    public static final String IM_MSG_STREAM = "pulse:im:msg:stream";
    public static final String MOMENTS_SEEN = "pulse:moments:seen:";
    public static final String DESKTOP_QR_LOGIN = "pulse:auth:desktop-qr:";

    public static String smsCode(String phone) {
        return SMS_CODE + phone;
    }

    public static String online(Long userId) {
        return ONLINE + userId;
    }

    public static String conn(Long userId) {
        return CONN + userId;
    }

    public static String deviceOnline(Long userId, String deviceId) {
        return DEVICE_ONLINE + userId + ":" + deviceId;
    }

    public static String lastOnline(Long userId) {
        return LAST_ONLINE + userId;
    }

    public static String momentsSeen(Long userId) {
        return MOMENTS_SEEN + userId;
    }

    public static String desktopQrLogin(String ticket) {
        return DESKTOP_QR_LOGIN + ticket;
    }

    public static String userAuthVersion(Long userId) {
        return USER_AUTH_VERSION + userId;
    }

    public static String userDeviceRevoked(Long userId, String deviceId) {
        return USER_DEVICE_REVOKED + userId + ":" + deviceId;
    }
}
