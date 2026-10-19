package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_user_block")
public class ImUserBlock {
    @TableId(type = IdType.AUTO)
    private Long id;
    /** 拉黑方 */
    private Long userId;
    /** 被拉黑方 */
    private Long blockedUserId;
    /** 拉黑时保存的备注（好友关系解除后仍可展示） */
    private String remark;
    private OffsetDateTime createdAt;
}
