package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminBlockedUserVO {
    /** 被拉黑用户 ID */
    private Long userId;
    private String phone;
    private String pulseId;
    private String nickname;
    private String avatarUrl;
    /** 拉黑时保存的备注 */
    private String remark;
    private OffsetDateTime blockedAt;
    /** 拉黑发起用户（全局黑名单列表用） */
    private Long ownerUserId;
    private String ownerNickname;
    private String ownerPhone;
    private String ownerPulseId;
}
