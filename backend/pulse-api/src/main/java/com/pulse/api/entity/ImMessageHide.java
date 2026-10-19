package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_message_hide")
public class ImMessageHide {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long conversationId;
    private String msgId;
    private OffsetDateTime createdAt;
}
