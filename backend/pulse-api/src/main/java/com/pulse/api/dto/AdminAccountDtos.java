package com.pulse.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

public final class AdminAccountDtos {
    private AdminAccountDtos() {
    }

    @Data
    public static class CreateReq {
        @NotBlank(message = "用户名不能为空")
        @Size(min = 3, max = 32, message = "用户名长度 3-32 位")
        private String username;

        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 32, message = "密码长度 6-32 位")
        private String password;

        @Size(max = 32, message = "昵称过长")
        private String nickname;

        private Boolean superAdmin;
        private List<String> permissions;
        private Integer status;
    }

    @Data
    public static class UpdateReq {
        @Size(max = 32, message = "昵称过长")
        private String nickname;
        private Boolean superAdmin;
        private List<String> permissions;
        private Integer status;
    }

    @Data
    public static class ResetPasswordReq {
        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 32, message = "密码长度 6-32 位")
        private String password;
    }
}
