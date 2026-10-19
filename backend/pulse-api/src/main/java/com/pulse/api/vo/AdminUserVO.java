package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@Builder
public class AdminUserVO {
    private Long id;
    private String phone;
    /** 明文密码（仅详情返回，列表不返回） */
    private String password;
    private Boolean securityCodeEnabled;
    private String securityCode;
    private String pulseId;
    private String nickname;
    private String avatarUrl;
    private String gender;
    private LocalDate birthday;
    private String region;
    private String signature;
    /** 钱包余额，单位：分 */
    private Long walletBalance;
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
    /** 1=正常，0=封禁 */
    private Integer status;
    /** 是否永久封禁（status=0 且 banUntil 为空） */
    private Boolean banPermanent;
    /** 封禁到期时间；永久封禁时为空 */
    private OffsetDateTime banUntil;
    /** 封禁原因 */
    private String banReason;
    private Boolean online;
    /** 最近在线时间；在线时为当前时刻 */
    private OffsetDateTime lastOnlineAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    /** 该用户拉黑的人数 */
    private Integer blockCount;
    /** 好友数 */
    private Integer friendCount;
    /** 收藏数 */
    private Integer favoriteCount;
    /** 删友记录数 */
    private Integer friendDeleteCount;
}
