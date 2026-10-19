package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("moment_interaction")
public class MomentInteraction {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long recipientUserId;
    private Long actorUserId;
    private Long postId;
    private Long commentId;
    /** like / comment / reply / mention */
    private String type;
    private String summary;
    private Boolean isRead;
    private OffsetDateTime createdAt;
}
