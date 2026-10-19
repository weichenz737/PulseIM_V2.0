package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.SysAdmin;
import com.pulse.api.entity.SysAdminLoginLog;
import com.pulse.api.entity.SysAdminOperationLog;
import com.pulse.api.mapper.SysAdminLoginLogMapper;
import com.pulse.api.mapper.SysAdminOperationLogMapper;
import com.pulse.api.support.AdminOperationDescribe;
import com.pulse.api.support.AdminPermissionCodes;
import com.pulse.api.vo.AdminLoginAuditVO;
import com.pulse.api.vo.AdminOperationLogVO;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminAuditService {
    private final SysAdminLoginLogMapper loginLogMapper;
    private final SysAdminOperationLogMapper operationLogMapper;

    public void recordLoginSuccess(SysAdmin admin) {
        if (admin == null) {
            return;
        }
        saveLogin(admin.getId(), admin.getUsername(), true, null);
    }

    public void recordLoginFailure(String username, String reason) {
        saveLogin(null, username, false, reason);
    }

    public void recordOperation(
            Long adminId,
            String username,
            String module,
            String action,
            String method,
            String path,
            String detail
    ) {
        try {
            HttpServletRequest request = currentRequest();
            SysAdminOperationLog row = new SysAdminOperationLog();
            row.setAdminId(adminId);
            row.setUsername(truncate(username, 64));
            row.setModule(truncate(module, 64));
            row.setAction(truncate(action, 64));
            row.setMethod(truncate(method, 16));
            row.setPath(truncate(path, 256));
            row.setDetail(truncate(detail, 2000));
            row.setIp(resolveClientIp(request));
            row.setCreatedAt(OffsetDateTime.now());
            operationLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("write admin operation log failed: {}", e.getMessage());
        }
    }

    public Map<String, Object> listLoginLogs(int page, int size, String keyword, Boolean success) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<SysAdminLoginLog> qw = new LambdaQueryWrapper<>();
        if (success != null) {
            qw.eq(SysAdminLoginLog::getSuccess, success);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(SysAdminLoginLog::getUsername, kw)
                    .or().like(SysAdminLoginLog::getIp, kw)
                    .or().like(SysAdminLoginLog::getFailReason, kw));
        }
        qw.orderByDesc(SysAdminLoginLog::getId);
        Page<SysAdminLoginLog> result = loginLogMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminLoginAuditVO> list = result.getRecords().stream().map(this::toLoginVO).collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public int deleteLoginLogs(List<Long> ids) {
        return deleteByIds(loginLogMapper, ids);
    }

    public int clearAllLoginLogs() {
        // 避免 MyBatis-Plus 全表删除拦截：加恒真条件
        return loginLogMapper.delete(new LambdaQueryWrapper<SysAdminLoginLog>()
                .gt(SysAdminLoginLog::getId, 0));
    }

    public Map<String, Object> listOperationLogs(int page, int size, String keyword, String module) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<SysAdminOperationLog> qw = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(module)) {
            qw.eq(SysAdminOperationLog::getModule, module.trim());
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(SysAdminOperationLog::getUsername, kw)
                    .or().like(SysAdminOperationLog::getAction, kw)
                    .or().like(SysAdminOperationLog::getPath, kw)
                    .or().like(SysAdminOperationLog::getDetail, kw)
                    .or().like(SysAdminOperationLog::getIp, kw));
        }
        qw.orderByDesc(SysAdminOperationLog::getId);
        Page<SysAdminOperationLog> result = operationLogMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminOperationLogVO> list = result.getRecords().stream().map(this::toOpVO).collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public int deleteOperationLogs(List<Long> ids) {
        return deleteByIds(operationLogMapper, ids);
    }

    public int clearAllOperationLogs() {
        return operationLogMapper.delete(new LambdaQueryWrapper<SysAdminOperationLog>()
                .gt(SysAdminOperationLog::getId, 0));
    }

    private void saveLogin(Long adminId, String username, boolean success, String failReason) {
        try {
            HttpServletRequest request = currentRequest();
            SysAdminLoginLog row = new SysAdminLoginLog();
            row.setAdminId(adminId);
            row.setUsername(truncate(username, 64));
            row.setSuccess(success);
            row.setFailReason(truncate(failReason, 128));
            row.setIp(resolveClientIp(request));
            row.setUserAgent(truncate(request == null ? null : request.getHeader("User-Agent"), 512));
            row.setCreatedAt(OffsetDateTime.now());
            loginLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("write admin login log failed: {}", e.getMessage());
        }
    }

    private AdminLoginAuditVO toLoginVO(SysAdminLoginLog row) {
        return AdminLoginAuditVO.builder()
                .id(row.getId())
                .adminId(row.getAdminId())
                .username(row.getUsername())
                .success(row.getSuccess())
                .failReason(row.getFailReason())
                .ip(row.getIp())
                .userAgent(row.getUserAgent())
                .createdAt(row.getCreatedAt())
                .build();
    }

    private AdminOperationLogVO toOpVO(SysAdminOperationLog row) {
        String moduleLabel = AdminPermissionCodes.labelOf(row.getModule());
        String summary = AdminOperationDescribe.summary(
                moduleLabel,
                row.getMethod(),
                row.getPath(),
                row.getDetail()
        );
        String action = row.getAction();
        // 旧日志动作多为「创建/提交」「更新」「删除」，统一换成可读动作
        if (!StringUtils.hasText(action)
                || "创建/提交".equals(action)
                || "更新".equals(action)
                || "删除".equals(action)
                || "GET".equalsIgnoreCase(action)
                || "POST".equalsIgnoreCase(action)
                || "PUT".equalsIgnoreCase(action)
                || "DELETE".equalsIgnoreCase(action)) {
            action = AdminOperationDescribe.action(row.getMethod(), row.getPath());
        }
        return AdminOperationLogVO.builder()
                .id(row.getId())
                .adminId(row.getAdminId())
                .username(row.getUsername())
                .module(row.getModule())
                .moduleLabel(moduleLabel)
                .action(action)
                .summary(summary)
                .method(row.getMethod())
                .path(row.getPath())
                .detail(row.getDetail())
                .ip(row.getIp())
                .createdAt(row.getCreatedAt())
                .build();
    }

    private <T> int deleteByIds(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper, List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (clean.isEmpty()) {
            return 0;
        }
        return mapper.deleteBatchIds(clean);
    }

    private HttpServletRequest currentRequest() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            return attrs == null ? null : attrs.getRequest();
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            String first = forwarded.split(",")[0].trim();
            if (StringUtils.hasText(first)) {
                return truncate(first, 64);
            }
        }
        String realIp = request.getHeader("X-Real-IP");
        if (StringUtils.hasText(realIp)) {
            return truncate(realIp.trim(), 64);
        }
        return truncate(request.getRemoteAddr(), 64);
    }

    private String truncate(String value, int max) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String v = value.trim();
        return v.length() <= max ? v : v.substring(0, max);
    }
}
