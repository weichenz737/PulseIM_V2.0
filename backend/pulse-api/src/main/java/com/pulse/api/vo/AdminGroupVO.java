package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class AdminGroupVO {
    private Long id;
    /** 群 PulseID（固定 8 位展示） */
    private String pulseId;
    private String title;
    private String avatarUrl;
    private Long ownerId;
    private String ownerNickname;
    private String ownerPhone;
    private Integer memberCount;
    private Boolean muteAll;
    /** 加群是否需要审核 */
    private Boolean joinVerifyRequired;
    private String notice;
    private String welcomeMessage;
    private Long welcomeSetterId;
    private String welcomeSetterNickname;
    private String welcomeSetterAvatarUrl;
    private String lastMsgPreview;
    private OffsetDateTime lastMsgTime;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private List<Member> members;
    /** 建群记录（创建人 / 建群时加入的成员） */
    private List<CreateRecord> createRecords;

    @Data
    @Builder
    public static class Member {
        private Long userId;
        private String nickname;
        private String phone;
        private String pulseId;
        private String avatarUrl;
        private String role;
        /** 被管理员禁言（不可发言） */
        private Boolean speakMuted;
        /** 入群方式 */
        private String joinSource;
        private OffsetDateTime joinedAt;
    }

    @Data
    @Builder
    public static class CreateRecord {
        private Long userId;
        private String nickname;
        private String phone;
        private String pulseId;
        private String avatarUrl;
        /** create / create_invite */
        private String source;
        private String sourceLabel;
        private String reason;
        /** 操作人（通常为建群者） */
        private Long operatorId;
        private String operatorNickname;
        private OffsetDateTime createdAt;
    }
}
