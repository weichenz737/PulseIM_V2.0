package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminLoginAuditVO {
    private Long id;
    private Long adminId;
    private String username;
    private Boolean success;
    private String failReason;
    private String ip;
    private String userAgent;
    private OffsetDateTime createdAt;
}
