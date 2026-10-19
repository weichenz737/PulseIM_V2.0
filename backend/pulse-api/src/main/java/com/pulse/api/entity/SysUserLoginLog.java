package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("sys_user_login_log")
public class SysUserLoginLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String phone;
    private String nickname;
    private String pulseId;
    /** password / sms / register / qr */
    private String loginType;
    private Boolean success;
    private String failReason;
    private String ip;
    private String userAgent;
    /** 可读设备摘要，如「iPhone · iOS 17 · Safari」 */
    private String deviceSummary;
    /** 本次登录是否完成了安全码校验 */
    private Boolean securityCodeChecked;
    /** 是否换设备/未信任设备登录 */
    private Boolean newDevice;
    private OffsetDateTime createdAt;
}
