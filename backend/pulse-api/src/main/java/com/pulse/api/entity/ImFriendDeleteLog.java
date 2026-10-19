package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_friend_delete_log")
public class ImFriendDeleteLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    /** 发起删除/拉黑的用户 */
    private Long userId;
    /** 被解除的好友 */
    private Long friendId;
    private String addSource;
    private Long addInitiatorId;
    private OffsetDateTime friendSince;
    /** delete | block */
    private String reason;
    private OffsetDateTime deletedAt;
}
