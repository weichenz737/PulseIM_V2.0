package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GroupJoinResultVO {
    /** 是否已入群 */
    private Boolean joined;
    /** 是否进入待审核 */
    private Boolean pending;
    private Long requestId;
    private String message;
    private ConversationVO conversation;
}
