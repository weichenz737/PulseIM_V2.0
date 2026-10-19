package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminOperationLogVO {
    private Long id;
    private Long adminId;
    private String username;
    private String module;
    private String moduleLabel;
    private String action;
    /** 可读操作说明（面向展示） */
    private String summary;
    private String method;
    private String path;
    private String detail;
    private String ip;
    private OffsetDateTime createdAt;
}
