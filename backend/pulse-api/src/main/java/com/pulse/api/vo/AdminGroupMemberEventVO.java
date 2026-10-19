package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminGroupMemberEventVO {
    private Long id;
    private Long conversationId;
    private String conversationTitle;
    private Long userId;
    private String userNickname;
    private String userPhone;
    private Long operatorId;
    private String operatorNickname;
    private String eventType;
    private String source;
    private String message;
    private String reason;
    private Long requestId;
    private OffsetDateTime createdAt;
}
