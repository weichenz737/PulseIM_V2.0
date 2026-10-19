package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_group_join_request")
public class ImGroupJoinRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long applicantId;
    private Long inviterId;
    private String message;
    /** qrcode / card / invite / join / invite_confirm */
    private String source;
    /**
     * 待谁确认：
     * admin = 群主/管理员审核
     * invitee = 被邀请人确认（拉我入群需验证）
     */
    private String confirmBy;
    /** 0待审核 1已同意 2已拒绝 3已取消 */
    private Integer status;
    private Long handledBy;
    private String handleRemark;
    private OffsetDateTime createdAt;
    private OffsetDateTime handledAt;
}
