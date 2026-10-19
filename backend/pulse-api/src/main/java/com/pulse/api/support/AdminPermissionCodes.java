package com.pulse.api.support;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 管理端模块权限码（与侧栏菜单对应，供新建/编辑子管理员勾选）。
 */
public final class AdminPermissionCodes {
    public static final String USERS = "users";
    public static final String USER_FRIENDS = "user_friends";
    public static final String USER_DEFAULT_FRIEND = "user_default_friend";
    public static final String USER_BLOCKS = "user_blocks";
    public static final String USER_FAVORITES = "user_favorites";
    public static final String USER_FRIEND_DELETE_LOGS = "user_friend_delete_logs";
    public static final String USER_PHONE_CHANGE_LOGS = "user_phone_change_logs";
    public static final String USER_DELETION_LOGS = "user_deletion_logs";
    public static final String USER_BALANCE_RECORDS = "user_balance_records";
    public static final String USER_LOGIN_LOGS = "user_login_logs";
    public static final String GROUPS = "groups";
    public static final String GROUP_MEMBER_EVENTS = "group_member_events";
    public static final String GROUP_OWNER_TRANSFERS = "group_owner_transfers";
    public static final String GROUP_OPERATION_LOGS = "group_operation_logs";
    public static final String MESSAGES = "messages";
    public static final String CALL_LOGS = "call_logs";
    public static final String MOMENTS = "moments";
    public static final String COMMUNITIES = "communities";
    public static final String COMMUNITY_TOPICS = "community_topics";
    public static final String COMMUNITY_CONTENT = "community_content";
    public static final String COMMUNITY_REPORTS = "community_reports";
    public static final String ADMINS = "admins";
    public static final String SYSTEM_TEXTS = "system_texts";
    public static final String MAP_CONFIG = "map_config";
    public static final String FILE_CONFIG = "file_config";
    public static final String AMOUNT_CONFIG = "amount_config";
    public static final String CALL_RINGTONE = "call_ringtone";
    public static final String APP_VERSION = "app_version";
    public static final String SENSITIVE_WORDS = "sensitive_words";
    public static final String HELP_FAQS = "help_faqs";
    public static final String USER_FEEDBACK = "user_feedback";
    public static final String CLIENT_LOGIN_METHODS = "client_login_methods";
    public static final String CLIENT_REGISTER = "client_register";
    public static final String CLIENT_WALLET = "client_wallet";
    public static final String NICKNAME_CONFIG = "nickname_config";
    public static final String CONTAINER_CONFIG = "container_config";
    public static final String ADMIN_LOGIN_LOGS = "admin_login_logs";
    public static final String ADMIN_OPERATION_LOGS = "admin_operation_logs";

    /** 控制台权限；dashboard 为旧版总权限，细分权限用于新 Dashboard 模块。 */
    public static final String DASHBOARD = "dashboard";
    public static final String DASHBOARD_VIEW = "dashboard:view";
    public static final String DASHBOARD_USER = "dashboard:user";
    public static final String DASHBOARD_MESSAGE = "dashboard:message";
    public static final String DASHBOARD_FINANCE = "dashboard:finance";

    /** 旧版「用户管理」一把梭权限拆分后的子权限。 */
    public static final List<String> USER_MGMT_CHILDREN = List.of(
            USER_FRIENDS,
            USER_DEFAULT_FRIEND,
            USER_BLOCKS,
            USER_FAVORITES,
            USER_FRIEND_DELETE_LOGS,
            USER_PHONE_CHANGE_LOGS,
            USER_DELETION_LOGS,
            USER_BALANCE_RECORDS
    );

    /** 系统配置相关权限（可单独勾选分配给子管理员）。 */
    public static final List<String> SYSTEM_CONFIG_CHILDREN = List.of(
            SYSTEM_TEXTS,
            MAP_CONFIG,
            FILE_CONFIG,
            AMOUNT_CONFIG,
            CALL_RINGTONE,
            APP_VERSION,
            SENSITIVE_WORDS,
            HELP_FAQS,
            USER_FEEDBACK,
            CLIENT_LOGIN_METHODS,
            CLIENT_REGISTER,
            CLIENT_WALLET,
            NICKNAME_CONFIG,
            CONTAINER_CONFIG
    );

    private static final List<String> ALL = List.of(
            DASHBOARD,
            DASHBOARD_VIEW,
            DASHBOARD_USER,
            DASHBOARD_MESSAGE,
            DASHBOARD_FINANCE,
            USERS,
            USER_FRIENDS,
            USER_DEFAULT_FRIEND,
            USER_BLOCKS,
            USER_FAVORITES,
            USER_FRIEND_DELETE_LOGS,
            USER_PHONE_CHANGE_LOGS,
            USER_DELETION_LOGS,
            USER_BALANCE_RECORDS,
            USER_LOGIN_LOGS,
            GROUPS,
            GROUP_MEMBER_EVENTS,
            GROUP_OWNER_TRANSFERS,
            GROUP_OPERATION_LOGS,
            MESSAGES,
            CALL_LOGS,
            MOMENTS,
            COMMUNITIES,
            COMMUNITY_TOPICS,
            COMMUNITY_CONTENT,
            COMMUNITY_REPORTS,
            ADMINS,
            SYSTEM_TEXTS,
            MAP_CONFIG,
            FILE_CONFIG,
            AMOUNT_CONFIG,
            CALL_RINGTONE,
            APP_VERSION,
            SENSITIVE_WORDS,
            HELP_FAQS,
            USER_FEEDBACK,
            CLIENT_LOGIN_METHODS,
            CLIENT_REGISTER,
            CLIENT_WALLET,
            NICKNAME_CONFIG,
            CONTAINER_CONFIG,
            ADMIN_LOGIN_LOGS,
            ADMIN_OPERATION_LOGS
    );

    private static final Map<String, String> LABELS = new LinkedHashMap<>();
    private static final Map<String, String> MODULE_GROUPS = new LinkedHashMap<>();

    static {
        LABELS.put(USERS, "用户列表");
        LABELS.put(USER_FRIENDS, "用户好友");
        LABELS.put(USER_DEFAULT_FRIEND, "用户默认好友");
        LABELS.put(USER_BLOCKS, "用户黑名单");
        LABELS.put(USER_FAVORITES, "用户收藏");
        LABELS.put(USER_FRIEND_DELETE_LOGS, "删友记录");
        LABELS.put(USER_PHONE_CHANGE_LOGS, "手机号修改记录");
        LABELS.put(USER_DELETION_LOGS, "用户注销记录");
        LABELS.put(USER_BALANCE_RECORDS, "用户余额记录");
        LABELS.put(USER_LOGIN_LOGS, "用户登录日志");
        LABELS.put(GROUPS, "群聊列表");
        LABELS.put(GROUP_MEMBER_EVENTS, "群出入与解散记录");
        LABELS.put(GROUP_OWNER_TRANSFERS, "群主转让记录");
        LABELS.put(GROUP_OPERATION_LOGS, "群操作记录");
        LABELS.put(MESSAGES, "聊天/红包/转账记录");
        LABELS.put(CALL_LOGS, "通话记录");
        LABELS.put(MOMENTS, "动态管理");
        LABELS.put(COMMUNITIES, "圈子管理");
        LABELS.put(COMMUNITY_TOPICS, "圈子主题管理");
        LABELS.put(COMMUNITY_CONTENT, "圈子内容审核");
        LABELS.put(COMMUNITY_REPORTS, "圈子举报");
        LABELS.put(ADMINS, "管理员管理");
        LABELS.put(SYSTEM_TEXTS, "文本配置");
        LABELS.put(MAP_CONFIG, "地图配置");
        LABELS.put(FILE_CONFIG, "文件参数");
        LABELS.put(AMOUNT_CONFIG, "金额配置");
        LABELS.put(CALL_RINGTONE, "来电铃声");
        LABELS.put(APP_VERSION, "App 版本管理");
        LABELS.put(SENSITIVE_WORDS, "敏感词屏蔽");
        LABELS.put(HELP_FAQS, "相关问题");
        LABELS.put(USER_FEEDBACK, "用户反馈");
        LABELS.put(CLIENT_LOGIN_METHODS, "客户端登录方式");
        LABELS.put(CLIENT_REGISTER, "客户端注册开关");
        LABELS.put(CLIENT_WALLET, "客户端钱包开关");
        LABELS.put(NICKNAME_CONFIG, "昵称长度配置");
        LABELS.put(CONTAINER_CONFIG, "系统容器配置");
        LABELS.put(ADMIN_LOGIN_LOGS, "管理员登录日志");
        LABELS.put(ADMIN_OPERATION_LOGS, "管理员操作日志");
        LABELS.put(DASHBOARD, "控制台");
        LABELS.put(DASHBOARD_VIEW, "控制台概览与风控");
        LABELS.put(DASHBOARD_USER, "控制台用户分析");
        LABELS.put(DASHBOARD_MESSAGE, "控制台消息分析");
        LABELS.put(DASHBOARD_FINANCE, "控制台财务分析");

        MODULE_GROUPS.put(DASHBOARD, "数据控制台");
        MODULE_GROUPS.put(DASHBOARD_VIEW, "数据控制台");
        MODULE_GROUPS.put(DASHBOARD_USER, "数据控制台");
        MODULE_GROUPS.put(DASHBOARD_MESSAGE, "数据控制台");
        MODULE_GROUPS.put(DASHBOARD_FINANCE, "数据控制台");

        for (String code : List.of(
                USERS, USER_FRIENDS, USER_DEFAULT_FRIEND, USER_BLOCKS, USER_FAVORITES,
                USER_FRIEND_DELETE_LOGS, USER_PHONE_CHANGE_LOGS, USER_DELETION_LOGS,
                USER_BALANCE_RECORDS, USER_LOGIN_LOGS)) {
            MODULE_GROUPS.put(code, "用户管理");
        }
        MODULE_GROUPS.put(GROUPS, "群聊管理");
        MODULE_GROUPS.put(GROUP_MEMBER_EVENTS, "群聊管理");
        MODULE_GROUPS.put(GROUP_OWNER_TRANSFERS, "群聊管理");
        MODULE_GROUPS.put(GROUP_OPERATION_LOGS, "群聊管理");
        MODULE_GROUPS.put(MESSAGES, "聊天记录");
        MODULE_GROUPS.put(CALL_LOGS, "聊天记录");
        MODULE_GROUPS.put(MOMENTS, "动态管理");
        MODULE_GROUPS.put(COMMUNITIES, "圈子管理");
        MODULE_GROUPS.put(COMMUNITY_TOPICS, "圈子管理");
        MODULE_GROUPS.put(COMMUNITY_CONTENT, "圈子管理");
        MODULE_GROUPS.put(COMMUNITY_REPORTS, "圈子管理");
        MODULE_GROUPS.put(ADMINS, "管理员");
        MODULE_GROUPS.put(SYSTEM_TEXTS, "系统配置");
        MODULE_GROUPS.put(MAP_CONFIG, "系统配置");
        MODULE_GROUPS.put(FILE_CONFIG, "系统配置");
        MODULE_GROUPS.put(AMOUNT_CONFIG, "系统配置");
        MODULE_GROUPS.put(CALL_RINGTONE, "系统配置");
        MODULE_GROUPS.put(APP_VERSION, "系统配置");
        MODULE_GROUPS.put(SENSITIVE_WORDS, "系统配置");
        MODULE_GROUPS.put(HELP_FAQS, "系统配置");
        MODULE_GROUPS.put(USER_FEEDBACK, "系统配置");
        MODULE_GROUPS.put(CLIENT_LOGIN_METHODS, "系统配置");
        MODULE_GROUPS.put(CLIENT_REGISTER, "系统配置");
        MODULE_GROUPS.put(CLIENT_WALLET, "系统配置");
        MODULE_GROUPS.put(NICKNAME_CONFIG, "系统配置");
        MODULE_GROUPS.put(CONTAINER_CONFIG, "系统配置");
        MODULE_GROUPS.put(ADMIN_LOGIN_LOGS, "日志管理");
        MODULE_GROUPS.put(ADMIN_OPERATION_LOGS, "日志管理");
    }

    private AdminPermissionCodes() {
    }

    public static List<String> all() {
        return ALL;
    }

    public static List<Map<String, String>> catalog() {
        List<Map<String, String>> list = new ArrayList<>();
        for (String code : ALL) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("code", code);
            item.put("label", LABELS.getOrDefault(code, code));
            item.put("group", MODULE_GROUPS.getOrDefault(code, "其他"));
            list.add(item);
        }
        return list;
    }

    public static String labelOf(String code) {
        if (code == null) {
            return "";
        }
        return LABELS.getOrDefault(code, code);
    }

    public static Set<String> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return new LinkedHashSet<>();
        }
        return Arrays.stream(raw.split("[,;\\s]+"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .filter(ALL::contains)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public static String serialize(Iterable<String> codes) {
        if (codes == null) {
            return "";
        }
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String c : codes) {
            if (c != null && ALL.contains(c.trim())) {
                set.add(c.trim());
            }
        }
        return String.join(",", set);
    }

    public static boolean isValid(String code) {
        return code != null && ALL.contains(code);
    }
}
