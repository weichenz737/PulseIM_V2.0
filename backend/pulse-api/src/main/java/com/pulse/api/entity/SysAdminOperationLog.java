package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("sys_admin_operation_log")
public class SysAdminOperationLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long adminId;
    private String username;
    private String module;
    private String action;
    private String method;
    private String path;
    private String detail;
    private String ip;
    private OffsetDateTime createdAt;
}
