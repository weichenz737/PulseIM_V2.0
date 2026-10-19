package com.pulse.api.service;

import com.pulse.api.entity.SysAdmin;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.support.AdminPermissionCodes;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AdminPermissionService {
    private final SysAdminMapper adminMapper;

    public SysAdmin requireActiveAdmin(Long adminId) {
        if (adminId == null) {
            throw new BizException(401, "未登录");
        }
        SysAdmin admin = adminMapper.selectById(adminId);
        if (admin == null) {
            throw new BizException(401, "管理员不存在");
        }
        if (admin.getStatus() != null && admin.getStatus() != 1) {
            throw new BizException(403, "账号已禁用");
        }
        return admin;
    }

    public boolean isSuper(SysAdmin admin) {
        return admin != null && Boolean.TRUE.equals(admin.getSuperAdmin());
    }

    public List<String> resolvePermissions(SysAdmin admin) {
        if (admin == null) {
            return List.of();
        }
        if (isSuper(admin)) {
            return new ArrayList<>(AdminPermissionCodes.all());
        }
        return new ArrayList<>(effectivePermissions(admin));
    }

    public boolean hasPermission(SysAdmin admin, String code) {
        if (!StringUtils.hasText(code)) {
            return true;
        }
        if (isSuper(admin)) {
            return true;
        }
        return effectivePermissions(admin).contains(code);
    }

    public void assertPermission(Long adminId, String code) {
        SysAdmin admin = requireActiveAdmin(adminId);
        if (!hasPermission(admin, code)) {
            throw new BizException(403, "无权限访问：" + AdminPermissionCodes.labelOf(code));
        }
    }

    public void assertCanAssign(SysAdmin actor, boolean targetSuper, Set<String> targetPerms) {
        if (isSuper(actor)) {
            return;
        }
        if (targetSuper) {
            throw new BizException("仅超级管理员可创建/设置超级管理员");
        }
        Set<String> mine = effectivePermissions(actor);
        for (String p : targetPerms) {
            if (!mine.contains(p)) {
                throw new BizException("不能授予超出自身的权限：" + AdminPermissionCodes.labelOf(p));
            }
        }
    }

    private Set<String> effectivePermissions(SysAdmin admin) {
        Set<String> permissions = new LinkedHashSet<>(AdminPermissionCodes.parse(admin.getPermissions()));
        // 旧版「用户管理」一把梭：自动包含拆分后的子菜单权限
        if (permissions.contains(AdminPermissionCodes.USERS)) {
            permissions.addAll(AdminPermissionCodes.USER_MGMT_CHILDREN);
        }
        // Before system configuration permissions were split, ADMINS covered these routes.
        if (permissions.contains(AdminPermissionCodes.ADMINS)) {
            permissions.addAll(AdminPermissionCodes.SYSTEM_CONFIG_CHILDREN);
        }
        // 旧版「文本配置」曾覆盖 App 版本管理
        if (permissions.contains(AdminPermissionCodes.SYSTEM_TEXTS)) {
            permissions.add(AdminPermissionCodes.APP_VERSION);
        }
        // 旧版控制台总权限自动覆盖新 Dashboard 的细分权限。
        if (permissions.contains(AdminPermissionCodes.DASHBOARD)) {
            permissions.add(AdminPermissionCodes.DASHBOARD_VIEW);
            permissions.add(AdminPermissionCodes.DASHBOARD_USER);
            permissions.add(AdminPermissionCodes.DASHBOARD_MESSAGE);
            permissions.add(AdminPermissionCodes.DASHBOARD_FINANCE);
        }
        return permissions;
    }
}
