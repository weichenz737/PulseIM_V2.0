package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class MessageVO {
    private String id;
    private Long conversationId;
    private Long fromUserId;
    private String fromNickname;
    private String fromAvatarUrl;
    private Long toUserId;
    private String content;
    /** 原始消息内容，供跨端渲染结构化消息使用。 */
    private String rawContent;
    private String fileId;
    private FileMetadataVO file;
    private Integer msgType;
    private String clientMsgId;
    private OffsetDateTime createdAt;
    private Boolean recalled;
    /** 是否由群定时消息生成。 */
    private Boolean scheduledMessage;
    private String replyToMsgId;
    private String replyToContent;
    private Integer replyToMsgType;
    private String replyToNickname;
    private Boolean replyToRecalled;
    /** 被 @ 的用户 ID 列表 */
    private java.util.List<Long> mentionUserIds;
    /** 是否 @全体成员 */
    private Boolean atAll;
    /** 当前查看者是否被 @（含 @全体） */
    private Boolean mentionedMe;
    /** Whether this message disappears after the recipient reads it. */
    private Boolean burnAfterRead;
    /** 0 means immediately; otherwise the supported countdown in seconds. */
    private Integer burnSeconds;
    private OffsetDateTime burnReadAt;
    private OffsetDateTime burnExpiresAt;
    /** Automatic deletion deadline configured for this conversation. */
    private OffsetDateTime autoDeleteExpiresAt;
}
