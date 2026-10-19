package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_group_owner_transfer")
public class ImGroupOwnerTransfer {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private String conversationTitle;
    private Long fromUserId;
    private String fromNickname;
    private String fromPhone;
    private Long toUserId;
    private String toNickname;
    private String toPhone;
    private Long operatorId;
    private String operatorNickname;
    /** user / admin / system */
    private String operatorType;
    /** user_transfer / admin_delete_user / admin_transfer */
    private String reason;
    private OffsetDateTime createdAt;
}
