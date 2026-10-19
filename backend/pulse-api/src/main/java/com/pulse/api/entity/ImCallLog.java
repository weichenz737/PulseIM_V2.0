package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_call_log")
public class ImCallLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String callId;
    private Long conversationId;
    private Long callerId;
    private Long calleeId;
    private Long recorderId;
    private String reason;
    private String resultText;
    private Boolean connected;
    private Integer durationSec;
    /** audio | video */
    private String mediaType;
    /** private | group */
    private String callType;
    private String groupTitle;
    private Integer participantCount;
    private OffsetDateTime createdAt;
}
