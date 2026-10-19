package com.pulse.api.support;

import org.springframework.util.StringUtils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 将管理员写操作的 HTTP 路径转成可读中文说明。
 */
public final class AdminOperationDescribe {
    private static final Pattern ID = Pattern.compile("/(\\d+)(?:/|$)");

    private AdminOperationDescribe() {
    }

    /** 短动作名，如「新建用户」「解散群聊」 */
    public static String action(String method, String path) {
        String p = normalize(path);
        String m = method == null ? "" : method.trim().toUpperCase();

        if (p.startsWith("/api/admin/users")) {
            if (p.endsWith("/batch-delete") && isPost(m)) return "批量删除用户";
            if (match(p, "/api/admin/users/\\d+/status") && isPut(m)) return "变更用户状态";
            if (match(p, "/api/admin/users/\\d+/password") && isPut(m)) return "重置用户密码";
            if (match(p, "/api/admin/users/\\d+$") && isDelete(m)) return "删除用户";
            if (match(p, "/api/admin/users/\\d+$") && isPut(m)) return "编辑用户";
            if (p.equals("/api/admin/users") && isPost(m)) return "新建用户";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/groups")) {
            if (p.endsWith("/batch-delete") && isPost(m)) return "批量解散群聊";
            if (p.equals("/api/admin/groups") && isPost(m)) return "新建群聊";
            if (match(p, "/api/admin/groups/\\d+/owner") && isPut(m)) return "转让群主";
            if (match(p, "/api/admin/groups/\\d+$") && isDelete(m)) return "解散群聊";
            return fallbackAction(m);
        }
        if (p.equals("/api/admin/user-friends") && isPost(m)) return "新建好友关系";
        if (p.startsWith("/api/admin/messages")) {
            if (p.endsWith("/clear-all") && isPost(m)) return "清空聊天记录";
            if (p.endsWith("/batch-delete") && isPost(m)) return "批量删除消息";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/moments")) {
            if (p.endsWith("/batch-delete") && isPost(m)) return "批量删除动态";
            if (match(p, "/api/admin/moments/\\d+$") && isDelete(m)) return "删除动态";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/admins")) {
            if (match(p, "/api/admin/admins/\\d+/password") && isPut(m)) return "重置管理员密码";
            if (match(p, "/api/admin/admins/\\d+$") && isDelete(m)) return "删除管理员";
            if (match(p, "/api/admin/admins/\\d+$") && isPut(m)) return "编辑管理员";
            if (p.equals("/api/admin/admins") && isPost(m)) return "创建管理员";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/call-logs") && p.endsWith("/batch-delete")) return "删除通话记录";
        if (p.startsWith("/api/admin/login-logs") && p.endsWith("/clear-all")) return "清空用户登录日志";
        if (p.startsWith("/api/admin/login-logs") && p.endsWith("/batch-delete")) return "删除用户登录日志";
        if (p.startsWith("/api/admin/admin-login-logs") && p.endsWith("/clear-all")) return "清空管理员登录日志";
        if (p.startsWith("/api/admin/admin-login-logs") && p.endsWith("/batch-delete")) return "删除管理员登录日志";
        if (p.startsWith("/api/admin/admin-operation-logs") && p.endsWith("/clear-all")) return "清空管理员操作日志";
        if (p.startsWith("/api/admin/admin-operation-logs") && p.endsWith("/batch-delete")) return "删除操作日志";
        if (p.startsWith("/api/admin/group-member-events") && p.endsWith("/batch-delete")) return "删除群出入记录";
        if (p.startsWith("/api/admin/group-owner-transfers") && p.endsWith("/batch-delete")) return "删除群主转让记录";
        if (p.startsWith("/api/admin/group-operation-logs") && p.endsWith("/batch-delete")) return "删除群操作记录";
        if (p.startsWith("/api/admin/profile") && isPut(m)) {
            if (p.endsWith("/password")) return "修改本人密码";
            return "更新本人资料";
        }
        if (p.startsWith("/api/admin/sensitive-words")) {
            if (p.endsWith("/batch") && isPost(m)) return "批量导入敏感词";
            if (p.equals("/api/admin/sensitive-words") && isPost(m)) return "新增敏感词";
            if (match(p, "/api/admin/sensitive-words/\\d+$") && isPut(m)) return "编辑敏感词";
            if (match(p, "/api/admin/sensitive-words/\\d+$") && isDelete(m)) return "删除敏感词";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/system-texts") && isPut(m)) return "更新文本配置";
        if (p.startsWith("/api/admin/map-config") && isPut(m)) return "更新地图配置";
        if (p.startsWith("/api/admin/amount-config") && isPut(m)) return "更新金额配置";
        if (p.startsWith("/api/admin/client-wallet") && isPut(m)) return "更新客户端钱包开关";
        if (p.startsWith("/api/admin/app-version") && isPut(m)) return "更新 App 版本";
        if (p.startsWith("/api/admin/container-config")) {
            if (p.endsWith("/ssh/test") && isPost(m)) return "测试容器 SSH";
            if (p.endsWith("/ssh/preflight") && isPost(m)) return "预检目标服务器";
            if (p.endsWith("/migration/preview") && isPost(m)) return "预览旧数据迁移";
            if (p.endsWith("/migration/start") && isPost(m)) return "执行旧数据迁移";
            if (p.endsWith("/cleanup-old/preview") && isPost(m)) return "预览旧项目清理";
            if (p.endsWith("/cleanup-old") && isPost(m)) return "清理旧服务器 PulseIM";
            if (p.endsWith("/prepare") && isPost(m)) return "准备服务器迁移";
            if (isPut(m)) return "保存服务器配置";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/call-ringtone")) {
            if (p.equals("/api/admin/call-ringtones") && isPost(m)) return "新增来电铃声";
            if (match(p, "/api/admin/call-ringtones/\\d+$") && isPut(m)) return "编辑来电铃声";
            if (match(p, "/api/admin/call-ringtones/\\d+$") && isDelete(m)) return "删除来电铃声";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/help-faqs")) {
            if (p.equals("/api/admin/help-faqs") && isPost(m)) return "新增相关问题";
            if (match(p, "/api/admin/help-faqs/\\d+$") && isPut(m)) return "编辑相关问题";
            if (match(p, "/api/admin/help-faqs/\\d+$") && isDelete(m)) return "删除相关问题";
            return fallbackAction(m);
        }
        if (p.startsWith("/api/admin/user-feedback") && isPut(m)) return "处理用户反馈";
        return fallbackAction(m);
    }

    /**
     * 完整可读说明，例如：「在「用户列表」重置用户密码（用户 ID 12）」
     */
    public static String summary(String moduleLabel, String method, String path, String detail) {
        String act = action(method, path);
        String p = normalize(path);
        String module = StringUtils.hasText(moduleLabel) ? moduleLabel : "管理后台";
        String target = targetHint(p, detail);
        StringBuilder sb = new StringBuilder();
        sb.append("在「").append(module).append("」").append(act);
        if (StringUtils.hasText(target)) {
            sb.append("（").append(target).append("）");
        }
        String extra = extraFromDetail(p, detail);
        if (StringUtils.hasText(extra)) {
            sb.append(" · ").append(extra);
        }
        return sb.toString();
    }

    private static String targetHint(String path, String detail) {
        if (path.contains("/batch-delete") || path.endsWith("/clear-all")) {
            return null;
        }
        String id = firstId(path);
        if (!StringUtils.hasText(id)) {
            return null;
        }
        if (path.startsWith("/api/admin/users")) return "用户 ID " + id;
        if (path.startsWith("/api/admin/groups")) return "群聊 ID " + id;
        if (path.startsWith("/api/admin/moments")) return "动态 ID " + id;
        if (path.startsWith("/api/admin/admins")) return "管理员 ID " + id;
        if (path.startsWith("/api/admin/messages")) return "相关 ID " + id;
        if (path.startsWith("/api/admin/sensitive-words")) return "敏感词 ID " + id;
        if (path.startsWith("/api/admin/help-faqs")) return "问题 ID " + id;
        if (path.startsWith("/api/admin/call-ringtone")) return "铃声 ID " + id;
        if (path.startsWith("/api/admin/user-feedback")) return "反馈 ID " + id;
        return "ID " + id;
    }

    private static String extraFromDetail(String path, String detail) {
        if (!StringUtils.hasText(detail)) {
            return null;
        }
        String d = detail;
        // clear-all? 或 body 未记录时，尝试从 detail 里的 conversationType 识别
        if (path.endsWith("/clear-all")) {
            if (d.contains("conversationType=2") || d.contains("\"conversationType\":2")
                    || d.contains("conversationType\": 2")) {
                return "范围：全部群聊记录";
            }
            if (d.contains("conversationType=1") || d.contains("\"conversationType\":1")
                    || d.contains("conversationType\": 1")) {
                return "范围：全部私聊记录";
            }
            return "清空所选类型的全部消息";
        }
        return null;
    }

    private static String firstId(String path) {
        Matcher matcher = ID.matcher(path);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static String normalize(String path) {
        if (!StringUtils.hasText(path)) {
            return "";
        }
        String p = path.trim();
        int q = p.indexOf('?');
        if (q >= 0) {
            p = p.substring(0, q);
        }
        if (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p;
    }

    private static boolean match(String path, String regex) {
        return path.matches(regex);
    }

    private static boolean isPost(String m) {
        return "POST".equals(m);
    }

    private static boolean isPut(String m) {
        return "PUT".equals(m) || "PATCH".equals(m);
    }

    private static boolean isDelete(String m) {
        return "DELETE".equals(m);
    }

    private static String fallbackAction(String method) {
        if ("GET".equals(method)) return "查看操作";
        if (isPost(method)) return "提交操作";
        if (isPut(method)) return "更新操作";
        if (isDelete(method)) return "删除操作";
        return StringUtils.hasText(method) ? "其他操作" : "操作";
    }
}
