package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class MomentCommentVO {
    private Long id;
    private Long userId;
    private String nickname;
    private String avatarUrl;
    private String content;
    private Long replyToCommentId;
    private Long replyToUserId;
    private String replyToNickname;
    private String imageUrl;
    private String imageFileId;
    private OffsetDateTime createdAt;
}
