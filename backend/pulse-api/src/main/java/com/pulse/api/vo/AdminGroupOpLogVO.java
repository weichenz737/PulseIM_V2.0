package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminGroupOpLogVO {
    private Long id;
    private String msgId;
    private Long conversationId;
    private String conversationTitle;
    private Long operatorId;
    private String operatorNickname;
    private String operatorPhone;
    /** 操作分类：owner / admin / mute / notice / title / avatar / verify / join / leave / kick / create / other */
    private String opType;
    private String opTypeLabel;
    private String content;
    private OffsetDateTime createdAt;
}
