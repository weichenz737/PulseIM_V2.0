package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("sys_admin")
public class SysAdmin {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    private String passwordHash;
    private String nickname;
    private String avatarUrl;
    private Integer status;
    /** 超级管理员：拥有全部权限 */
    @TableField("is_super")
    private Boolean superAdmin;
    /** 逗号分隔权限码，非超管时生效 */
    private String permissions;
    private OffsetDateTime createdAt;
}
