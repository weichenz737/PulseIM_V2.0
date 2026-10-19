package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GroupWelcomeVO {
    private Long conversationId;
    private String message;
    private Long setterId;
    private String setterNickname;
    private String setterAvatarUrl;
}
