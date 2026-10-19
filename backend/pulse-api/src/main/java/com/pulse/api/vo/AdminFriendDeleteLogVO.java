package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminFriendDeleteLogVO {
    private Long id;
    private Long userId;
    private String userNickname;
    private String userPhone;
    private String userPulseId;
    private Long friendId;
    private String friendNickname;
    private String friendPhone;
    private String friendPulseId;
    private String friendAvatarUrl;
    private String addSource;
    private String addSourceLabel;
    private Long addInitiatorId;
    private OffsetDateTime friendSince;
    /** delete | block */
    private String reason;
    private String reasonLabel;
    private OffsetDateTime deletedAt;
}
