package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AdminOwnedCommunityVO {
    private Long communityId;
    private String name;
    private Integer memberCount;
    private String status;
}
