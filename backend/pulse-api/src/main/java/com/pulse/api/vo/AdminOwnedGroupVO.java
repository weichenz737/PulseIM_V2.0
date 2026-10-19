package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class AdminOwnedGroupVO {
    private Long conversationId;
    private String title;
    private String avatarUrl;
    private Integer memberCount;
    /** 仅群主一人时删除用户将自动解散该群 */
    private Boolean mustDissolve;
    private List<Candidate> candidates;

    @Data
    @Builder
    public static class Candidate {
        private Long userId;
        private String nickname;
        private String phone;
        private String pulseId;
        private String avatarUrl;
        private String role;
    }
}
