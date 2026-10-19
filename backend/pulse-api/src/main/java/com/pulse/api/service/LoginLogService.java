package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.SysUser;
import com.pulse.api.entity.SysUserLoginLog;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.mapper.SysUserLoginLogMapper;
import com.pulse.api.util.UserAgentSummarizer;
import com.pulse.api.vo.AdminLoginLogVO;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoginLogService {
    private final SysUserLoginLogMapper loginLogMapper;
    private final SysUserMapper userMapper;

    public void recordSuccess(SysUser user, String loginType) {
        recordSuccess(user, loginType, null, null);
    }

    public void recordSuccess(SysUser user, String loginType, Boolean securityCodeChecked, Boolean newDevice) {
        if (user == null) {
            return;
        }
        save(user.getId(), user.getPhone(), user.getNickname(), user.getPulseId(),
                loginType, true, null, securityCodeChecked, newDevice);
    }

    public void recordFailure(String phone, String loginType, String failReason) {
        recordFailure(phone, loginType, failReason, null, null);
    }

    public void recordFailure(
            String phone,
            String loginType,
            String failReason,
            Boolean securityCodeChecked,
            Boolean newDevice
    ) {
        save(null, phone, null, null, loginType, false, failReason, securityCodeChecked, newDevice);
    }

    public void recordOnline(Long userId) {
        if (userId == null || userId <= 0) {
            return;
        }
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            return;
        }
        save(user.getId(), user.getPhone(), user.getNickname(), user.getPulseId(),
                "online", true, null, null, null);
    }

    public int deleteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream()
                .filter(id -> id != null && id > 0)
                .distinct()
                .toList();
        if (clean.isEmpty()) {
            return 0;
        }
        return loginLogMapper.deleteBatchIds(clean);
    }

    public int clearAll() {
        // Avoid MyBatis-Plus blocking a delete without a WHERE clause.
        return loginLogMapper.delete(new LambdaQueryWrapper<SysUserLoginLog>()
                .gt(SysUserLoginLog::getId, 0));
    }

    public Map<String, Object> listLogs(
            int page,
            int size,
            String keyword,
            String loginType,
            Boolean success,
            Long userId,
            String from,
            String to
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        LambdaQueryWrapper<SysUserLoginLog> qw = new LambdaQueryWrapper<>();
        if (userId != null && userId > 0) {
            qw.eq(SysUserLoginLog::getUserId, userId);
        }
        if (StringUtils.hasText(loginType)) {
            qw.eq(SysUserLoginLog::getLoginType, loginType.trim());
        }
        if (success != null) {
            qw.eq(SysUserLoginLog::getSuccess, success);
        }
        OffsetDateTime fromAt = parseDayStart(from);
        OffsetDateTime toExclusive = parseDayEndExclusive(to);
        if (fromAt != null) {
            qw.ge(SysUserLoginLog::getCreatedAt, fromAt);
        }
        if (toExclusive != null) {
            qw.lt(SysUserLoginLog::getCreatedAt, toExclusive);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(SysUserLoginLog::getPhone, kw)
                    .or().like(SysUserLoginLog::getNickname, kw)
                    .or().like(SysUserLoginLog::getPulseId, kw)
                    .or().like(SysUserLoginLog::getIp, kw)
                    .or().like(SysUserLoginLog::getDeviceSummary, kw)
                    .or().like(SysUserLoginLog::getUserAgent, kw));
        }
        qw.orderByDesc(SysUserLoginLog::getId);

        Page<SysUserLoginLog> result = loginLogMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminLoginLogVO> list = result.getRecords().stream()
                .map(this::toVO)
                .collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    private void save(
            Long userId,
            String phone,
            String nickname,
            String pulseId,
            String loginType,
            boolean success,
            String failReason,
            Boolean securityCodeChecked,
            Boolean newDevice
    ) {
        try {
            HttpServletRequest request = currentRequest();
            String ua = request == null ? null : request.getHeader("User-Agent");
            SysUserLoginLog row = new SysUserLoginLog();
            row.setUserId(userId);
            row.setPhone(phone);
            row.setNickname(nickname);
            row.setPulseId(pulseId);
            row.setLoginType(loginType);
            row.setSuccess(success);
            row.setFailReason(normalizeFailReason(failReason));
            row.setIp(resolveClientIp(request));
            row.setUserAgent(truncate(ua, 512));
            row.setDeviceSummary(truncate(UserAgentSummarizer.summarize(ua), 128));
            row.setSecurityCodeChecked(securityCodeChecked);
            row.setNewDevice(newDevice);
            row.setCreatedAt(OffsetDateTime.now());
            loginLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("write login log failed: {}", e.getMessage());
        }
    }

    private AdminLoginLogVO toVO(SysUserLoginLog row) {
        String summary = row.getDeviceSummary();
        if (!StringUtils.hasText(summary)) {
            summary = UserAgentSummarizer.summarize(row.getUserAgent());
        }
        return AdminLoginLogVO.builder()
                .id(row.getId())
                .userId(row.getUserId())
                .phone(row.getPhone())
                .nickname(row.getNickname())
                .pulseId(row.getPulseId())
                .loginType(row.getLoginType())
                .success(row.getSuccess())
                .failReason(prettyFailReason(row.getFailReason()))
                .ip(row.getIp())
                .userAgent(row.getUserAgent())
                .deviceSummary(summary)
                .securityCodeChecked(row.getSecurityCodeChecked())
                .newDevice(row.getNewDevice())
                .createdAt(row.getCreatedAt())
                .build();
    }

    private String normalizeFailReason(String failReason) {
        if (!StringUtils.hasText(failReason)) {
            return null;
        }
        if ("SECURITY_CODE_REQUIRED".equalsIgnoreCase(failReason.trim())) {
            return "需验证安全码（新设备）";
        }
        return truncate(failReason, 128);
    }

    private String prettyFailReason(String failReason) {
        if (!StringUtils.hasText(failReason)) {
            return null;
        }
        if ("SECURITY_CODE_REQUIRED".equalsIgnoreCase(failReason.trim())) {
            return "需验证安全码（新设备）";
        }
        return failReason;
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

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private OffsetDateTime parseDayStart(String day) {
        if (!StringUtils.hasText(day)) {
            return null;
        }
        try {
            return LocalDate.parse(day.trim()).atStartOfDay(ZONE).toOffsetDateTime();
        } catch (Exception e) {
            return null;
        }
    }

    /** 结束日的次日 00:00，用于 lt 半开区间 */
    private OffsetDateTime parseDayEndExclusive(String day) {
        OffsetDateTime start = parseDayStart(day);
        return start == null ? null : start.plusDays(1);
    }
}
