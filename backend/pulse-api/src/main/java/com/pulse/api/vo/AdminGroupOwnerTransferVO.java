package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminGroupOwnerTransferVO {
    private Long id;
    private Long conversationId;
    private String conversationTitle;
    private Long fromUserId;
    private String fromNickname;
    private String fromPhone;
    private Long toUserId;
    private String toNickname;
    private String toPhone;
    private Long operatorId;
    private String operatorNickname;
    private String operatorType;
    private String reason;
    private OffsetDateTime createdAt;
}
