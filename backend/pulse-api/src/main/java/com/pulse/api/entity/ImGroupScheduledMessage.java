package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 群聊一次性定时消息。 */
@Data
@TableName("im_group_scheduled_message")
public class ImGroupScheduledMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long setterId;
    private Integer msgType;
    private String content;
    private OffsetDateTime sendAt;
    /** PENDING / SENDING / SENT / FAILED / CANCELLED */
    private String status;
    private String lastError;
    private String sentMsgId;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
