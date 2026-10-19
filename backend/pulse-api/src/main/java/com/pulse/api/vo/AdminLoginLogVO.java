package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminLoginLogVO {
    private Long id;
    private Long userId;
    private String phone;
    private String nickname;
    private String pulseId;
    private String loginType;
    private Boolean success;
    private String failReason;
    private String ip;
    private String userAgent;
    private String deviceSummary;
    private Boolean securityCodeChecked;
    private Boolean newDevice;
    private OffsetDateTime createdAt;
}
