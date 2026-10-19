package com.pulse.api.vo;

import lombok.Data;

import java.time.OffsetDateTime;

@Data
public class ConversationVO {
    private Long id;
    private Integer type;
    private String title;
    private String avatarUrl;
    /** 单聊对方真实昵称，仅用于无头像占位字；不受好友备注影响。 */
    private String peerNickname;
    private String lastMsgPreview;
    private OffsetDateTime lastMsgTime;
    private Integer unreadCount;
    private Long peerUserId;
    private Boolean online;
    /** 在线状态被隐藏（开启隐藏在线状态后双方都不展示） */
    private Boolean onlineHidden;
    private Boolean archived;
    private Boolean pinned;
    private Boolean mute;
    /** 首页删除只隐藏消息入口；联系人群聊仍需要知道该状态以继续展示群。 */
    private Boolean hidden;
    /** 会话内有人 @ 我且未读 */
    private Boolean mentionUnread;
    /** 单聊：好友标签（后台默认好友 / 本端设置） */
    private String tag;
    /** 是否为系统文件传输助手会话。 */
    private Boolean fileTransferAssistant;
}
