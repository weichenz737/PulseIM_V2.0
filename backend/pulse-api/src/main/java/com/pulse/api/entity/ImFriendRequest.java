package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_friend_request")
public class ImFriendRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long fromUserId;
    private Long toUserId;
    /** 验证信息（对方可见） */
    private String message;
    /** 申请人给对方设的备注名（通过后写入自己的 im_friend.remark） */
    private String remark;
    /** 添加来源：phone / pulse_id / group / qrcode / card / deleted_chat */
    private String addSource;
    /** 0待处理 1已同意 2已拒绝 */
    private Integer status;
    private OffsetDateTime createdAt;
    private OffsetDateTime handledAt;
}
