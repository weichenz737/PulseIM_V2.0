package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_message")
public class ImMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String msgId;
    private Long conversationId;
    private Long fromUserId;
    private Integer msgType;
    private String content;
    /** File metadata reference. The binary object never belongs in this row. */
    private String fileId;
    private String clientMsgId;
    private String replyToMsgId;
    private Boolean recalled;
    /** 被 @ 的用户 ID，逗号分隔 */
    private String mentionUserIds;
    /** 是否 @全体成员（仅群主/管理员） */
    private Boolean atAll;
    private Boolean burnAfterRead;
    private Integer burnSeconds;
    private OffsetDateTime burnReadAt;
    private OffsetDateTime burnExpiresAt;
    private OffsetDateTime autoDeleteExpiresAt;
    /** 是否由群定时消息生成。 */
    private Boolean scheduledMessage;
    private OffsetDateTime sendTime;
}
