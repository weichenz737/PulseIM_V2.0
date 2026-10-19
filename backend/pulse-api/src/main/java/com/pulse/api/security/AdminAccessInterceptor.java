package com.pulse.api.security;

import com.pulse.api.entity.SysAdmin;
import com.pulse.api.config.JwtProperties;
import com.pulse.api.service.AdminAuditService;
import com.pulse.api.service.AdminPermissionService;
import com.pulse.api.support.AdminOperationDescribe;
import com.pulse.api.support.AdminPermissionCodes;
import org.springframework.http.HttpHeaders;
import com.pulse.common.exception.BizException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 校验子管理员模块权限，并记录写操作日志。
 */
@Component
@RequiredArgsConstructor
public class AdminAccessInterceptor implements HandlerInterceptor {
    private final AdminPermissionService permissionService;
    private final AdminAuditService auditService;
    private final JwtProperties jwtProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String path = normalizePath(request.getRequestURI());
        if (!path.startsWith("/api/admin/")) {
            return true;
        }
        if (path.startsWith("/api/admin/auth/")) {
            return true;
        }

        Long adminId = AuthContext.currentUserId();
        try {
            SysAdmin admin = permissionService.requireActiveAdmin(adminId);
            refreshAdminAttachmentCookie(request, response);
            // 控制台路由先通过基础拦截；Dashboard 具体数据接口会在 Controller 内校验细分权限。
            if (path.startsWith("/api/admin/dashboard")
                    || path.equals("/api/admin/profile")
                    || path.startsWith("/api/admin/profile/")
                    || path.startsWith("/api/admin/files/")) {
                return true;
            }

            String permission = resolvePermission(path);
            if (permission == null) {
                // 超级管理员拥有全部后台模块权限。新增加的后台接口在补充模块映射前，
                // 也不能把超级管理员拦在“无权限访问”上；普通管理员仍保持默认拒绝。
                if (permissionService.isSuper(admin)) {
                    return true;
                }
                // 未映射权限的路径默认拒绝，避免新增接口后出现“登录即有权”
                SecurityResponseWriter.write(response, 403, "无权限访问");
                return false;
            }
            if (!permissionService.hasPermission(admin, permission)) {
                SecurityResponseWriter.write(
                        response,
                        403,
                        "无权限访问：" + AdminPermissionCodes.labelOf(permission)
                );
                return false;
            }
            String method = request.getMethod();
            if (isWriteMethod(method)) {
                request.setAttribute("_admin_audit_module", permission);
                request.setAttribute("_admin_audit_admin", admin);
            }
            return true;
        } catch (BizException e) {
            try {
                SecurityResponseWriter.write(response, e.getCode() > 0 ? e.getCode() : 403, e.getMessage());
            } catch (Exception ignored) {
                // ignore
            }
            return false;
        } catch (Exception e) {
            try {
                SecurityResponseWriter.write(response, 500, "权限校验失败");
            } catch (Exception ignored) {
                // ignore
            }
            return false;
        }
    }

    /**
     * 管理端 token 保存在 localStorage，媒体标签无法附带 Authorization。
     * 每次普通后台请求都刷新受限的附件 Cookie，兼容已登录的旧会话。
     */
    private void refreshAdminAttachmentCookie(HttpServletRequest request, HttpServletResponse response) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) {
            return;
        }
        AuthCookieUtil.issue(
                request,
                response,
                authorization.substring("Bearer ".length()).trim(),
                jwtProperties.getExpireMs() / 1000
        );
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex
    ) {
        Object moduleAttr = request.getAttribute("_admin_audit_module");
        Object adminAttr = request.getAttribute("_admin_audit_admin");
        if (!(moduleAttr instanceof String module) || !(adminAttr instanceof SysAdmin admin)) {
            return;
        }
        if (ex != null || response.getStatus() >= 400) {
            return;
        }
        String method = request.getMethod();
        String path = normalizePath(request.getRequestURI());
        String action = AdminOperationDescribe.action(method, path);
        String moduleLabel = AdminPermissionCodes.labelOf(module);
        String hint = null;
        Object hintAttr = request.getAttribute("_admin_audit_hint");
        if (hintAttr != null && StringUtils.hasText(String.valueOf(hintAttr))) {
            hint = String.valueOf(hintAttr).trim();
        }
        String qs = request.getQueryString();
        String detailSeed = path;
        if (StringUtils.hasText(qs)) {
            detailSeed = path + "?" + qs;
        }
        if (StringUtils.hasText(hint)) {
            detailSeed = detailSeed + " | " + hint;
        }
        String detail = AdminOperationDescribe.summary(moduleLabel, method, path, detailSeed);
        if (StringUtils.hasText(hint) && !detail.contains(hint)) {
            detail = detail + " · " + hint;
        }
        auditService.recordOperation(
                admin.getId(),
                admin.getUsername(),
                module,
                action,
                method,
                path,
                detail
        );
    }

    private static boolean isWriteMethod(String method) {
        return "POST".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method)
                || "DELETE".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method);
    }

    private static String normalizePath(String uri) {
        if (uri == null) {
            return "";
        }
        String path = uri;
        int q = path.indexOf('?');
        if (q >= 0) {
            path = path.substring(0, q);
        }
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }

    static String resolvePermission(String path) {
        // 用户管理：按菜单拆分（更具体的路径优先）
        if (path.startsWith("/api/admin/users/default-friend")) {
            return AdminPermissionCodes.USER_DEFAULT_FRIEND;
        }
        if (path.startsWith("/api/admin/user-friends")) {
            return AdminPermissionCodes.USER_FRIENDS;
        }
        if (path.startsWith("/api/admin/user-blocks")) {
            return AdminPermissionCodes.USER_BLOCKS;
        }
        if (path.startsWith("/api/admin/user-favorites")) {
            return AdminPermissionCodes.USER_FAVORITES;
        }
        if (path.startsWith("/api/admin/user-friend-delete-logs")) {
            return AdminPermissionCodes.USER_FRIEND_DELETE_LOGS;
        }
        if (path.startsWith("/api/admin/user-phone-change-logs")) {
            return AdminPermissionCodes.USER_PHONE_CHANGE_LOGS;
        }
        if (path.startsWith("/api/admin/user-deletion-logs")) {
            return AdminPermissionCodes.USER_DELETION_LOGS;
        }
        if (path.startsWith("/api/admin/wallet/transactions")) {
            return AdminPermissionCodes.USER_BALANCE_RECORDS;
        }
        if (path.startsWith("/api/admin/users")) {
            return AdminPermissionCodes.USERS;
        }
        if (path.startsWith("/api/admin/login-logs")) {
            return AdminPermissionCodes.USER_LOGIN_LOGS;
        }
        if (path.startsWith("/api/admin/groups")) {
            return AdminPermissionCodes.GROUPS;
        }
        if (path.startsWith("/api/admin/group-member-events")) {
            return AdminPermissionCodes.GROUP_MEMBER_EVENTS;
        }
        if (path.startsWith("/api/admin/group-owner-transfers")) {
            return AdminPermissionCodes.GROUP_OWNER_TRANSFERS;
        }
        if (path.startsWith("/api/admin/group-operation-logs")) {
            return AdminPermissionCodes.GROUP_OPERATION_LOGS;
        }
        if (path.startsWith("/api/admin/messages")) {
            return AdminPermissionCodes.MESSAGES;
        }
        if (path.startsWith("/api/admin/wallet")) {
            return AdminPermissionCodes.MESSAGES;
        }
        if (path.startsWith("/api/admin/call-logs")) {
            return AdminPermissionCodes.CALL_LOGS;
        }
        if (path.startsWith("/api/admin/moments")) {
            return AdminPermissionCodes.MOMENTS;
        }
        // 圈子管理：真实接口共用 /communities 前缀，子模块必须先于父模块匹配。
        if (matchesPath(path, "/api/admin/communities/content")
                || matchesPath(path, "/api/admin/community-content")) {
            return AdminPermissionCodes.COMMUNITY_CONTENT;
        }
        if (matchesPath(path, "/api/admin/communities/reports")
                || matchesPath(path, "/api/admin/communities/report-reasons")
                || matchesPath(path, "/api/admin/community-reports")) {
            return AdminPermissionCodes.COMMUNITY_REPORTS;
        }
        if (matchesPath(path, "/api/admin/communities/member-removal-reasons")) {
            return AdminPermissionCodes.COMMUNITIES;
        }
        if (matchesPath(path, "/api/admin/communities/topics")) {
            return AdminPermissionCodes.COMMUNITY_TOPICS;
        }
        if (isCommunityCorePath(path)) {
            return AdminPermissionCodes.COMMUNITIES;
        }
        if (path.startsWith("/api/admin/admins") || path.startsWith("/api/admin/permissions")) {
            return AdminPermissionCodes.ADMINS;
        }
        if (path.startsWith("/api/admin/admin-login-logs")) {
            return AdminPermissionCodes.ADMIN_LOGIN_LOGS;
        }
        if (path.startsWith("/api/admin/admin-operation-logs")) {
            return AdminPermissionCodes.ADMIN_OPERATION_LOGS;
        }
        if (path.startsWith("/api/admin/system-texts")) {
            return AdminPermissionCodes.SYSTEM_TEXTS;
        }
        if (path.startsWith("/api/admin/app-version")) {
            return AdminPermissionCodes.APP_VERSION;
        }
        if (path.startsWith("/api/admin/map-config")) {
            return AdminPermissionCodes.MAP_CONFIG;
        }
        if (path.startsWith("/api/admin/file-config")) {
            return AdminPermissionCodes.FILE_CONFIG;
        }
        if (path.startsWith("/api/admin/amount-config")) {
            return AdminPermissionCodes.AMOUNT_CONFIG;
        }
        if (path.startsWith("/api/admin/call-ringtone")) {
            return AdminPermissionCodes.CALL_RINGTONE;
        }
        if (path.startsWith("/api/admin/sensitive-words")) {
            return AdminPermissionCodes.SENSITIVE_WORDS;
        }
        if (path.startsWith("/api/admin/help-faqs")) {
            return AdminPermissionCodes.HELP_FAQS;
        }
        if (path.startsWith("/api/admin/user-feedback")) {
            return AdminPermissionCodes.USER_FEEDBACK;
        }
        if (path.startsWith("/api/admin/client-login-methods")) {
            return AdminPermissionCodes.CLIENT_LOGIN_METHODS;
        }
        if (path.startsWith("/api/admin/client-register")) {
            return AdminPermissionCodes.CLIENT_REGISTER;
        }
        if (path.startsWith("/api/admin/client-wallet")) {
            return AdminPermissionCodes.CLIENT_WALLET;
        }
        if (path.startsWith("/api/admin/nickname-config")) {
            return AdminPermissionCodes.NICKNAME_CONFIG;
        }
        if (path.startsWith("/api/admin/container-config")) {
            return AdminPermissionCodes.CONTAINER_CONFIG;
        }
        return null;
    }

    private static boolean matchesPath(String path, String basePath) {
        return path.equals(basePath) || path.startsWith(basePath + "/");
    }

    /**
     * The parent permission covers only the community list/review, revenue config and stats pages.
     * Keeping this list explicit prevents future community submodules from silently inheriting it.
     */
    private static boolean isCommunityCorePath(String path) {
        if (matchesPath(path, "/api/admin/circle/dashboard")) {
            return true;
        }
        if (path.equals("/api/admin/communities")
                || path.equals("/api/admin/communities/config")
                || path.equals("/api/admin/communities/stats")
                || path.equals("/api/admin/communities/orders")
                || path.equals("/api/admin/communities/incomes")
                || path.equals("/api/admin/communities/audit-logs")
                || matchesPath(path, "/api/admin/communities/profile-reviews")) {
            return true;
        }
        return path.matches("/api/admin/communities/\\d+")
                || path.matches("/api/admin/communities/\\d+/status")
                || path.matches("/api/admin/communities/\\d+/owner");
    }
}
