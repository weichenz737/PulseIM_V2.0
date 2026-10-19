package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class MomentVO {
    private Long id;
    private Long userId;
    /** 当前查看者是否为该动态发布者。 */
    private Boolean mine;
    private String nickname;
    private String avatarUrl;
    private String content;
    private List<String> images;
    private List<String> originalImages;
    private List<String> mediaTypes;
    private List<String> mediaFileIds;
    /** 0=好友可见 1=仅自己 2=选择好友可见 3=所有人可见 */
    private Integer visibility;
    private List<Long> mentionUserIds;
    private List<String> mentionNicknames;
    private List<Long> visibleUserIds;
    private List<String> visibleNicknames;
    private String locationName;
    private String locationAddress;
    private Double latitude;
    private Double longitude;
    /** 当前查看者是否被提醒 */
    private Boolean mentionedMe;
    private Integer likeCount;
    private Integer commentCount;
    /** 当前用户是否已点赞 */
    private Boolean likedByMe;
    private Boolean favoritedByMe;
    /** 点赞昵称列表（最多 20） */
    private List<String> likeNicknames;
    /** 与点赞昵称列表下标一一对应的用户 ID */
    private List<Long> likeUserIds;
    /** 评论预览 */
    private List<MomentCommentVO> comments;
    private OffsetDateTime createdAt;
}
