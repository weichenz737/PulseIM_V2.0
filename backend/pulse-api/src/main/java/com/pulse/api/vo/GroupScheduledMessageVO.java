package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class GroupScheduledMessageVO {
    private Long id;
    private Long conversationId;
    private Long setterId;
    private String setterNickname;
    private String setterAvatarUrl;
    private Integer msgType;
    private String content;
    private OffsetDateTime sendAt;
    private String status;
    private String lastError;
    private String sentMsgId;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
