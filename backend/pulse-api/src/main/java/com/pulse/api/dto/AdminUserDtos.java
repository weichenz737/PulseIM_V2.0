package com.pulse.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

public final class AdminUserDtos {
    private AdminUserDtos() {
    }

    @Data
    public static class CreateUserReq {
        @NotBlank(message = "手机号不能为空")
        @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
        private String phone;

        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 32, message = "密码长度需为 6-32 位")
        private String password;

        @NotBlank(message = "昵称不能为空")
        @Size(max = 64, message = "昵称过长")
        private String nickname;

        private String avatarUrl;
        private String gender;
        private String region;
        private String signature;
    }

    @Data
    public static class UpdateUserReq {
        @Size(max = 64, message = "昵称过长")
        private String nickname;
        private String avatarUrl;
        private String gender;
        private String region;
        private String signature;
        private String birthday;
        private Boolean friendVerifyRequired;
        private Boolean groupInviteVerify;
        private Boolean addByPhone;
        private Boolean addByPulseId;
        private Boolean addByGroup;
        private Boolean addByQrcode;
        private Boolean addByCard;
        private Boolean addByDeletedChat;
        private Boolean searchByPhone;
        private Boolean searchByPulseId;
    }

    @Data
    public static class UpdateStatusReq {
        @NotNull(message = "状态不能为空")
        private Integer status;
        /** 封禁天数；status=0 时有效。空/≤0 表示永久封禁 */
        private Integer banDays;
        /** 封禁原因（可选） */
        @Size(max = 256, message = "封禁原因过长")
        private String banReason;
    }

    @Data
    public static class ResetPasswordReq {
        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 32, message = "密码长度需为 6-32 位")
        private String password;
    }

    @Data
    public static class DeleteUserReq {
        private java.util.List<OwnerTransfer> transfers;
        /** 管理员明确确认同时删除该用户拥有的社区圈子。 */
        private Boolean deleteOwnedCommunities;
    }

    @Data
    public static class OwnerTransfer {
        private Long conversationId;
        private Long newOwnerId;
    }
}
