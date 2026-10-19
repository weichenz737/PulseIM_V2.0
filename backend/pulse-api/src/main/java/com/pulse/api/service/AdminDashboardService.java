package com.pulse.api.service;

import com.pulse.common.constant.RedisKeys;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 管理端运营 Dashboard 数据聚合服务。
 *
 * <p>统计查询全部使用日期范围参数；历史在线没有独立快照表时，在线趋势使用登录日志
 * 作为历史近似值，当前在线人数仍以 Redis presence 为准。</p>
 */
@Service
@RequiredArgsConstructor
public class AdminDashboardService {
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redis;

    public Map<String, Object> overview(LocalDate start, LocalDate end) {
        Timestamp from = timestamp(start);
        Timestamp to = timestamp(end.plusDays(1));
        long userCount = count("SELECT COUNT(*) FROM sys_user");
        long onlineCount = onlineCount();
        long active = activeUserCount(from, to);
        long register = count("SELECT COUNT(*) FROM sys_user WHERE created_at >= ? AND created_at < ?", from, to);
        long groupCount = count("SELECT COUNT(*) FROM im_conversation WHERE type = 2");
        long momentCount = count("SELECT COUNT(*) FROM moment_post WHERE created_at >= ? AND created_at < ? AND COALESCE(removed,FALSE)=FALSE", from, to);
        long messageCount = count("SELECT COUNT(*) FROM im_message WHERE send_time >= ? AND send_time < ?", from, to);
        long blockedCount = count("SELECT COUNT(*) FROM sys_user WHERE status = 0");

        long days = Math.max(1, end.toEpochDay() - start.toEpochDay() + 1);
        Timestamp previousFrom = timestamp(start.minusDays(days));
        Timestamp previousTo = from;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userCount", userCount);
        result.put("onlineCount", onlineCount);
        result.put("todayActive", active);
        result.put("todayRegister", register);
        result.put("groupCount", groupCount);
        result.put("momentCount", momentCount);
        result.put("messageCount", messageCount);
        result.put("blockedCount", blockedCount);
        result.put("registerChange", percentChange(register, count("SELECT COUNT(*) FROM sys_user WHERE created_at >= ? AND created_at < ?", previousFrom, previousTo)));
        result.put("activeChange", percentChange(active, activeUserCount(previousFrom, previousTo)));
        result.put("messageChange", percentChange(messageCount, count("SELECT COUNT(*) FROM im_message WHERE send_time >= ? AND send_time < ?", previousFrom, previousTo)));
        return result;
    }

    public List<Map<String, Object>> userTrend(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                SELECT TO_CHAR(d, 'YYYY-MM-DD') AS date,
                       (SELECT COUNT(*) FROM sys_user u WHERE u.created_at >= d AND u.created_at < d + INTERVAL '1 day') AS register,
                       (SELECT COUNT(*) FROM sys_user u WHERE u.created_at < d + INTERVAL '1 day') AS total,
                       (SELECT COUNT(*) FROM (
                           SELECT DISTINCT l.user_id FROM sys_user_login_log l
                           WHERE l.success = TRUE AND l.user_id IS NOT NULL AND l.created_at >= d AND l.created_at < d + INTERVAL '1 day'
                           UNION SELECT DISTINCT m.from_user_id FROM im_message m
                           WHERE m.from_user_id IS NOT NULL AND m.send_time >= d AND m.send_time < d + INTERVAL '1 day'
                           UNION SELECT u.id FROM sys_user u
                           WHERE u.last_online_at >= d AND u.last_online_at < d + INTERVAL '1 day'
                       ) active_users) AS active
                FROM generate_series(?::date, ?::date, INTERVAL '1 day') d
                ORDER BY d
                """, date(start), date(end));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", text(row.get("date")));
            item.put("register", number(row.get("register")));
            item.put("active", number(row.get("active")));
            item.put("total", number(row.get("total")));
            result.add(item);
        }
        return result;
    }

    public List<Map<String, Object>> onlineTrend(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                SELECT TO_CHAR(bucket, 'YYYY-MM-DD HH24:00') AS time,
                       (SELECT COUNT(DISTINCT l.user_id) FROM sys_user_login_log l
                        WHERE l.success = TRUE AND l.user_id IS NOT NULL
                          AND l.created_at >= bucket AND l.created_at < bucket + INTERVAL '1 hour') AS current,
                       (SELECT COUNT(DISTINCT l.user_id) FROM sys_user_login_log l
                        WHERE l.success = TRUE AND l.user_id IS NOT NULL
                          AND l.created_at >= bucket AND l.created_at < bucket + INTERVAL '1 hour') AS peak
                FROM generate_series(?::timestamp, (?::date + 1)::timestamp - INTERVAL '1 hour', INTERVAL '1 hour') bucket
                ORDER BY bucket
                """, timestamp(start), date(end));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            long current = number(row.get("current"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", text(row.get("time")));
            item.put("current", current);
            item.put("peak", Math.max(current, number(row.get("peak"))));
            item.put("average", current);
            item.put("activeUsers", current);
            item.put("peakActiveUsers", Math.max(current, number(row.get("peak"))));
            item.put("averageActiveUsers", current);
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> messageStat(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                SELECT TO_CHAR(d, 'YYYY-MM-DD') AS date,
                       (SELECT COUNT(*) FROM im_message m WHERE m.send_time >= d AND m.send_time < d + INTERVAL '1 day' AND m.msg_type = 0) AS text,
                       (SELECT COUNT(*) FROM im_message m WHERE m.send_time >= d AND m.send_time < d + INTERVAL '1 day' AND m.msg_type = 1) AS image,
                       (SELECT COUNT(*) FROM im_message m WHERE m.send_time >= d AND m.send_time < d + INTERVAL '1 day' AND m.msg_type = 3) AS voice,
                       (SELECT COUNT(*) FROM im_message m WHERE m.send_time >= d AND m.send_time < d + INTERVAL '1 day' AND m.msg_type = 2 AND LOWER(m.content) LIKE '%video%') AS video,
                       (SELECT COUNT(*) FROM im_message m WHERE m.send_time >= d AND m.send_time < d + INTERVAL '1 day' AND m.msg_type = 2 AND LOWER(m.content) NOT LIKE '%video%') AS file
                FROM generate_series(?::date, ?::date, INTERVAL '1 day') d
                ORDER BY d
                """, date(start), date(end));
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", text(row.get("date")));
            item.put("text", number(row.get("text")));
            item.put("image", number(row.get("image")));
            item.put("voice", number(row.get("voice")));
            item.put("video", number(row.get("video")));
            item.put("file", number(row.get("file")));
            trend.add(item);
        }

        List<Map<String, Object>> distributionRows = safeList("""
                SELECT CASE
                         WHEN msg_type = 0 THEN '文本'
                         WHEN msg_type = 1 THEN '图片'
                         WHEN msg_type = 3 THEN '语音'
                         WHEN msg_type = 2 AND LOWER(content) LIKE '%video%' THEN '视频'
                         WHEN msg_type = 2 THEN '文件'
                         ELSE '其他'
                       END AS name,
                       COUNT(*) AS value
                FROM im_message
                WHERE send_time >= ? AND send_time < ?
                GROUP BY 1
                ORDER BY value DESC
                """, timestamp(start), timestamp(end.plusDays(1)));
        List<Map<String, Object>> distribution = new ArrayList<>();
        for (Map<String, Object> row : distributionRows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", text(row.get("name")));
            item.put("value", number(row.get("value")));
            distribution.add(item);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("trend", trend);
        result.put("distribution", distribution);
        result.put("total", count("SELECT COUNT(*) FROM im_message WHERE send_time >= ? AND send_time < ?", timestamp(start), timestamp(end.plusDays(1))));
        return result;
    }

    public List<Map<String, Object>> userRanking(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                WITH messages AS (
                    SELECT from_user_id AS user_id, COUNT(*) AS message_count, MAX(send_time) AS last_active
                    FROM im_message WHERE send_time >= ? AND send_time < ? GROUP BY from_user_id
                ), logins AS (
                    SELECT user_id, COUNT(DISTINCT DATE_TRUNC('hour', created_at)) AS active_hours, MAX(created_at) AS login_last
                    FROM sys_user_login_log WHERE success = TRUE AND user_id IS NOT NULL AND created_at >= ? AND created_at < ?
                    GROUP BY user_id
                ), ids AS (
                    SELECT user_id FROM messages UNION SELECT user_id FROM logins
                )
                SELECT u.id AS user_id, u.nickname,
                       COALESCE(m.message_count, 0) AS message_count,
                        COALESCE(l.active_hours, 0) AS active_hours,
                       GREATEST(m.last_active, l.login_last) AS last_active
                FROM ids
                JOIN sys_user u ON u.id = ids.user_id
                LEFT JOIN messages m ON m.user_id = u.id
                LEFT JOIN logins l ON l.user_id = u.id
                ORDER BY message_count DESC, last_active DESC NULLS LAST
                LIMIT 10
                """, timestamp(start), timestamp(end.plusDays(1)), timestamp(start), timestamp(end.plusDays(1)));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("userId", number(row.get("user_id")));
            item.put("nickname", text(row.get("nickname")));
            item.put("messageCount", number(row.get("message_count")));
            item.put("activeHours", number(row.get("active_hours")));
            item.put("lastActive", row.get("last_active"));
            result.add(item);
        }
        return result;
    }

    public List<Map<String, Object>> groupRanking(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                SELECT c.id AS group_id, COALESCE(NULLIF(c.title, ''), '未命名群聊') AS group_name,
                       (SELECT COUNT(*) FROM im_conversation_member cm WHERE cm.conversation_id = c.id) AS member_count,
                       (SELECT COUNT(*) FROM im_message m WHERE m.conversation_id = c.id AND m.send_time >= ? AND m.send_time < ?) AS message_count,
                       (SELECT COUNT(DISTINCT m.from_user_id) FROM im_message m WHERE m.conversation_id = c.id AND m.send_time >= ? AND m.send_time < ?) AS active_members
                FROM im_conversation c
                WHERE c.type = 2
                ORDER BY message_count DESC, member_count DESC
                LIMIT 10
                """, timestamp(start), timestamp(end.plusDays(1)), timestamp(start), timestamp(end.plusDays(1)));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("groupId", number(row.get("group_id")));
            item.put("groupName", text(row.get("group_name")));
            item.put("memberCount", number(row.get("member_count")));
            item.put("messageCount", number(row.get("message_count")));
            item.put("activeMembers", number(row.get("active_members")));
            result.add(item);
        }
        return result;
    }

    public List<Map<String, Object>> momentStat(LocalDate start, LocalDate end) {
        List<Map<String, Object>> rows = safeList("""
                SELECT TO_CHAR(d, 'YYYY-MM-DD') AS date,
                       (SELECT COUNT(*) FROM moment_post p WHERE p.created_at >= d AND p.created_at < d + INTERVAL '1 day' AND COALESCE(p.removed, FALSE) = FALSE) AS publish,
                        (SELECT COUNT(*) FROM moment_like l JOIN moment_post p ON p.id=l.post_id
                         WHERE COALESCE(p.removed,FALSE)=FALSE AND l.created_at >= d AND l.created_at < d + INTERVAL '1 day') AS likes,
                        (SELECT COUNT(*) FROM moment_comment c JOIN moment_post p ON p.id=c.post_id
                         WHERE COALESCE(p.removed,FALSE)=FALSE AND c.created_at >= d AND c.created_at < d + INTERVAL '1 day') AS comment,
                       (SELECT COUNT(*) FROM community_report r WHERE r.created_at >= d AND r.created_at < d + INTERVAL '1 day') AS report
                FROM generate_series(?::date, ?::date, INTERVAL '1 day') d
                ORDER BY d
                """, date(start), date(end));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", text(row.get("date")));
            item.put("publish", number(row.get("publish")));
            item.put("like", number(row.get("likes")));
            item.put("comment", number(row.get("comment")));
            item.put("report", number(row.get("report")));
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> riskStat(LocalDate start, LocalDate end) {
        Timestamp from = timestamp(start);
        Timestamp to = timestamp(end.plusDays(1));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("report", count("SELECT COUNT(*) FROM community_report WHERE created_at >= ? AND created_at < ?", from, to));
        result.put("sensitiveWord", sensitiveWordHits(from, to));
        result.put("blocked", count("SELECT COUNT(*) FROM sys_user WHERE status = 0"));
        result.put("abnormalLogin", count("SELECT COUNT(*) FROM sys_user_login_log WHERE success = FALSE AND created_at >= ? AND created_at < ?", from, to));
        return result;
    }

    private long activeUserCount(Timestamp from, Timestamp to) {
        return count("""
                SELECT COUNT(*) FROM (
                    SELECT DISTINCT user_id FROM sys_user_login_log WHERE success = TRUE AND user_id IS NOT NULL AND created_at >= ? AND created_at < ?
                    UNION SELECT DISTINCT from_user_id FROM im_message WHERE from_user_id IS NOT NULL AND send_time >= ? AND send_time < ?
                    UNION SELECT id FROM sys_user WHERE last_online_at >= ? AND last_online_at < ?
                ) active_users
                """, from, to, from, to, from, to);
    }

    private long sensitiveWordHits(Timestamp from, Timestamp to) {
        List<String> words = safeStringList("SELECT word FROM sys_sensitive_word WHERE enabled = TRUE ORDER BY id LIMIT 100");
        long total = 0;
        for (String word : words) {
            if (!StringUtils.hasText(word)) continue;
            String pattern = "%" + word.replace("%", "\\%").replace("_", "\\_") + "%";
            total += count("SELECT COUNT(*) FROM im_message WHERE send_time >= ? AND send_time < ? AND content ILIKE ? ESCAPE '\\'", from, to, pattern);
            total += count("SELECT COUNT(*) FROM moment_post WHERE created_at >= ? AND created_at < ? AND content ILIKE ? ESCAPE '\\'", from, to, pattern);
        }
        return total;
    }

    private long onlineCount() {
        try {
            Set<String> keys = redis.keys(RedisKeys.ONLINE + "*");
            return keys == null ? 0 : keys.size();
        } catch (Exception ignored) {
            return 0;
        }
    }

    private long count(String sql, Object... args) {
        try {
            Number value = jdbcTemplate.queryForObject(sql, Number.class, args);
            return value == null ? 0 : value.longValue();
        } catch (DataAccessException ignored) {
            return 0;
        }
    }

    private List<Map<String, Object>> safeList(String sql, Object... args) {
        try {
            return jdbcTemplate.queryForList(sql, args);
        } catch (DataAccessException ignored) {
            return List.of();
        }
    }

    private List<String> safeStringList(String sql, Object... args) {
        try {
            return jdbcTemplate.queryForList(sql, String.class, args);
        } catch (DataAccessException ignored) {
            return List.of();
        }
    }

    private static Timestamp timestamp(LocalDate value) {
        return Timestamp.valueOf(value.atStartOfDay());
    }

    private static Date date(LocalDate value) {
        return Date.valueOf(value);
    }

    private static long number(Object value) {
        return value instanceof Number n ? n.longValue() : 0;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static int percentChange(long current, long previous) {
        if (previous == 0) return current == 0 ? 0 : 100;
        return (int) Math.round((current - previous) * 100.0 / previous);
    }
}
