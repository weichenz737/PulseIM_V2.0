package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class FriendRequestVO {
    private Long id;
    private Long fromUserId;
    private Long toUserId;
    private String nickname;
    private String avatarUrl;
    private String message;
    private String remark;
    /** 0待处理 1已同意 2已拒绝 */
    private Integer status;
    /** incoming | outgoing */
    private String direction;
    private OffsetDateTime createdAt;
    private OffsetDateTime handledAt;
}
