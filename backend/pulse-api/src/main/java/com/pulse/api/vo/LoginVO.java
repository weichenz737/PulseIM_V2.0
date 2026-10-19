package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class LoginVO {
    private String token;
    private Long userId;
    /** 管理员登录名 */
    private String username;
    /** 7 位对外 PulseID */
    private String pulseId;
    private String nickname;
    private String avatarUrl;
    private String phone;
    /** 是否超级管理员（仅管理端） */
    private Boolean superAdmin;
    /** 权限码列表（仅管理端） */
    private List<String> permissions;
}
