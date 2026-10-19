package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("sys_admin_login_log")
public class SysAdminLoginLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long adminId;
    private String username;
    private Boolean success;
    private String failReason;
    private String ip;
    private String userAgent;
    private OffsetDateTime createdAt;
}
