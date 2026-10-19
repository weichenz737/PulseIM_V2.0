package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GroupPreviewVO {
    private Long id;
    private String pulseId;
    private String title;
    private String avatarUrl;
    private String notice;
    private Integer memberCount;
    /** 当前用户是否已在群内 */
    private Boolean joined;
    /** 加群是否需要审核 */
    private Boolean joinVerifyRequired;
    /** 当前用户是否有待审核申请 */
    private Boolean joinPending;
    private String ownerNickname;
}
