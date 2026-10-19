package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.dto.AdminAccountDtos;
import com.pulse.api.entity.SysAdmin;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.support.AdminPermissionCodes;
import com.pulse.api.vo.AdminAccountVO;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminAccountService {
    private final SysAdminMapper adminMapper;
    private final AdminPermissionService permissionService;
    private final PasswordEncoder passwordEncoder;

    public Map<String, Object> list(int page, int size, String keyword, Integer status) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<SysAdmin> qw = new LambdaQueryWrapper<>();
        if (status != null) {
            qw.eq(SysAdmin::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(SysAdmin::getUsername, kw).or().like(SysAdmin::getNickname, kw));
        }
        qw.orderByDesc(SysAdmin::getSuperAdmin).orderByAsc(SysAdmin::getId);
        Page<SysAdmin> result = adminMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminAccountVO> list = result.getRecords().stream().map(this::toVO).collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public AdminAccountVO get(Long id) {
        SysAdmin admin = adminMapper.selectById(id);
        if (admin == null) {
            throw new BizException("管理员不存在");
        }
        return toVO(admin);
    }

    @Transactional
    public AdminAccountVO create(Long actorId, AdminAccountDtos.CreateReq req) {
        SysAdmin actor = permissionService.requireActiveAdmin(actorId);
        String username = req.getUsername().trim();
        if (!username.matches("^[a-zA-Z0-9_]+$")) {
            throw new BizException("用户名仅支持字母、数字和下划线");
        }
        Long exists = adminMapper.selectCount(new LambdaQueryWrapper<SysAdmin>().eq(SysAdmin::getUsername, username));
        if (exists != null && exists > 0) {
            throw new BizException("用户名已存在");
        }
        boolean targetSuper = Boolean.TRUE.equals(req.getSuperAdmin());
        Set<String> perms = normalizePerms(req.getPermissions(), targetSuper);
        permissionService.assertCanAssign(actor, targetSuper, perms);

        SysAdmin admin = new SysAdmin();
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        admin.setNickname(StringUtils.hasText(req.getNickname()) ? req.getNickname().trim() : username);
        admin.setStatus(req.getStatus() == null ? 1 : (req.getStatus() == 1 ? 1 : 0));
        admin.setSuperAdmin(targetSuper);
        admin.setPermissions(targetSuper ? "" : AdminPermissionCodes.serialize(perms));
        admin.setCreatedAt(OffsetDateTime.now());
        adminMapper.insert(admin);
        return toVO(admin);
    }

    @Transactional
    public AdminAccountVO update(Long actorId, Long id, AdminAccountDtos.UpdateReq req) {
        SysAdmin actor = permissionService.requireActiveAdmin(actorId);
        SysAdmin target = adminMapper.selectById(id);
        if (target == null) {
            throw new BizException("管理员不存在");
        }
        if (permissionService.isSuper(target) && !permissionService.isSuper(actor)) {
            throw new BizException("无权修改超级管理员");
        }

        boolean targetSuper = req.getSuperAdmin() != null
                ? Boolean.TRUE.equals(req.getSuperAdmin())
                : Boolean.TRUE.equals(target.getSuperAdmin());
        Set<String> perms = req.getPermissions() != null
                ? normalizePerms(req.getPermissions(), targetSuper)
                : AdminPermissionCodes.parse(target.getPermissions());
        permissionService.assertCanAssign(actor, targetSuper, perms);

        if (Boolean.TRUE.equals(target.getSuperAdmin()) && !targetSuper) {
            assertNotLastSuper(id);
        }

        if (req.getNickname() != null) {
            String n = req.getNickname().trim();
            if (!StringUtils.hasText(n)) {
                throw new BizException("昵称不能为空");
            }
            target.setNickname(n);
        }
        if (req.getStatus() != null) {
            if (id.equals(actorId) && req.getStatus() != 1) {
                throw new BizException("不能禁用自己的账号");
            }
            if (Boolean.TRUE.equals(target.getSuperAdmin()) && req.getStatus() != 1) {
                assertNotLastSuper(id);
            }
            target.setStatus(req.getStatus() == 1 ? 1 : 0);
        }
        target.setSuperAdmin(targetSuper);
        target.setPermissions(targetSuper ? "" : AdminPermissionCodes.serialize(perms));
        adminMapper.updateById(target);
        return toVO(target);
    }

    @Transactional
    public void resetPassword(Long actorId, Long id, String password) {
        SysAdmin actor = permissionService.requireActiveAdmin(actorId);
        SysAdmin target = adminMapper.selectById(id);
        if (target == null) {
            throw new BizException("管理员不存在");
        }
        if (permissionService.isSuper(target) && !permissionService.isSuper(actor)) {
            throw new BizException("无权重置超级管理员密码");
        }
        target.setPasswordHash(passwordEncoder.encode(password));
        adminMapper.updateById(target);
    }

    @Transactional
    public void delete(Long actorId, Long id) {
        SysAdmin actor = permissionService.requireActiveAdmin(actorId);
        if (id.equals(actorId)) {
            throw new BizException("不能删除自己的账号");
        }
        SysAdmin target = adminMapper.selectById(id);
        if (target == null) {
            throw new BizException("管理员不存在");
        }
        if (permissionService.isSuper(target)) {
            if (!permissionService.isSuper(actor)) {
                throw new BizException("无权删除超级管理员");
            }
            assertNotLastSuper(id);
        }
        adminMapper.deleteById(id);
    }

    private void assertNotLastSuper(Long excludeId) {
        Long count = adminMapper.selectCount(new LambdaQueryWrapper<SysAdmin>()
                .eq(SysAdmin::getSuperAdmin, true)
                .eq(SysAdmin::getStatus, 1)
                .ne(excludeId != null, SysAdmin::getId, excludeId));
        if (count == null || count <= 0) {
            throw new BizException("至少保留一名可用的超级管理员");
        }
    }

    private Set<String> normalizePerms(List<String> raw, boolean superAdmin) {
        if (superAdmin) {
            return new HashSet<>(AdminPermissionCodes.all());
        }
        Set<String> set = new HashSet<>();
        if (raw != null) {
            for (String p : raw) {
                if (AdminPermissionCodes.isValid(p)) {
                    set.add(p);
                }
            }
        }
        if (set.isEmpty()) {
            throw new BizException("请至少选择一项权限");
        }
        return set;
    }

    private AdminAccountVO toVO(SysAdmin admin) {
        List<String> perms = permissionService.resolvePermissions(admin);
        return AdminAccountVO.builder()
                .id(admin.getId())
                .username(admin.getUsername())
                .nickname(admin.getNickname())
                .avatarUrl(admin.getAvatarUrl())
                .status(admin.getStatus())
                .superAdmin(Boolean.TRUE.equals(admin.getSuperAdmin()))
                .permissions(perms)
                .createdAt(admin.getCreatedAt())
                .build();
    }
}
