package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class MomentsUpdateVO {
    /** 有新动态的好友数量 */
    private Integer count;
    /** 最多 4 个好友头像（按最新动态排序） */
    private List<AvatarItem> avatars;

    @Data
    @Builder
    public static class AvatarItem {
        private Long userId;
        private String nickname;
        private String avatarUrl;
    }
}
