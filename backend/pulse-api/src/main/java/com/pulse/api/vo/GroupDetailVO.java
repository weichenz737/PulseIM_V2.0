package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class GroupDetailVO {
    private Long id;
    private String title;
    /** 对外展示和搜索的随机群 PulseID，二维码仍使用内部会话 ID。 */
    private String pulseId;
    private String avatarUrl;
    private String notice;
    private String welcomeMessage;
    private Long welcomeSetterId;
    private String welcomeSetterNickname;
    private String welcomeSetterAvatarUrl;
    private Long ownerId;
    /** 当前用户是否群主 */
    private Boolean owner;
    /** 当前用户是否管理员（含群主） */
    private Boolean admin;
    /** 当前用户角色：owner / admin / member */
    private String myRole;
    private String myGroupNickname;
    private String groupRemark;
    private Boolean hidden;
    private Boolean pinned;
    private Boolean mute;
    /** 全员禁言 */
    private Boolean muteAll;
    /** 加群需群主/管理员审核 */
    private Boolean joinVerifyRequired;
    private Boolean memberFriendAllowed;
    private Integer searchMode;
    private Boolean memberInviteAllowed;
    /** 待审核加群申请数（仅管理员可见时有意义） */
    private Integer pendingJoinCount;
    /** 当前用户是否被禁言 */
    private Boolean speakMuted;
    private Integer memberCount;
    private List<GroupMemberVO> members;

    @Data
    @Builder
    public static class GroupMemberVO {
        private Long userId;
        private String nickname;
        private String groupNickname;
        /** 当前查看者对该成员的好友备注（含后台默认好友新昵称） */
        private String remark;
        /** 当前查看者对该成员的好友标签（含后台默认好友标签） */
        private String tag;
        private String avatarUrl;
        /** owner / admin / member */
        private String role;
        private Boolean owner;
        private Boolean admin;
        /** 是否被禁言 */
        private Boolean speakMuted;
    }
}
