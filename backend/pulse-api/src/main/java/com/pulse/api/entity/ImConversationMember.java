package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_conversation_member")
public class ImConversationMember {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long userId;
    private Integer unreadCount;
    private Boolean mute;
    private Boolean archived;
    private Boolean pinned;
    private Boolean hidden;
    /** 被管理员禁言（不可发言） */
    private Boolean speakMuted;
    private Long peerUserId;
    /** owner / admin / member */
    private String role;
    /**
     * 入群方式：
     * create / create_invite / invite / qrcode / card / unknown
     */
    private String joinSource;
    private OffsetDateTime joinedAt;
    /** 已读水位：本会话内读到的最后一条业务消息 id */
    private String lastReadMsgId;
    private OffsetDateTime lastReadAt;
    /** 有人 @ 我且尚未进入会话清除 */
    private Boolean mentionUnread;
    /** 成员在本群展示的昵称。 */
    private String groupNickname;
    /** 当前用户为该群设置的本地备注。 */
    private String groupRemark;
    /** 免打扰下仍通知的群消息类型。 */
    private Boolean importantAtAll;
    private Boolean importantMentionMe;
    private Boolean importantReplyMe;
    private Boolean importantAnnouncement;
    /** 关注的群成员 ID，逗号分隔。 */
    private String importantFollowedMemberIds;
}
