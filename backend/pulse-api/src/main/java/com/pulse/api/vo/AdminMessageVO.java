package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminMessageVO {
    private Long id;
    private String msgId;
    private Long conversationId;
    /** 1 私聊 / 2 群聊 */
    private Integer conversationType;
    private String conversationTitle;
    private Long fromUserId;
    private String fromNickname;
    private String fromPhone;
    private String fromPulseId;
    private String fromAvatarUrl;
    /** 私聊对方（群聊为空） */
    private Long peerUserId;
    private String peerNickname;
    private String peerPhone;
    private Integer msgType;
    private Boolean burnAfterRead;
    private OffsetDateTime burnExpiresAt;
    private OffsetDateTime autoDeleteExpiresAt;
    /** 新版附件消息的元数据；文件本体仍由管理员附件流按需读取。 */
    private String fileId;
    private FileMetadataVO file;
    private String content;
    /** 便于表格展示的摘要 */
    private String contentPreview;
    private Boolean recalled;
    /** 是否为群定时消息。 */
    private Boolean scheduledMessage;
    /** 是否有用户端删除（对本端隐藏，消息仍保留） */
    private Boolean userDeleted;
    /** 对该消息执行过删除的用户数 */
    private Integer hideCount;
    private String replyToMsgId;
    private OffsetDateTime sendTime;
}
