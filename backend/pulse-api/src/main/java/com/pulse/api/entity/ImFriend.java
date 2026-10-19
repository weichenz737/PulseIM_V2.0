package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_friend")
public class ImFriend {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long friendId;
    private String remark;
    /** 不看对方的朋友圈 */
    private Boolean hideHisMoments;
    /** 不让对方看我的朋友圈 */
    private Boolean rejectHisMoments;
    /** 添加来源：phone / pulse_id / group / qrcode / card / deleted_chat */
    private String addSource;
    /** 发起添加的用户 ID */
    private Long addInitiatorId;
    /** 好友标签（如默认好友后台配置的展示标签） */
    private String tag;
    private OffsetDateTime createdAt;
}
