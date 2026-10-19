package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminCallLogVO {
    private Long id;
    private String callId;
    private Long conversationId;
    private Long callerId;
    private String callerNickname;
    private String callerPhone;
    private Long calleeId;
    private String calleeNickname;
    private String calleePhone;
    private Long recorderId;
    private String reason;
    private String resultText;
    private Boolean connected;
    private Integer durationSec;
    private String durationText;
    /** audio | video */
    private String mediaType;
    /** 语音通话 / 视频通话 */
    private String mediaTypeLabel;
    /** private | group */
    private String callType;
    private String groupTitle;
    private Integer participantCount;
    private OffsetDateTime createdAt;
}
