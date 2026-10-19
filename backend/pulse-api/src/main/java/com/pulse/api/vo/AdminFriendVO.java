package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class AdminFriendVO {
    /** 好友用户 ID */
    private Long userId;
    private String phone;
    private String pulseId;
    private String nickname;
    private String avatarUrl;
    private String remark;
    private String addSource;
    private String addSourceLabel;
    private Long addInitiatorId;
    private String addInitiatorNickname;
    private OffsetDateTime friendSince;
    private Boolean online;
    /** 关系所属用户（全局好友列表用） */
    private Long ownerUserId;
    private String ownerNickname;
    private String ownerPhone;
    private String ownerPulseId;
    /** 双方共同群聊数 */
    private Integer commonGroupCount;
    /** 双方共同群聊 */
    private List<CommonGroupVO> commonGroups;
}
