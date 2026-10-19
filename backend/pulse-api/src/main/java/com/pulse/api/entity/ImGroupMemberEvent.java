package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_group_member_event")
public class ImGroupMemberEvent {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private String conversationTitle;
    private Long userId;
    private String userNickname;
    private String userPhone;
    private Long operatorId;
    private String operatorNickname;
    /**
     * join / leave / kick / apply / approve / reject / dissolve
     */
    private String eventType;
    private String source;
    private String message;
    private String reason;
    private Long requestId;
    private OffsetDateTime createdAt;
}
