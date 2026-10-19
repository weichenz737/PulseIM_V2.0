package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class AdminAccountVO {
    private Long id;
    private String username;
    private String nickname;
    private String avatarUrl;
    private Integer status;
    private Boolean superAdmin;
    private List<String> permissions;
    private OffsetDateTime createdAt;
}
