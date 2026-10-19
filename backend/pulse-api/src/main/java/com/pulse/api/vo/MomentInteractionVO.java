package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class MomentInteractionVO {
    private Long id;
    /** like / comment / reply / mention */
    private String type;
    private Long actorUserId;
    private String actorNickname;
    private String actorAvatarUrl;
    private Long postId;
    private Long commentId;
    private String summary;
    /** 动态摘要，便于列表展示 */
    private String postPreview;
    private Boolean isRead;
    private OffsetDateTime createdAt;
}
