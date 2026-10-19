package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class GroupJoinRequestVO {
    private Long id;
    private Long conversationId;
    private String groupTitle;
    private Long applicantId;
    private String applicantNickname;
    private String applicantAvatarUrl;
    private String applicantPhone;
    private Long inviterId;
    private String inviterNickname;
    private String message;
    private String source;
    private Integer status;
    private Long handledBy;
    private String handlerNickname;
    private String handleRemark;
    private OffsetDateTime createdAt;
    private OffsetDateTime handledAt;
}
