package com.pulse.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

public final class AuthDtos {
    private AuthDtos() {
    }

    @Data
    public static class SendSmsReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
        private String phone;
        /** register | login | reset | change_phone | change_password */
        private String scene = "login";
        private String platform;
    }

    @Data
    public static class LoginPasswordReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$")
        private String phone;
        @NotBlank
        private String password;
        private String deviceId;
        private String deviceName;
        private String platform;
        private String securityCode;
    }

    @Data
    public static class LoginSmsReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$")
        private String phone;
        @NotBlank
        private String code;
        private String deviceId;
        private String deviceName;
        private String platform;
        private String securityCode;
    }

    @Data
    public static class RegisterReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$")
        private String phone;
        @NotBlank
        private String code;
        @NotBlank
        @Size(min = 6, max = 32)
        private String password;
        @NotBlank
        @Size(min = 1, max = 64)
        private String nickname;
        private String avatarUrl;
        private String deviceId;
        private String deviceName;
        private String platform;
    }

    @Data
    public static class ResetPasswordReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
        private String phone;
        @NotBlank(message = "验证码不能为空")
        private String code;
        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 32, message = "密码长度需为 6-32 位")
        private String password;
    }

    @Data
    public static class AdminLoginReq {
        @NotBlank
        private String username;
        @NotBlank
        private String password;
    }

    @Data
    public static class AdminUpdateProfileReq {
        @Size(max = 64, message = "昵称过长")
        private String nickname;
        private String avatarUrl;
    }

    @Data
    public static class AdminChangePasswordReq {
        @NotBlank(message = "请输入原密码")
        private String oldPassword;
        @NotBlank(message = "请输入新密码")
        @Size(min = 6, max = 32, message = "新密码长度需为 6-32 位")
        private String newPassword;
    }

    @Data
    public static class UserChangePasswordReq {
        @NotBlank
        private String oldPassword;
        @NotBlank
        @Size(min = 6, max = 32)
        private String newPassword;
        @NotBlank
        private String code;
    }

    @Data
    public static class UserChangePhoneReq {
        @NotBlank
        @Pattern(regexp = "^1\\d{10}$")
        private String newPhone;
        @NotBlank
        private String code;
    }
}
