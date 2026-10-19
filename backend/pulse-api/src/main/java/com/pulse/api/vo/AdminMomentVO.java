package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class AdminMomentVO {
    private Long id;
    private Long userId;
    private String nickname;
    private String phone;
    private String pulseId;
    private String avatarUrl;
    private String content;
    private List<String> images;
    private List<String> originalImages;
    private List<String> mediaTypes;
    private List<String> mediaFileIds;
    /** 0=好友可见 1=仅自己 2=部分可见 */
    private Integer visibility;
    private String visibilityLabel;
    private Integer likeCount;
    private Integer commentCount;
    private List<String> likeNicknames;
    private List<MomentCommentVO> comments;
    private List<String> mentionNicknames;
    /**
     * normal / user_deleted / admin_deleted
     */
    private String status;
    private String statusLabel;
    private OffsetDateTime removedAt;
    private String removedBy;
    private OffsetDateTime createdAt;
}
