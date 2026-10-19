package com.pulse.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
@RequiredArgsConstructor
public class CommunityService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String COMMUNITY_ACTIVE_MEMBER_SQL = """
            SELECT COUNT(DISTINCT activity.user_id)
            FROM (
                SELECT p.community_id,p.user_id,p.created_at AS occurred_at
                FROM community_post p
                WHERE p.status='PUBLISHED'
                UNION ALL
                SELECT p.community_id,pc.user_id,pc.created_at AS occurred_at
                FROM community_post_comment pc JOIN community_post p ON p.id=pc.post_id
                WHERE pc.status='PUBLISHED' AND p.status='PUBLISHED'
                UNION ALL
                SELECT p.community_id,l.user_id,l.created_at AS occurred_at
                FROM community_post_like l JOIN community_post p ON p.id=l.post_id
                WHERE p.status='PUBLISHED'
                UNION ALL
                SELECT p.community_id,f.user_id,f.created_at AS occurred_at
                FROM community_post_favorite f JOIN community_post p ON p.id=f.post_id
                WHERE p.status='PUBLISHED'
            ) activity
            JOIN community c ON c.id=activity.community_id AND c.status='APPROVED'
            WHERE activity.occurred_at >= ? AND activity.occurred_at < ?
            """;

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private NicknameConfigService nicknameConfigService;

    @Autowired
    public void setNicknameConfigService(NicknameConfigService nicknameConfigService) {
        this.nicknameConfigService = nicknameConfigService;
    }
    private SensitiveWordService sensitiveWordService;
    private CommunityRiskEventService communityRiskEventService;

    @Autowired
    public void setSensitiveWordService(SensitiveWordService sensitiveWordService) {
        this.sensitiveWordService = sensitiveWordService;
    }

    @Autowired
    public void setCommunityRiskEventService(CommunityRiskEventService communityRiskEventService) {
        this.communityRiskEventService = communityRiskEventService;
    }

    public List<Map<String,Object>> topics(boolean admin) {
        return jdbc.queryForList("SELECT id,name,sort_order,enabled FROM community_topic " +
                (admin ? "" : "WHERE enabled=TRUE ") + "ORDER BY sort_order,id");
    }

    public List<Map<String,Object>> reportReasons(boolean admin) {
        return jdbc.queryForList("SELECT id,code,name,enabled,sort_order,created_at,updated_at FROM community_report_reason " +
                (admin ? "" : "WHERE enabled=TRUE ") + "ORDER BY sort_order,id");
    }

    public List<Map<String,Object>> memberRemovalReasons(boolean admin) {
        return jdbc.queryForList("SELECT id,code,name,enabled,sort_order,created_at,updated_at FROM community_member_removal_reason " +
                (admin ? "" : "WHERE enabled=TRUE ") + "ORDER BY sort_order,id");
    }

    @Transactional
    public Map<String,Object> createReportReason(String code, String name, boolean enabled, int sortOrder) {
        String normalizedCode = normalizeReasonCode(code);
        String normalizedName = normalizeReasonName(name);
        try {
            Long id = jdbc.queryForObject("""
                    INSERT INTO community_report_reason(code,name,enabled,sort_order)
                    VALUES(?,?,?,?) RETURNING id
                    """, Long.class, normalizedCode, normalizedName, enabled, Math.max(0, sortOrder));
            return Map.of("id", id, "code", normalizedCode, "name", normalizedName,
                    "enabled", enabled, "sort_order", Math.max(0, sortOrder));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BizException("举报理由标识已存在");
        }
    }

    @Transactional
    public void updateReportReason(long id, String name, boolean enabled, int sortOrder) {
        String normalizedName = normalizeReasonName(name);
        int updated = jdbc.update("""
                UPDATE community_report_reason
                SET name=?,enabled=?,sort_order=?,updated_at=NOW()
                WHERE id=?
                """, normalizedName, enabled, Math.max(0, sortOrder), id);
        if (updated == 0) throw new BizException("举报理由不存在");
    }

    @Transactional
    public void deleteReportReason(long id) {
        Map<String,Object> reason = one("SELECT code FROM community_report_reason WHERE id=?", id);
        Long used = jdbc.queryForObject("SELECT COUNT(*) FROM community_report WHERE reason=?", Long.class, reason.get("code"));
        if (used != null && used > 0) throw new BizException("该理由已有举报记录，请停用后保留历史数据");
        if (jdbc.update("DELETE FROM community_report_reason WHERE id=?", id) == 0) throw new BizException("举报理由不存在");
    }

    @Transactional
    public Map<String,Object> createMemberRemovalReason(String code, String name, boolean enabled, int sortOrder) {
        String normalizedCode = normalizeMemberRemovalReasonCode(code);
        String normalizedName = normalizeMemberRemovalReasonName(name);
        try {
            Long id = jdbc.queryForObject("""
                    INSERT INTO community_member_removal_reason(code,name,enabled,sort_order)
                    VALUES(?,?,?,?) RETURNING id
                    """, Long.class, normalizedCode, normalizedName, enabled, Math.max(0, sortOrder));
            return Map.of("id", id, "code", normalizedCode, "name", normalizedName,
                    "enabled", enabled, "sort_order", Math.max(0, sortOrder));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BizException("移除理由标识已存在");
        }
    }

    @Transactional
    public void updateMemberRemovalReason(long id, String name, boolean enabled, int sortOrder) {
        String normalizedName = normalizeMemberRemovalReasonName(name);
        int updated = jdbc.update("""
                UPDATE community_member_removal_reason
                SET name=?,enabled=?,sort_order=?,updated_at=NOW()
                WHERE id=?
                """, normalizedName, enabled, Math.max(0, sortOrder), id);
        if (updated == 0) throw new BizException("移除理由不存在");
    }

    @Transactional
    public void deleteMemberRemovalReason(long id) {
        if (jdbc.update("DELETE FROM community_member_removal_reason WHERE id=?", id) == 0) {
            throw new BizException("移除理由不存在");
        }
    }

    @Transactional
    public Map<String,Object> createTopic(String name, int sortOrder) {
        String value = name == null ? "" : name.trim();
        if (value.length() < 1 || value.length() > 30) throw new BizException("主题名称需为1-30字");
        try {
            Long id = jdbc.queryForObject(
                    "INSERT INTO community_topic(name,sort_order,enabled) VALUES(?,?,TRUE) RETURNING id",
                    Long.class, value, Math.max(0, sortOrder));
            return Map.of("id", id, "name", value);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BizException("主题名称已存在");
        }
    }

    @Transactional
    public void updateTopic(long id, String name, int sortOrder, boolean enabled) {
        String value = name == null ? "" : name.trim();
        if (value.length() < 1 || value.length() > 30) throw new BizException("主题名称需为1-30字");
        try {
            int updated = jdbc.update("UPDATE community_topic SET name=?,sort_order=?,enabled=?,updated_at=NOW() WHERE id=?",
                    value, Math.max(0, sortOrder), enabled, id);
            if (updated == 0) throw new BizException("主题不存在");
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BizException("主题名称已存在");
        }
    }

    @Transactional
    public void disableTopic(long id) {
        int updated = jdbc.update("UPDATE community_topic SET enabled=FALSE,updated_at=NOW() WHERE id=?", id);
        if (updated == 0) throw new BizException("主题不存在");
    }

    public Map<String,Object> adminStats() {
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("communityTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community WHERE status<>'DISSOLVED'", Long.class));
        out.put("pendingTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community WHERE status='PENDING'", Long.class));
        out.put("approvedTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community WHERE status='APPROVED'", Long.class));
        out.put("memberTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community_member m JOIN community c ON c.id=m.community_id WHERE m.status='ACTIVE' AND c.status='APPROVED'", Long.class));
        out.put("postTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community_post p JOIN community c ON c.id=p.community_id WHERE p.status='PUBLISHED' AND c.status='APPROVED'", Long.class));
        out.put("reportPending", jdbc.queryForObject("SELECT COUNT(*) FROM community_report WHERE status='PENDING'", Long.class));
        out.put("orderTotal", jdbc.queryForObject("SELECT COUNT(*) FROM community_order WHERE status='PAID'", Long.class));
        out.put("incomeTotal", jdbc.queryForObject("SELECT COALESCE(SUM(owner_income),0) FROM community_order WHERE status='PAID'", Long.class));
        return out;
    }

    /**
     * 圈子运营数据中心：卡片数据保持累计口径，活跃成员按所选日期范围统计。
     * 旧版 adminStats 保留给已有页面和兼容调用，新接口只读取现有业务表及风险事件表。
     */
    public Map<String,Object> circleDashboardOverview(String startDate, String endDate) {
        DashboardRange range = dashboardRange(startDate, endDate);
        DashboardRange previous = range.previous();
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("circleCount", count("SELECT COUNT(*) FROM community WHERE status<>'DISSOLVED' AND created_at < ?", range.endExclusive()));
        out.put("pendingCount", count("SELECT COUNT(*) FROM community WHERE status='PENDING'"));
        out.put("onlineCount", count("SELECT COUNT(*) FROM community WHERE status='APPROVED'"));
        out.put("activeMemberCount", count(COMMUNITY_ACTIVE_MEMBER_SQL, range.start(), range.endExclusive()));
        out.put("momentCount", count("SELECT COUNT(*) FROM community_post p JOIN community c ON c.id=p.community_id AND c.status='APPROVED' WHERE p.status='PUBLISHED' AND p.created_at < ?", range.endExclusive()));
        out.put("reportCount", count("SELECT COUNT(*) FROM community_report WHERE status='PENDING'"));
        out.put("orderCount", count("SELECT COUNT(*) FROM community_order WHERE status='PAID' AND created_at < ?", range.endExclusive()));
        out.put("income", numberValue("SELECT COALESCE(SUM(owner_income),0) FROM community_order WHERE status='PAID' AND created_at < ?", range.endExclusive()));

        long currentCreated = count("SELECT COUNT(*) FROM community WHERE created_at >= ? AND created_at < ?", range.start(), range.endExclusive());
        long previousCreated = count("SELECT COUNT(*) FROM community WHERE created_at >= ? AND created_at < ?", previous.start(), previous.endExclusive());
        long currentActive = count(COMMUNITY_ACTIVE_MEMBER_SQL, range.start(), range.endExclusive());
        long previousActive = count(COMMUNITY_ACTIVE_MEMBER_SQL, previous.start(), previous.endExclusive());
        out.put("circleChange", percentage(currentCreated, previousCreated));
        out.put("activeMemberChange", percentage(currentActive, previousActive));
        out.put("startDate", range.startDate().toString());
        out.put("endDate", range.endDate().toString());
        return out;
    }

    public Map<String,Object> circleDashboardTrend(String startDate, String endDate) {
        DashboardRange range = dashboardRange(startDate, endDate);
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("circleTrend", jdbc.queryForList("""
                SELECT day::date AS date,
                       (SELECT COUNT(*) FROM community c
                        WHERE c.created_at >= day AND c.created_at < day + INTERVAL '1 day') AS create,
                       (SELECT COUNT(*) FROM community_status_event e
                        WHERE e.to_status='APPROVED'
                          AND e.occurred_at >= day AND e.occurred_at < day + INTERVAL '1 day') AS approve,
                       (SELECT COUNT(*) FROM community_status_event e
                        WHERE e.to_status IN ('CLOSED','DISSOLVED')
                          AND e.occurred_at >= day AND e.occurred_at < day + INTERVAL '1 day') AS close
                FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL '1 day') AS days(day)
                ORDER BY day
                """, range.sqlStart(), range.sqlEnd()));
        out.put("memberTrend", jdbc.queryForList("""
                SELECT day::date AS date,
                       (SELECT COUNT(*)
                        FROM community_member_event e
                        JOIN community c ON c.id=e.community_id AND c.status='APPROVED'
                        WHERE e.event_type='JOIN'
                          AND e.occurred_at >= day AND e.occurred_at < day + INTERVAL '1 day') AS newMember,
                       (SELECT COUNT(DISTINCT m.user_id)
                        FROM community_member m
                        JOIN community c ON c.id=m.community_id AND c.status='APPROVED'
                        WHERE m.status IN ('ACTIVE','MUTED')
                          AND m.join_time < day + INTERVAL '1 day') AS totalMember,
                       (SELECT COUNT(DISTINCT activity.user_id)
                        FROM (
                            SELECT p.community_id,p.user_id,p.created_at AS occurred_at
                            FROM community_post p
                            WHERE p.status='PUBLISHED'
                            UNION ALL
                            SELECT p.community_id,pc.user_id,pc.created_at AS occurred_at
                            FROM community_post_comment pc JOIN community_post p ON p.id=pc.post_id
                            WHERE pc.status='PUBLISHED' AND p.status='PUBLISHED'
                            UNION ALL
                            SELECT p.community_id,l.user_id,l.created_at AS occurred_at
                            FROM community_post_like l JOIN community_post p ON p.id=l.post_id
                            WHERE p.status='PUBLISHED'
                            UNION ALL
                            SELECT p.community_id,f.user_id,f.created_at AS occurred_at
                            FROM community_post_favorite f JOIN community_post p ON p.id=f.post_id
                            WHERE p.status='PUBLISHED'
                        ) activity
                        JOIN community c ON c.id=activity.community_id AND c.status='APPROVED'
                        WHERE activity.occurred_at >= day
                          AND activity.occurred_at < day + INTERVAL '1 day') AS activeMember
                FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL '1 day') AS days(day)
                ORDER BY day
                """, range.sqlStart(), range.sqlEnd()));
        out.put("typeDistribution", circleTypeDistribution(range));
        out.put("statusDistribution", circleStatusDistribution());
        return out;
    }

    public Map<String,Object> circleDashboardRanking(String startDate, String endDate) {
        DashboardRange range = dashboardRange(startDate, endDate);
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("hotCircles", jdbc.queryForList("""
                SELECT c.id,c.name,u.nickname AS ownerName,c.member_count AS memberCount,c.post_count AS postCount,
                       metrics.activeMemberCount,metrics.income
                FROM community c JOIN sys_user u ON u.id=c.owner_id
                CROSS JOIN LATERAL (
                    SELECT
                        (SELECT COUNT(DISTINCT activity.user_id)
                         FROM (
                             SELECT p.user_id,p.created_at AS occurred_at
                             FROM community_post p
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                             UNION ALL
                             SELECT pc.user_id,pc.created_at AS occurred_at
                             FROM community_post_comment pc JOIN community_post p ON p.id=pc.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED' AND pc.status='PUBLISHED'
                             UNION ALL
                             SELECT l.user_id,l.created_at AS occurred_at
                             FROM community_post_like l JOIN community_post p ON p.id=l.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                             UNION ALL
                             SELECT f.user_id,f.created_at AS occurred_at
                             FROM community_post_favorite f JOIN community_post p ON p.id=f.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                         ) activity
                         WHERE activity.occurred_at >= ? AND activity.occurred_at < ?) AS activeMemberCount,
                        (SELECT COALESCE(SUM(o.owner_income),0)
                         FROM community_order o WHERE o.community_id=c.id AND o.status='PAID'
                           AND o.created_at >= ? AND o.created_at < ?) AS income
                ) metrics
                WHERE c.status='APPROVED'
                ORDER BY metrics.activeMemberCount DESC,c.member_count DESC,c.created_at DESC
                LIMIT 10
                """, range.start(), range.endExclusive(), range.start(), range.endExclusive()));
        out.put("activeCircles", jdbc.queryForList("""
                SELECT c.id,c.name,
                       metrics.todayMemberCount,metrics.todayMessageCount,metrics.todayMomentCount,
                       (metrics.todayMemberCount + metrics.todayMessageCount + metrics.todayMomentCount * 2) AS activeScore
                FROM community c
                CROSS JOIN LATERAL (
                    SELECT
                        (SELECT COUNT(DISTINCT activity.user_id)
                         FROM (
                             SELECT p.user_id,p.created_at AS occurred_at
                             FROM community_post p
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                             UNION ALL
                             SELECT pc.user_id,pc.created_at AS occurred_at
                             FROM community_post_comment pc JOIN community_post p ON p.id=pc.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED' AND pc.status='PUBLISHED'
                             UNION ALL
                             SELECT l.user_id,l.created_at AS occurred_at
                             FROM community_post_like l JOIN community_post p ON p.id=l.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                             UNION ALL
                             SELECT f.user_id,f.created_at AS occurred_at
                             FROM community_post_favorite f JOIN community_post p ON p.id=f.post_id
                             WHERE p.community_id=c.id AND p.status='PUBLISHED'
                         ) activity
                         WHERE activity.occurred_at >= ? AND activity.occurred_at < ?) AS todayMemberCount,
                        (SELECT COUNT(*) FROM community_post_comment pc JOIN community_post p ON p.id=pc.post_id
                         WHERE p.community_id=c.id AND p.status='PUBLISHED' AND pc.status='PUBLISHED'
                           AND pc.created_at >= ? AND pc.created_at < ?) AS todayMessageCount,
                        (SELECT COUNT(*) FROM community_post p
                         WHERE p.community_id=c.id AND p.status='PUBLISHED'
                           AND p.created_at >= ? AND p.created_at < ?) AS todayMomentCount
                ) metrics
                WHERE c.status='APPROVED'
                ORDER BY activeScore DESC,metrics.todayMemberCount DESC,metrics.todayMomentCount DESC,metrics.todayMessageCount DESC
                LIMIT 10
                """, range.start(), range.endExclusive(), range.start(), range.endExclusive(),
                range.start(), range.endExclusive()));
        return out;
    }

    public List<Map<String,Object>> circleDashboardIncome(String startDate, String endDate) {
        DashboardRange range = dashboardRange(startDate, endDate);
        return jdbc.queryForList("""
                SELECT day::date AS date,
                       (SELECT COALESCE(SUM(o.amount),0) FROM community_order o
                        WHERE o.status='PAID' AND o.created_at >= day AND o.created_at < day + INTERVAL '1 day') AS payment,
                       (SELECT COALESCE(SUM(o.platform_fee),0) FROM community_order o
                        WHERE o.status='PAID' AND o.created_at >= day AND o.created_at < day + INTERVAL '1 day') AS platformFee,
                       (SELECT COALESCE(SUM(o.owner_income),0) FROM community_order o
                        WHERE o.status='PAID' AND o.created_at >= day AND o.created_at < day + INTERVAL '1 day') AS ownerIncome
                FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL '1 day') AS days(day)
                ORDER BY day
                """, range.sqlStart(), range.sqlEnd());
    }

    public Map<String,Object> circleDashboardContent(String startDate, String endDate) {
        DashboardRange range = dashboardRange(startDate, endDate);
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("trend", jdbc.queryForList("""
                SELECT day::date AS date,
                       (SELECT COUNT(*) FROM community_post p JOIN community c ON c.id=p.community_id
                        WHERE c.status='APPROVED' AND p.status='PUBLISHED' AND p.created_at >= day AND p.created_at < day + INTERVAL '1 day') AS publish,
                       (SELECT COUNT(*) FROM community_post_like l JOIN community_post p ON p.id=l.post_id
                        JOIN community c ON c.id=p.community_id
                        WHERE c.status='APPROVED' AND p.status='PUBLISHED' AND l.created_at >= day AND l.created_at < day + INTERVAL '1 day') AS likeCount,
                       (SELECT COUNT(*) FROM community_post_comment c JOIN community_post p ON p.id=c.post_id
                        JOIN community circle ON circle.id=p.community_id
                        WHERE circle.status='APPROVED' AND p.status='PUBLISHED' AND c.status='PUBLISHED'
                          AND c.created_at >= day AND c.created_at < day + INTERVAL '1 day') AS commentCount,
                       (SELECT COUNT(*) FROM community_post_favorite f JOIN community_post p ON p.id=f.post_id
                        JOIN community c ON c.id=p.community_id
                        WHERE c.status='APPROVED' AND p.status='PUBLISHED' AND f.created_at >= day AND f.created_at < day + INTERVAL '1 day') AS favoriteCount
                FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL '1 day') AS days(day)
                ORDER BY day
                """, range.sqlStart(), range.sqlEnd()));
        out.put("typeDistribution", circleTypeDistribution(range));
        out.put("statusDistribution", circleStatusDistribution());
        Map<String,Object> risk = new LinkedHashMap<>();
        risk.put("violationPost", count("SELECT COUNT(*) FROM community_risk_event WHERE event_type='BLOCKED_POST' AND created_at >= ? AND created_at < ?", range.start(), range.endExclusive()));
        risk.put("reportCount", count("SELECT COUNT(*) FROM community_report WHERE created_at >= ? AND created_at < ?", range.start(), range.endExclusive()));
        risk.put("blockedCircle", count("SELECT COUNT(*) FROM community WHERE status IN ('CLOSED','DISSOLVED')"));
        risk.put("blockedMember", count("SELECT COUNT(*) FROM community_member WHERE status='MUTED'"));
        risk.put("sensitiveWord", count("SELECT COUNT(*) FROM community_risk_event WHERE event_type='SENSITIVE_WORD' AND created_at >= ? AND created_at < ?", range.start(), range.endExclusive()));
        out.put("risk", risk);
        return out;
    }

    private List<Map<String,Object>> circleTypeDistribution(DashboardRange range) {
        return jdbc.queryForList("""
                SELECT COALESCE(NULLIF(t.name,''), CASE c.type WHEN 'PAID' THEN '付费圈' ELSE '兴趣圈' END) AS name,
                       COUNT(*) AS value
                FROM community c LEFT JOIN community_topic t ON t.id=c.topic_id
                WHERE c.status<>'DISSOLVED' AND c.created_at < ?
                GROUP BY COALESCE(NULLIF(t.name,''), CASE c.type WHEN 'PAID' THEN '付费圈' ELSE '兴趣圈' END)
                ORDER BY value DESC,name
                """, range.endExclusive());
    }

    private List<Map<String,Object>> circleStatusDistribution() {
        List<Map<String,Object>> rows = jdbc.queryForList("""
                SELECT status,COUNT(*) AS value FROM community GROUP BY status ORDER BY value DESC,status
                """);
        List<Map<String,Object>> result = new ArrayList<>();
        for (Map<String,Object> row : rows) {
            String status = String.valueOf(row.get("status"));
            String name = switch (status) {
                case "APPROVED" -> "正常运营";
                case "PENDING" -> "审核中";
                case "FROZEN" -> "冻结";
                case "CLOSED", "DISSOLVED" -> "关闭";
                default -> status;
            };
            Map<String,Object> item = new LinkedHashMap<>();
            item.put("name", name);
            item.put("value", row.get("value"));
            result.add(item);
        }
        return result;
    }

    private long count(String sql, Object... args) {
        Long result = jdbc.queryForObject(sql, Long.class, args);
        return result == null ? 0L : result;
    }

    private long numberValue(String sql, Object... args) {
        Long result = jdbc.queryForObject(sql, Long.class, args);
        return result == null ? 0L : result.longValue();
    }

    private static double percentage(long current, long previous) {
        if (previous == 0) return current == 0 ? 0D : 100D;
        return BigDecimal.valueOf((current - previous) * 100D / previous)
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static DashboardRange dashboardRange(String startDate, String endDate) {
        LocalDate end = parseDashboardDate(endDate, LocalDate.now());
        LocalDate start = parseDashboardDate(startDate, end.minusDays(29));
        if (start.isAfter(end)) throw new BizException("开始日期不能晚于结束日期");
        if (start.plusDays(365).isBefore(end)) throw new BizException("日期范围不能超过366天");
        return new DashboardRange(start, end);
    }

    private static LocalDate parseDashboardDate(String value, LocalDate fallback) {
        if (!StringUtils.hasText(value)) return fallback;
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BizException("日期格式应为YYYY-MM-DD");
        }
    }

    private record DashboardRange(LocalDate startDate, LocalDate endDate) {
        java.sql.Timestamp start() {
            return java.sql.Timestamp.valueOf(startDate.atStartOfDay());
        }

        java.sql.Timestamp endExclusive() {
            return java.sql.Timestamp.valueOf(endDate.plusDays(1).atStartOfDay());
        }

        java.sql.Date sqlStart() {
            return java.sql.Date.valueOf(startDate);
        }

        java.sql.Date sqlEnd() {
            return java.sql.Date.valueOf(endDate);
        }

        DashboardRange previous() {
            long days = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1;
            LocalDate previousEnd = startDate.minusDays(1);
            return new DashboardRange(previousEnd.minusDays(days - 1), previousEnd);
        }
    }

    public Map<String,Object> browse(Long userId, String keyword, Long topicId, int page, int size) {
        int p=Math.max(1,page), s=Math.min(50,Math.max(1,size));
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        var rows=jdbc.queryForList("""
                SELECT c.id,c.name,c.avatar,c.description,c.type,c.price,c.member_count,c.post_count,c.created_at,
                       t.name topic,u.id owner_id,u.nickname owner_name,
                       EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=c.id AND m.user_id=? AND m.status='ACTIVE') joined
                FROM community c LEFT JOIN community_topic t ON t.id=c.topic_id JOIN sys_user u ON u.id=c.owner_id
                WHERE c.status='APPROVED'
                  AND c.owner_id<>?
                  AND NOT EXISTS(
                      SELECT 1 FROM community_member hidden_member
                      WHERE hidden_member.community_id=c.id AND hidden_member.user_id=? AND hidden_member.status='ACTIVE'
                  )
                  AND (CAST(? AS BIGINT) IS NULL OR c.topic_id=CAST(? AS BIGINT))
                  AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT)
                       OR t.name ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))
                ORDER BY c.member_count DESC,c.created_at DESC LIMIT ? OFFSET ?
                """, userId,userId,userId,topicId,topicId,q,q,q,q,s,(p-1)*s);
        return Map.of("items",rows,"page",p,"size",s,"hasMore",rows.size()==s);
    }

    public Map<String,Object> detail(Long userId,long id) {
        var rows=jdbc.queryForList("""
                SELECT c.*,t.name topic,u.nickname owner_name,u.avatar_url owner_avatar,
                       m.role my_role,m.status my_member_status,
                       (SELECT jr.status FROM community_join_request jr WHERE jr.community_id=c.id AND jr.user_id=? LIMIT 1) join_request_status,
                       (SELECT lr.status FROM community_leave_request lr WHERE lr.community_id=c.id AND lr.user_id=? LIMIT 1) leave_request_status,
                       CASE WHEN m.role='OWNER' THEN (SELECT pr.proposed_name FROM community_profile_review pr WHERE pr.community_id=c.id AND pr.status='PENDING' ORDER BY pr.created_at DESC LIMIT 1) END pending_name,
                       CASE WHEN m.role='OWNER' THEN (SELECT pr.proposed_avatar FROM community_profile_review pr WHERE pr.community_id=c.id AND pr.status='PENDING' ORDER BY pr.created_at DESC LIMIT 1) END pending_avatar,
                       CASE WHEN m.role='OWNER' THEN (SELECT pr.changed_name FROM community_profile_review pr WHERE pr.community_id=c.id AND pr.status='PENDING' ORDER BY pr.created_at DESC LIMIT 1) END pending_name_review,
                       CASE WHEN m.role='OWNER' THEN (SELECT pr.changed_avatar FROM community_profile_review pr WHERE pr.community_id=c.id AND pr.status='PENDING' ORDER BY pr.created_at DESC LIMIT 1) END pending_avatar_review,
                       CASE WHEN m.role IN('OWNER','ADMIN') THEN (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.status='PENDING') ELSE 0 END pending_post_count,
                       (SELECT COUNT(*) FROM community_notification n WHERE n.user_id=? AND n.community_id=c.id AND n.type IN('PROFILE_APPROVED','PROFILE_REJECTED') AND n.read_at IS NULL) profile_review_unread_count
                FROM community c LEFT JOIN community_topic t ON t.id=c.topic_id JOIN sys_user u ON u.id=c.owner_id
                LEFT JOIN community_member m ON m.community_id=c.id AND m.user_id=? WHERE c.id=?
                """,userId,userId,userId,userId,id);
        if(rows.isEmpty()) throw new BizException("圈子不存在");
        Map<String,Object> result=new LinkedHashMap<>(rows.getFirst());
        boolean member = isMember(userId, id);
        boolean approved = "APPROVED".equals(String.valueOf(result.get("status")));
        result.put("joined", member);
        result.put("canViewContent", member && approved);
        result.put("reviewOnly", !approved);
        result.put("posts", member && approved ? posts(userId,id) : List.of());
        return result;
    }

    public List<Map<String,Object>> mine(Long userId) {
        return jdbc.queryForList("""
                SELECT c.id,c.name,c.avatar,c.description,c.announcement,c.type,c.price,c.status,c.reject_reason,c.member_count,c.post_count,
                       c.created_at,t.name topic,m.role,m.join_time,
                       (SELECT MAX(p.created_at) FROM community_post p WHERE p.community_id=c.id AND p.status='PUBLISHED') recent_post_time
                FROM community_member m JOIN community c ON c.id=m.community_id
                LEFT JOIN community_topic t ON t.id=c.topic_id
                WHERE m.user_id=? AND m.status='ACTIVE' ORDER BY (m.role='OWNER') DESC,m.join_time DESC
                """,userId);
    }

    @Transactional
    public Map<String,Object> create(Long userId,Map<String,Object>b) {
        if (!Boolean.parseBoolean(String.valueOf(b.getOrDefault("agreementAccepted", false)))) {
            throw new BizException("请先阅读并同意圈子创建协议");
        }
        String name=normalizeCommunityNickname(text(b,"name")), description=text(b,"description"), type=upper(b,"type","FREE");
        if(description.length()>500) throw new BizException("圈子介绍不能超过500字");
        if(!Set.of("FREE","PAID").contains(type)) throw new BizException("圈子类型无效");
        long price=number(b.get("price")); if(type.equals("FREE")) price=0;
        if(type.equals("PAID")&&price<=0) throw new BizException("付费圈子价格必须大于0");
        Long topic=nullableLong(b.get("topicId"));
        Long id=jdbc.queryForObject("""
                INSERT INTO community(name,avatar,description,rules,topic_id,owner_id,type,price,post_mode,status)
                VALUES(?,?,?,?,?,?,?,?,?,'PENDING') RETURNING id
                """,Long.class,name,nullable(b.get("avatar")),description,text(b,"rules"),topic,userId,type,price,upper(b,"postMode","ALL"));
        jdbc.update("INSERT INTO community_member(community_id,user_id,role) VALUES(?,?,'OWNER')",id,userId);
        jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) VALUES(?,?,'JOIN',?,?)",id,userId,"圈主创建圈子自动加入",userId);
        return Map.of("id",id,"status","PENDING");
    }

    @Transactional
    public Map<String,Object> join(Long userId,long id,String paymentPassword,boolean agreementAccepted) {
        Map<String,Object> c=one("SELECT id,name,owner_id,type,price,platform_rate,status,join_review_required FROM community WHERE id=? FOR UPDATE",id);
        if(!"APPROVED".equals(c.get("status"))) throw new BizException("圈子暂不可加入");
        Integer exists=jdbc.queryForObject("SELECT COUNT(*) FROM community_member WHERE community_id=? AND user_id=? AND status='ACTIVE'",Integer.class,id,userId);
        if(exists!=null&&exists>0) return Map.of("joined",true,"paid",false);
        if (!agreementAccepted) throw new BizException("请先阅读并同意圈子加入协议");
        if (Boolean.TRUE.equals(c.get("join_review_required"))) {
            List<Map<String,Object>> requests = jdbc.queryForList("SELECT id,status FROM community_join_request WHERE community_id=? AND user_id=? FOR UPDATE", id, userId);
            String requestStatus = requests.isEmpty() ? null : String.valueOf(requests.getFirst().get("status"));
            if (!"APPROVED".equals(requestStatus)) {
                jdbc.update("""
                        INSERT INTO community_join_request(community_id,user_id,status) VALUES(?,?,'PENDING')
                        ON CONFLICT(community_id,user_id) DO UPDATE SET status='PENDING',reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW()
                        """, id, userId);
                return Map.of("joined",false,"paid",false,"pendingApproval",true);
            }
        }
        long price=number(c.get("price")), owner=number(c.get("owner_id"));
        String orderNo=null;
        if(price>0){
            Map<String,Object> buyer=one("SELECT wallet_balance,payment_password_hash FROM sys_user WHERE id=? FOR UPDATE",userId);
            String hash=(String)buyer.get("payment_password_hash");
            if(!StringUtils.hasText(hash)||!passwordEncoder.matches(paymentPassword==null?"":paymentPassword,hash)) throw new BizException("支付密码错误");
            if(number(buyer.get("wallet_balance"))<price) throw new BizException("钱包余额不足");
            BigDecimal rate = c.get("platform_rate") == null
                    ? jdbc.queryForObject("SELECT platform_rate FROM community_config WHERE id=1", BigDecimal.class)
                    : new BigDecimal(String.valueOf(c.get("platform_rate")));
            long fee=BigDecimal.valueOf(price).multiply(rate).divide(BigDecimal.valueOf(100),0,RoundingMode.HALF_UP).longValue();
            long income=price-fee; orderNo="CO"+System.currentTimeMillis()+String.format("%04d",new Random().nextInt(10000));
            jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance-? WHERE id=?",price,userId);
            jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance+? WHERE id=?",income,owner);
            Long orderId=jdbc.queryForObject("INSERT INTO community_order(order_no,community_id,buyer_id,amount,platform_fee,owner_income,platform_rate) VALUES(?,?,?,?,?,?,?) RETURNING id",Long.class,orderNo,id,userId,price,fee,income,rate);
            jdbc.update("INSERT INTO community_income(owner_id,community_id,order_id,amount) VALUES(?,?,?,?)",owner,id,orderId,income);
            walletTx(orderNo,userId,"OUT",price,owner,"加入圈子："+c.get("name"));
            walletTx(orderNo,owner,"IN",income,userId,"圈子收益："+c.get("name"));
        }
        jdbc.update("""
                INSERT INTO community_member(community_id,user_id,role,status) VALUES(?,?,'MEMBER','ACTIVE')
                ON CONFLICT(community_id,user_id) DO UPDATE SET status='ACTIVE',join_time=NOW(),status_updated_at=NOW()
                """,id,userId);
        jdbc.update("UPDATE community_join_request SET status='COMPLETED',updated_at=NOW() WHERE community_id=? AND user_id=?", id, userId);
        jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) VALUES(?,?,'JOIN',?,?)",id,userId,Boolean.TRUE.equals(c.get("join_review_required"))?"进圈申请审核通过后加入":"用户主动加入",userId);
        jdbc.update("UPDATE community SET member_count=(SELECT COUNT(*) FROM community_member WHERE community_id=? AND status='ACTIVE'),updated_at=NOW() WHERE id=?",id,id);
        Map<String,Object> out=new LinkedHashMap<>(); out.put("joined",true); out.put("paid",price>0); out.put("orderNo",orderNo); return out;
    }

    public List<Map<String,Object>> posts(Long userId,long id){
        requireMember(userId, id);
        var rows = jdbc.queryForList("""
                SELECT p.id,p.community_id,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,p.link_url,
                       p.location_name,p.location_address,p.latitude,p.longitude,p.status,p.pinned,p.pinned_at,p.pinned_by,
                       p.quoted_post_id,p.quoted_user_id,p.quoted_nickname,p.quoted_content,p.quoted_images,p.quoted_media_types,p.quoted_media_file_ids,p.quoted_video,
                       p.like_count,p.comment_count,p.created_at,
                       u.id user_id,u.nickname,u.avatar_url,
                       author_member.role author_role,my_member.role my_role,
                       EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.id AND l.user_id=?) liked_by_me,
                       EXISTS(SELECT 1 FROM community_post_favorite f WHERE f.post_id=p.id AND f.user_id=?) favorited_by_me
                FROM community_post p JOIN sys_user u ON u.id=p.user_id
                LEFT JOIN community_member author_member
                       ON author_member.community_id=p.community_id AND author_member.user_id=p.user_id AND author_member.status='ACTIVE'
                LEFT JOIN community_member my_member
                       ON my_member.community_id=p.community_id AND my_member.user_id=? AND my_member.status='ACTIVE'
                WHERE p.community_id=? AND p.status<>'DELETED'
                  AND (p.status='PUBLISHED' OR (p.user_id=? AND p.status='PENDING'))
                ORDER BY p.pinned DESC,p.pinned_at DESC NULLS LAST,p.created_at DESC LIMIT 100
                """,userId,userId,userId,id,userId);
        return rows.stream().map(row -> withPostDeleteAccess(row, userId)).toList();
    }

    public List<Map<String,Object>> managePosts(Long userId, long communityId) {
        return managePosts(userId, communityId, null, null, null, "LATEST", 1, 200);
    }

    public List<Map<String,Object>> managePosts(Long userId, long communityId, String keyword, String startDate, String endDate, String sort, int page, int size) {
        requireManager(userId, communityId);
        String q = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        LocalDate start = StringUtils.hasText(startDate) ? parseDashboardDate(startDate, null) : null;
        LocalDate end = StringUtils.hasText(endDate) ? parseDashboardDate(endDate, null) : null;
        if (start != null && end != null && start.isAfter(end)) throw new BizException("开始日期不能晚于结束日期");
        java.sql.Timestamp startAt = start == null ? null : java.sql.Timestamp.valueOf(start.atStartOfDay());
        java.sql.Timestamp endExclusive = end == null ? null : java.sql.Timestamp.valueOf(end.plusDays(1).atStartOfDay());
        String orderBy = switch (String.valueOf(sort).trim().toUpperCase(Locale.ROOT)) {
            case "LIKE_COUNT" -> "p.like_count DESC,p.created_at DESC";
            case "COMMENT_COUNT" -> "p.comment_count DESC,p.created_at DESC";
            case "FORWARD_COUNT" -> "forward_count DESC,p.created_at DESC";
            default -> "CASE p.status WHEN 'PENDING' THEN 0 WHEN 'BLOCKED' THEN 1 ELSE 2 END,p.pinned DESC,p.pinned_at DESC NULLS LAST,p.created_at DESC";
        };
        int p = Math.max(1, page), s = Math.min(200, Math.max(1, size));
        return jdbc.queryForList("""
                SELECT p.id,p.community_id,p.user_id,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,p.link_url,
                       p.location_name,p.location_address,p.latitude,p.longitude,p.status,p.pinned,p.pinned_at,p.pinned_by,
                       p.quoted_post_id,p.quoted_user_id,p.quoted_nickname,p.quoted_content,p.quoted_images,p.quoted_media_types,p.quoted_media_file_ids,p.quoted_video,
                       p.like_count,p.comment_count,
                       (SELECT COUNT(*) FROM community_post forwarded WHERE forwarded.quoted_post_id=p.id AND forwarded.status IN('PENDING','PUBLISHED','BLOCKED')) forward_count,
                       p.created_at,p.updated_at,u.nickname,u.avatar_url,author_member.role author_role
                FROM community_post p JOIN sys_user u ON u.id=p.user_id
                LEFT JOIN community_member author_member
                       ON author_member.community_id=p.community_id AND author_member.user_id=p.user_id AND author_member.status='ACTIVE'
                WHERE p.community_id=? AND p.status IN('PENDING','PUBLISHED','BLOCKED')
                  AND (CAST(? AS TEXT) IS NULL OR p.content ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))
                  AND (CAST(? AS TIMESTAMPTZ) IS NULL OR p.created_at>=CAST(? AS TIMESTAMPTZ))
                  AND (CAST(? AS TIMESTAMPTZ) IS NULL OR p.created_at<CAST(? AS TIMESTAMPTZ))
                ORDER BY """ + " " + orderBy + " LIMIT ? OFFSET ?", communityId,q,q,q,startAt,startAt,endExclusive,endExclusive,s,(p-1)*s);
    }

    public Map<String,Object> postDetail(Long userId, long postId) {
        Map<String,Object> metadata = one(
                """
                SELECT p.community_id,p.user_id,p.status,
                       author_member.role author_role,my_member.role my_role
                FROM community_post p
                LEFT JOIN community_member author_member
                       ON author_member.community_id=p.community_id AND author_member.user_id=p.user_id AND author_member.status='ACTIVE'
                LEFT JOIN community_member my_member
                       ON my_member.community_id=p.community_id AND my_member.user_id=? AND my_member.status='ACTIVE'
                WHERE p.id=?
                """, userId, postId);
        if ("DELETED".equals(metadata.get("status"))) throw new BizException("动态不存在");
        long communityId = number(metadata.get("community_id"));
        requireMember(userId, communityId);
        boolean authoredByMe = number(metadata.get("user_id")) == userId;
        String postStatus = String.valueOf(metadata.get("status"));
        boolean contentManager = (!authoredByMe || "BLOCKED".equals(postStatus))
                && hasMemberPermission(userId, communityId, "CONTENT");
        boolean visible = "PUBLISHED".equals(postStatus)
                || ("PENDING".equals(postStatus) && (authoredByMe || contentManager))
                || ("BLOCKED".equals(postStatus) && contentManager);
        if (!visible) {
            throw new BizException("动态不存在");
        }
        Map<String,Object> result = new LinkedHashMap<>(one("""
                SELECT p.id,p.community_id,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,p.link_url,
                       p.location_name,p.location_address,p.latitude,p.longitude,p.status,p.pinned,p.pinned_at,p.pinned_by,
                       p.quoted_post_id,p.quoted_user_id,p.quoted_nickname,p.quoted_content,p.quoted_images,p.quoted_media_types,p.quoted_media_file_ids,p.quoted_video,
                       p.like_count,p.comment_count,p.created_at,
                       u.id user_id,u.nickname,u.avatar_url,
                       EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.id AND l.user_id=?) liked_by_me,
                       EXISTS(SELECT 1 FROM community_post_favorite f WHERE f.post_id=p.id AND f.user_id=?) favorited_by_me
                FROM community_post p JOIN sys_user u ON u.id=p.user_id
                WHERE p.id=?
                """, userId, userId, postId));
        PostDeleteAccess deleteAccess = postDeleteAccess(metadata, userId);
        result.put("author_role", deleteAccess.authorRole());
        result.put("my_role", deleteAccess.myRole());
        result.put("can_delete", deleteAccess.canDelete());
        result.put("can_attempt_delete", deleteAccess.canAttempt());
        result.put("comments", postComments(userId, postId));
        return result;
    }

    public List<Map<String,Object>> favoritePosts(Long userId) {
        return jdbc.queryForList("""
                SELECT p.id,p.community_id,c.name community_name,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,p.link_url,
                       p.location_name,p.location_address,p.latitude,p.longitude,p.status,p.pinned,p.pinned_at,p.pinned_by,
                       p.quoted_post_id,p.quoted_user_id,p.quoted_nickname,p.quoted_content,p.quoted_images,p.quoted_media_types,p.quoted_media_file_ids,p.quoted_video,
                       p.like_count,p.comment_count,p.created_at,
                       f.created_at favorited_at,u.id user_id,u.nickname,u.avatar_url,
                       EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.id AND l.user_id=?) liked_by_me,
                       TRUE favorited_by_me
                FROM community_post_favorite f
                JOIN community_post p ON p.id=f.post_id
                JOIN community c ON c.id=p.community_id
                JOIN sys_user u ON u.id=p.user_id
                JOIN community_member m ON m.community_id=p.community_id AND m.user_id=? AND m.status='ACTIVE'
                WHERE f.user_id=? AND p.status='PUBLISHED'
                ORDER BY f.created_at DESC LIMIT 100
                """, userId, userId, userId);
    }

    @Transactional
    public void deletePost(Long userId, long postId) {
        Map<String,Object> post = one(
                """
                SELECT p.community_id,p.user_id,p.status,
                       author_member.role author_role,my_member.role my_role
                FROM community_post p
                LEFT JOIN community_member author_member
                       ON author_member.community_id=p.community_id AND author_member.user_id=p.user_id AND author_member.status='ACTIVE'
                LEFT JOIN community_member my_member
                       ON my_member.community_id=p.community_id AND my_member.user_id=? AND my_member.status='ACTIVE'
                WHERE p.id=? FOR UPDATE OF p
                """, userId, postId);
        String previousStatus = String.valueOf(post.get("status"));
        if ("DELETED".equals(previousStatus)) throw new BizException("动态不存在");
        long communityId = number(post.get("community_id"));
        PostDeleteAccess deleteAccess = postDeleteAccess(post, userId);
        if (!deleteAccess.canDelete()) throw new BizException(postDeleteDeniedMessage(deleteAccess));
        int updated = jdbc.update("UPDATE community_post SET status='DELETED',updated_at=NOW() WHERE id=? AND status<>'DELETED'", postId);
        if (updated == 0) throw new BizException("动态不存在");
        createNotification(number(post.get("user_id")), userId, communityId, postId, null,
                "POST_DELETED", "你的圈子动态已被删除", "你的动态因圈子管理操作已被删除");
        if ("PUBLISHED".equals(previousStatus)) {
            jdbc.update("UPDATE community SET post_count=GREATEST(post_count-1,0),updated_at=NOW() WHERE id=?", communityId);
        }
    }

    @Transactional
    public Map<String,Object> setPostPinned(Long userId, long postId, boolean pinned) {
        Map<String,Object> post = one("""
                SELECT p.id,p.community_id,p.user_id,p.status,p.pinned
                FROM community_post p WHERE p.id=? FOR UPDATE
                """, postId);
        long communityId = number(post.get("community_id"));
        requireManager(userId, communityId);
        if (!"PUBLISHED".equals(String.valueOf(post.get("status")))) throw new BizException("只能置顶已发布的动态");
        boolean previous = Boolean.TRUE.equals(post.get("pinned"));
        if (previous != pinned) {
            jdbc.update("""
                    UPDATE community_post
                    SET pinned=?,pinned_at=CASE WHEN ? THEN NOW() ELSE NULL END,pinned_by=?,updated_at=NOW()
                    WHERE id=? AND status='PUBLISHED'
                    """, pinned, pinned, userId, postId);
            createNotification(number(post.get("user_id")), userId, communityId, postId, null,
                    pinned ? "POST_PINNED" : "POST_UNPINNED",
                    pinned ? "你的圈子动态已被置顶" : "你的圈子动态已取消置顶",
                    pinned ? "圈主或管理员置顶了你的动态" : "圈主或管理员取消置顶了你的动态");
        }
        return Map.of("pinned", pinned);
    }

    @Transactional
    public Map<String,Object> publish(Long userId,long id,Map<String,Object>b){
        Map<String,Object> c=one("SELECT post_mode,status FROM community WHERE id=?",id);
        Map<String,Object> m=one("""
                SELECT role,status,muted_until,
                       (muted_until IS NOT NULL AND muted_until>NOW()) muted_now
                FROM community_member WHERE community_id=? AND user_id=?
                """,id,userId);
        if(Boolean.TRUE.equals(m.get("muted_now"))) throw new BizException("你已被禁言，暂时无法发布动态");
        String memberStatus=String.valueOf(m.get("status"));
        if("MUTED".equals(memberStatus)) {
            int restored=jdbc.update("""
                    UPDATE community_member SET status='ACTIVE',muted_until=NULL
                    WHERE community_id=? AND user_id=? AND status='MUTED'
                      AND (muted_until IS NULL OR muted_until<=NOW())
                    """,id,userId);
            if(restored==0) throw new BizException("你已被禁言，暂时无法发布动态");
            memberStatus="ACTIVE";
        }
        if(!"ACTIVE".equals(memberStatus)) throw new BizException("你不是圈子成员");
        String role=String.valueOf(m.get("role")), mode=String.valueOf(c.get("post_mode"));
        if("ADMIN_ONLY".equals(mode)&&"MEMBER".equals(role)) throw new BizException("仅管理员可发布");
        String status="REVIEW".equals(mode)&&"MEMBER".equals(role)?"PENDING":"PUBLISHED";
        String content=text(b,"content"); if(!StringUtils.hasText(content)&&b.get("images")==null&&b.get("video")==null) throw new BizException("动态内容不能为空");
        String images=stringNullable(b.get("images")), originalImages=stringNullable(b.get("originalImages")), mediaTypes=stringNullable(b.get("mediaTypes")), mediaFileIds=stringNullable(b.get("mediaFileIds"));
        String video=stringNullable(b.get("video")), linkUrl=stringNullable(b.get("linkUrl"));
        if(!StringUtils.hasText(content)&&!StringUtils.hasText(images)&&!StringUtils.hasText(video)&&!StringUtils.hasText(linkUrl)) throw new BizException("动态内容不能为空");
        if(sensitiveWordService!=null&&StringUtils.hasText(content)) {
            try {
                sensitiveWordService.assertCleanText(content);
            } catch (BizException e) {
                recordRiskEvent(id, userId, null, "SENSITIVE_WORD");
                throw e;
            }
        }
        Long postId=jdbc.queryForObject("""
                INSERT INTO community_post(community_id,user_id,content,images,original_images,media_types,media_file_ids,video,link_url,
                                            location_name,location_address,latitude,longitude,status)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
                """,Long.class,id,userId,content,images,originalImages,mediaTypes,mediaFileIds,video,linkUrl,
                nullable(b.get("locationName")),nullable(b.get("locationAddress")),nullableDouble(b.get("latitude")),nullableDouble(b.get("longitude")),status);
        if("PUBLISHED".equals(status)) jdbc.update("UPDATE community SET post_count=post_count+1 WHERE id=?",id);
        return Map.of("id",postId,"status",status);
    }

    @Transactional
    public Map<String,Object> forwardPost(Long userId, long postId, String opinion) {
        Map<String,Object> original = one("""
                SELECT p.id,p.community_id,p.user_id,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,
                       p.status,c.status community_status,c.post_mode,u.nickname quoted_nickname
                FROM community_post p
                JOIN community c ON c.id=p.community_id
                JOIN sys_user u ON u.id=p.user_id
                WHERE p.id=?
                """, postId);
        if (!"PUBLISHED".equals(String.valueOf(original.get("status")))
                || !"APPROVED".equals(String.valueOf(original.get("community_status")))) {
            throw new BizException("原动态不存在或已删除");
        }
        long communityId = number(original.get("community_id"));
        requireMember(userId, communityId);
        Map<String,Object> member = one("SELECT role,status,muted_until,(muted_until IS NOT NULL AND muted_until>NOW()) muted_now FROM community_member WHERE community_id=? AND user_id=?", communityId, userId);
        if (Boolean.TRUE.equals(member.get("muted_now"))) throw new BizException("你已被禁言，暂时无法转发动态");
        if ("MUTED".equals(String.valueOf(member.get("status")))) {
            int restored = jdbc.update("UPDATE community_member SET status='ACTIVE',muted_until=NULL WHERE community_id=? AND user_id=? AND status='MUTED' AND (muted_until IS NULL OR muted_until<=NOW())", communityId, userId);
            if (restored == 0) throw new BizException("你已被禁言，暂时无法转发动态");
        }
        if (!"ACTIVE".equals(String.valueOf(member.get("status"))) && !"MUTED".equals(String.valueOf(member.get("status")))) {
            throw new BizException("你不是圈子成员");
        }
        String role = String.valueOf(member.get("role"));
        String mode = String.valueOf(original.get("post_mode"));
        if ("ADMIN_ONLY".equals(mode) && "MEMBER".equals(role)) throw new BizException("仅圈主和管理员可以转发动态");
        String normalizedOpinion = opinion == null ? "" : opinion.trim();
        if (normalizedOpinion.length() > 500) throw new BizException("转发看法不能超过500字");
        if (sensitiveWordService != null && StringUtils.hasText(normalizedOpinion)) sensitiveWordService.assertCleanText(normalizedOpinion);
        String status = "REVIEW".equals(mode) && "MEMBER".equals(role) ? "PENDING" : "PUBLISHED";
        Long newId = jdbc.queryForObject("""
                INSERT INTO community_post(community_id,user_id,content,status,quoted_post_id,quoted_user_id,quoted_nickname,
                                           quoted_content,quoted_images,quoted_media_types,quoted_media_file_ids,quoted_video)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
                """, Long.class, communityId, userId, normalizedOpinion, status, postId,
                original.get("user_id"), original.get("quoted_nickname"), original.get("content"),
                original.get("original_images"), original.get("media_types"), original.get("media_file_ids"), original.get("video"));
        if ("PUBLISHED".equals(status)) jdbc.update("UPDATE community SET post_count=post_count+1 WHERE id=?", communityId);
        return Map.of("id", newId, "status", status, "communityId", communityId);
    }

    public Map<String,Object> dashboard(Long userId,long id){
        requireManager(userId,id);
        return new LinkedHashMap<>(one("""
                SELECT c.member_count,c.post_count,
                 (SELECT COUNT(*) FROM community_member WHERE community_id=c.id AND join_time::date=CURRENT_DATE) today_new,
                 (SELECT COUNT(*) FROM community_member WHERE community_id=c.id) cumulative_join,
                 (SELECT COUNT(*) FROM community_member WHERE community_id=c.id AND status='REMOVED') cumulative_exit,
                 (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.status='ACTIVE' AND GREATEST(
                    m.join_time,
                    COALESCE((SELECT MAX(p.created_at) FROM community_post p WHERE p.community_id=c.id AND p.user_id=m.user_id),m.join_time),
                    COALESCE((SELECT MAX(pc.created_at) FROM community_post_comment pc JOIN community_post pp ON pp.id=pc.post_id WHERE pp.community_id=c.id AND pc.user_id=m.user_id),m.join_time),
                    COALESCE((SELECT MAX(pl.created_at) FROM community_post_like pl JOIN community_post pp ON pp.id=pl.post_id WHERE pp.community_id=c.id AND pl.user_id=m.user_id),m.join_time)
                 ) >= NOW()-INTERVAL '30 days') active_members,
                 (SELECT COUNT(*) FROM community_post WHERE community_id=c.id AND status<>'DELETED') post_total,
                 (SELECT COUNT(*) FROM community_post_comment pc JOIN community_post pp ON pp.id=pc.post_id WHERE pp.community_id=c.id AND pc.status='PUBLISHED') comment_total,
                 (SELECT COALESCE(SUM(like_count),0) FROM community_post WHERE community_id=c.id) like_total,
                 (SELECT COUNT(*) FROM community_report r WHERE r.target_type='POST' AND r.target_id IN (SELECT id FROM community_post WHERE community_id=c.id)) report_total,
                 (SELECT COALESCE(SUM(owner_income),0) FROM community_order WHERE community_id=c.id AND status='PAID') income_total,
                 (SELECT COALESCE(SUM(owner_income),0) FROM community_order WHERE community_id=c.id AND status='PAID' AND created_at::date=CURRENT_DATE) income_today,
                 (SELECT COALESCE(wallet_balance,0) FROM sys_user WHERE id=c.owner_id) withdrawable,
                 (SELECT COUNT(*) FROM community_order WHERE community_id=c.id AND status='PAID') order_count
                FROM community c WHERE c.id=?
                """,id));
    }

    public List<Map<String,Object>> dashboardDetails(Long userId,long communityId,String type){
        requireManager(userId,communityId);
        String normalized = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "TOTAL_MEMBERS" -> dashboardMemberRows(communityId,"m.status='ACTIVE'",false);
            case "TODAY_NEW" -> dashboardMemberRows(communityId,"m.join_time::date=CURRENT_DATE",false);
            case "CUMULATIVE_JOIN" -> dashboardMemberRows(communityId,"TRUE",false);
            case "CUMULATIVE_EXIT" -> dashboardMemberRows(communityId,"m.status='REMOVED'",true);
            case "ACTIVE_MEMBERS" -> jdbc.queryForList("""
                    SELECT m.id,m.user_id,m.role,m.status,u.nickname,u.avatar_url,
                           GREATEST(m.join_time,
                             COALESCE(MAX(p.created_at),m.join_time),
                             COALESCE(MAX(pc.created_at),m.join_time),
                             COALESCE(MAX(pl.created_at),m.join_time)) operation_date,
                           '最近活跃' operation_label,'MEMBER' item_type
                    FROM community_member m JOIN sys_user u ON u.id=m.user_id
                    LEFT JOIN community_post p ON p.community_id=m.community_id AND p.user_id=m.user_id
                    LEFT JOIN community_post pp ON pp.community_id=m.community_id
                    LEFT JOIN community_post_comment pc ON pc.post_id=pp.id AND pc.user_id=m.user_id
                    LEFT JOIN community_post_like pl ON pl.post_id=pp.id AND pl.user_id=m.user_id
                    WHERE m.community_id=? AND m.status='ACTIVE'
                    GROUP BY m.id,m.user_id,m.role,m.status,u.nickname,u.avatar_url,m.join_time
                    HAVING GREATEST(m.join_time,COALESCE(MAX(p.created_at),m.join_time),COALESCE(MAX(pc.created_at),m.join_time),COALESCE(MAX(pl.created_at),m.join_time)) >= NOW()-INTERVAL '30 days'
                    ORDER BY operation_date DESC
                    """,communityId);
            case "POSTS" -> jdbc.queryForList("""
                    SELECT p.id,p.community_id,p.user_id,p.content,p.images,p.video,p.status,p.pinned,
                           p.like_count,p.comment_count,p.created_at operation_date,p.created_at,u.nickname,u.avatar_url,
                           '发布动态' operation_label,'POST' item_type
                    FROM community_post p JOIN sys_user u ON u.id=p.user_id
                    WHERE p.community_id=? AND p.status<>'DELETED' ORDER BY p.created_at DESC LIMIT 200
                    """,communityId);
            case "INCOME_TOTAL" -> dashboardOrderRows(communityId,false);
            case "INCOME_TODAY" -> dashboardOrderRows(communityId,true);
            case "ORDERS" -> dashboardOrderRows(communityId,false);
            default -> throw new BizException("数据明细类型无效");
        };
    }

    private List<Map<String,Object>> dashboardMemberRows(long communityId,String condition,boolean exitDate){
        String operationDate = exitDate ? "m.status_updated_at" : "m.join_time";
        String operationLabel = exitDate ? "退出圈子" : "加入圈子";
        return jdbc.queryForList("SELECT m.id,m.user_id,m.role,m.status,u.nickname,u.avatar_url,"+operationDate+" operation_date,'"+operationLabel+"' operation_label,'MEMBER' item_type FROM community_member m JOIN sys_user u ON u.id=m.user_id WHERE m.community_id=? AND "+condition+" ORDER BY operation_date DESC",communityId);
    }

    private List<Map<String,Object>> dashboardOrderRows(long communityId,boolean todayOnly){
        String today = todayOnly ? " AND o.created_at::date=CURRENT_DATE" : "";
        return jdbc.queryForList("SELECT o.id,o.order_no,o.buyer_id,o.amount,o.owner_income,o.status,o.created_at operation_date,u.nickname,u.avatar_url,'支付订单' operation_label,'ORDER' item_type FROM community_order o JOIN sys_user u ON u.id=o.buyer_id WHERE o.community_id=? AND o.status='PAID'"+today+" ORDER BY o.created_at DESC",communityId);
    }

    @Transactional
    public Map<String,Object> toggleLike(Long userId, long postId) {
        Map<String,Object> post = one("SELECT id,community_id FROM community_post WHERE id=? AND status='PUBLISHED'", postId);
        requireMember(userId, number(post.get("community_id")));
        List<Map<String,Object>> existing = jdbc.queryForList("SELECT id FROM community_post_like WHERE post_id=? AND user_id=?", postId, userId);
        boolean liked;
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO community_post_like(post_id,user_id) VALUES(?,?)", postId, userId);
            jdbc.update("UPDATE community_post SET like_count=like_count+1 WHERE id=?", postId);
            liked = true;
            notifyUserForPost(postId, userId, "LIKE", "有人赞了你的圈子动态", "你的动态收到一个赞");
        } else {
            jdbc.update("DELETE FROM community_post_like WHERE post_id=? AND user_id=?", postId, userId);
            jdbc.update("UPDATE community_post SET like_count=GREATEST(like_count-1,0) WHERE id=?", postId);
            liked = false;
        }
        return Map.of("liked", liked, "likeCount", jdbc.queryForObject("SELECT like_count FROM community_post WHERE id=?", Integer.class, postId));
    }

    @Transactional
    public Map<String,Object> comment(Long userId, long postId, String content, Long parentId) {
        if (!StringUtils.hasText(content) || content.trim().length() > 1000) throw new BizException("评论不能为空且不能超过1000字");
        Map<String,Object> post = one("SELECT id,community_id,user_id FROM community_post WHERE id=? AND status='PUBLISHED'", postId);
        long communityId = number(post.get("community_id"));
        requireMember(userId, communityId);
        Map<String,Object> parent = null;
        if (parentId != null) {
            parent = one("SELECT id,user_id FROM community_post_comment WHERE id=? AND post_id=? AND status='PUBLISHED'", parentId, postId);
        }
        String normalizedContent = content.trim();
        Long commentId=jdbc.queryForObject("INSERT INTO community_post_comment(post_id,user_id,parent_id,content) VALUES(?,?,?,?) RETURNING id",Long.class,postId,userId,parentId,normalizedContent);
        jdbc.update("UPDATE community_post SET comment_count=comment_count+1 WHERE id=?", postId);
        long postOwnerId = number(post.get("user_id"));
        if (parent == null) {
            createNotification(postOwnerId, userId, communityId, postId, commentId,
                    "COMMENT", "有人评论了你的圈子动态", normalizedContent);
        } else {
            long replyTargetId = number(parent.get("user_id"));
            createNotification(replyTargetId, userId, communityId, postId, commentId,
                    "REPLY", "有人回复了你的评论", normalizedContent);
            if (postOwnerId != replyTargetId) {
                createNotification(postOwnerId, userId, communityId, postId, commentId,
                        "COMMENT", "有人评论了你的圈子动态", normalizedContent);
            }
        }
        return jdbc.queryForMap("""
                SELECT c.id,c.post_id,c.parent_id,c.content,c.created_at,u.id user_id,u.nickname,u.avatar_url,
                       pu.id reply_to_user_id,pu.nickname reply_to_nickname,0 like_count,FALSE liked_by_me
                FROM community_post_comment c JOIN sys_user u ON u.id=c.user_id
                LEFT JOIN community_post_comment pc ON pc.id=c.parent_id
                LEFT JOIN sys_user pu ON pu.id=pc.user_id WHERE c.id=?
                """,commentId);
    }

    public List<Map<String,Object>> comments(Long userId, long postId) {
        Map<String,Object> post = one("SELECT community_id FROM community_post WHERE id=?", postId);
        requireMember(userId, number(post.get("community_id")));
        return postComments(userId, postId);
    }

    private List<Map<String,Object>> postComments(Long userId, long postId) {
        return jdbc.queryForList("""
                SELECT c.id,c.post_id,c.parent_id,c.content,c.created_at,u.id user_id,u.nickname,u.avatar_url,
                       pu.id reply_to_user_id,pu.nickname reply_to_nickname,
                       (SELECT COUNT(*) FROM community_post_comment_like cl WHERE cl.comment_id=c.id) like_count,
                       EXISTS(SELECT 1 FROM community_post_comment_like cl WHERE cl.comment_id=c.id AND cl.user_id=?) liked_by_me
                FROM community_post_comment c JOIN sys_user u ON u.id=c.user_id
                LEFT JOIN community_post_comment pc ON pc.id=c.parent_id
                LEFT JOIN sys_user pu ON pu.id=pc.user_id
                WHERE c.post_id=? AND c.status='PUBLISHED' ORDER BY c.created_at ASC
                """, userId, postId);
    }

    @Transactional
    public void deleteComment(Long userId, long commentId) {
        Map<String,Object> comment=one("SELECT c.id,c.post_id,c.user_id,p.community_id FROM community_post_comment c JOIN community_post p ON p.id=c.post_id WHERE c.id=? AND c.status='PUBLISHED'",commentId);
        long communityId=number(comment.get("community_id"));
        boolean allowed=number(comment.get("user_id"))==userId || hasMemberPermission(userId, communityId, "COMMENTS");
        if(!allowed) throw new BizException("无权删除评论");
        jdbc.update("UPDATE community_post_comment SET status='DELETED' WHERE id=?",commentId);
        jdbc.update("UPDATE community_post SET comment_count=GREATEST(comment_count-1,0) WHERE id=?",comment.get("post_id"));
    }

    @Transactional
    public Map<String,Object> toggleCommentLike(Long userId, long commentId) {
        Map<String,Object> comment = one("""
                SELECT c.id,c.user_id,c.post_id,p.community_id
                FROM community_post_comment c JOIN community_post p ON p.id=c.post_id
                WHERE c.id=? AND c.status='PUBLISHED' AND p.status='PUBLISHED'
                """, commentId);
        long communityId = number(comment.get("community_id"));
        requireMember(userId, communityId);
        List<Map<String,Object>> existing = jdbc.queryForList(
                "SELECT id FROM community_post_comment_like WHERE comment_id=? AND user_id=?", commentId, userId);
        boolean liked;
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO community_post_comment_like(comment_id,user_id) VALUES(?,?)", commentId, userId);
            liked = true;
            createNotification(number(comment.get("user_id")), userId, communityId,
                    number(comment.get("post_id")), commentId,
                    "COMMENT_LIKE", "有人赞了你的评论", "你的评论收到一个赞");
        } else {
            jdbc.update("DELETE FROM community_post_comment_like WHERE comment_id=? AND user_id=?", commentId, userId);
            liked = false;
        }
        Long likeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM community_post_comment_like WHERE comment_id=?", Long.class, commentId);
        return Map.of("liked", liked, "likeCount", likeCount == null ? 0 : likeCount);
    }

    @Transactional
    public Map<String,Object> toggleFavorite(Long userId, long postId) {
        Map<String,Object> post = one("SELECT id,community_id FROM community_post WHERE id=? AND status='PUBLISHED'", postId);
        requireMember(userId, number(post.get("community_id")));
        List<Map<String,Object>> existing = jdbc.queryForList("SELECT id FROM community_post_favorite WHERE post_id=? AND user_id=?", postId, userId);
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO community_post_favorite(post_id,user_id) VALUES(?,?)", postId, userId);
            return Map.of("favorited", true);
        }
        jdbc.update("DELETE FROM community_post_favorite WHERE post_id=? AND user_id=?", postId, userId);
        return Map.of("favorited", false);
    }

    @Transactional
    public void moderatePostByManager(Long userId, long postId, String status) {
        if (!Set.of("PUBLISHED", "BLOCKED", "DELETED").contains(status)) throw new BizException("动态状态无效");
        Map<String,Object> post=one("""
                SELECT p.community_id,p.user_id,p.status,
                       author_member.role author_role,my_member.role my_role
                FROM community_post p
                LEFT JOIN community_member author_member
                       ON author_member.community_id=p.community_id AND author_member.user_id=p.user_id AND author_member.status='ACTIVE'
                LEFT JOIN community_member my_member
                       ON my_member.community_id=p.community_id AND my_member.user_id=? AND my_member.status='ACTIVE'
                WHERE p.id=? FOR UPDATE OF p
                """,userId,postId);
        long communityId=number(post.get("community_id"));
        requireMemberPermission(userId, communityId, "CONTENT");
        if ("DELETED".equals(status)) {
            PostDeleteAccess deleteAccess = postDeleteAccess(post, userId);
            if (!deleteAccess.canDelete()) throw new BizException(postDeleteDeniedMessage(deleteAccess));
        }
        String previous=String.valueOf(post.get("status"));
        if ("DELETED".equals(previous)) throw new BizException("动态不存在");
        if (previous.equals(status)) return;
        jdbc.update("UPDATE community_post SET status=?,updated_at=NOW() WHERE id=?",status,postId);
        if ("DELETED".equals(status)) {
            createNotification(number(post.get("user_id")), userId, communityId, postId, null,
                    "POST_DELETED", "你的圈子动态已被删除", "你的动态因圈子管理操作已被删除");
        }
        if (!"PUBLISHED".equals(previous) && "PUBLISHED".equals(status)) jdbc.update("UPDATE community SET post_count=post_count+1 WHERE id=?",communityId);
        if ("PUBLISHED".equals(previous) && !"PUBLISHED".equals(status)) jdbc.update("UPDATE community SET post_count=GREATEST(post_count-1,0) WHERE id=?",communityId);
    }

    @Transactional
    public void report(Long userId, String targetType, long targetId, String reason, String detail) {
        report(userId, targetType, targetId, reason, detail, null, null);
    }

    @Transactional
    public void report(Long userId, String targetType, long targetId, String reasonCode, String detail,
                       Object evidenceUrls, Object evidenceTypes) {
        String normalizedTargetType = targetType == null ? "" : targetType.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("COMMUNITY", "POST", "COMMENT", "USER").contains(normalizedTargetType)) {
            throw new BizException("举报对象无效");
        }
        String rawReason = reasonCode == null ? "" : reasonCode.trim();
        List<Map<String,Object>> reasons = jdbc.queryForList("""
                SELECT code FROM community_report_reason
                WHERE enabled=TRUE AND (UPPER(code)=? OR name=?)
                ORDER BY id LIMIT 1
                """, rawReason.toUpperCase(Locale.ROOT), rawReason);
        if (reasons.isEmpty()) throw new BizException("请选择有效的举报理由");
        String normalizedDetail = detail == null ? null : detail.trim();
        if (normalizedDetail != null && normalizedDetail.length() > 500) throw new BizException("举报备注不能超过500字");

        Map<String,Object> reportTarget = reportTarget(normalizedTargetType, targetId);
        List<String> urls = evidenceValues(evidenceUrls, "凭证地址");
        List<String> types = evidenceValues(evidenceTypes, "凭证类型");
        if (urls.size() > 9) throw new BizException("举报凭证不能超过9个");
        for (String url : urls) if (url.length() > 2000) throw new BizException("举报凭证地址过长");
        if (!types.isEmpty() && types.size() != urls.size()) throw new BizException("举报凭证类型与文件数量不一致");
        if (types.isEmpty() && !urls.isEmpty()) {
            types = urls.stream().map(CommunityService::inferEvidenceType).toList();
        }
        List<String> normalizedTypes = new ArrayList<>(types.size());
        for (String type : types) {
            String normalized = type.trim().toLowerCase(Locale.ROOT);
            if (!Set.of("image", "video").contains(normalized)) throw new BizException("举报凭证仅支持图片或视频");
            normalizedTypes.add(normalized);
        }
        jdbc.update("""
                INSERT INTO community_report(reporter_id,target_type,target_id,reason,detail,evidence_urls,evidence_types)
                VALUES(?,?,?,?,?,?,?)
                """, userId, normalizedTargetType, targetId, reasons.getFirst().get("code"),
                StringUtils.hasText(normalizedDetail) ? normalizedDetail : null,
                jsonOrNull(urls), jsonOrNull(normalizedTypes));
        notifyReportManagers(userId, reportTarget, String.valueOf(reasons.getFirst().get("code")), normalizedDetail);
    }

    private Map<String,Object> reportTarget(String targetType, long targetId) {
        List<Map<String,Object>> rows = switch (targetType) {
            case "COMMUNITY" -> jdbc.queryForList("SELECT id FROM community WHERE id=?", targetId);
            case "POST" -> jdbc.queryForList("""
                    SELECT p.id post_id,p.user_id post_author_id,p.community_id,c.name community_name,p.content post_content
                    FROM community_post p JOIN community c ON c.id=p.community_id WHERE p.id=?
                    """, targetId);
            case "COMMENT" -> jdbc.queryForList("""
                    SELECT cmt.id comment_id,p.id post_id,p.user_id post_author_id,p.community_id,
                           c.name community_name,p.content post_content
                    FROM community_post_comment cmt
                    JOIN community_post p ON p.id=cmt.post_id
                    JOIN community c ON c.id=p.community_id
                    WHERE cmt.id=?
                    """, targetId);
            case "USER" -> jdbc.queryForList("SELECT id FROM sys_user WHERE id=?", targetId);
            default -> List.of();
        };
        if (rows.isEmpty()) throw new BizException("举报对象不存在或已删除");
        return rows.getFirst();
    }

    private void notifyReportManagers(Long reporterId, Map<String,Object> target, String reason, String detail) {
        if (!target.containsKey("community_id")) return;
        long communityId = number(target.get("community_id"));
        Long postId = target.get("post_id") == null ? null : number(target.get("post_id"));
        String communityName = String.valueOf(target.getOrDefault("community_name", "圈子"));
        String excerpt = truncateCodePoints(String.valueOf(target.getOrDefault("post_content", "")), 80);
        String reasonName = jdbc.queryForObject("SELECT name FROM community_report_reason WHERE code=?", String.class, reason);
        String content = "圈子“" + communityName + "”收到新的动态举报，请及时处理。原因：" + (StringUtils.hasText(reasonName) ? reasonName : reason);
        if (StringUtils.hasText(excerpt)) content += "，动态：" + excerpt;
        if (StringUtils.hasText(detail)) content += "，备注：" + truncateCodePoints(detail, 120);
        List<Long> managers = jdbc.queryForList("""
                SELECT user_id FROM community_member
                WHERE community_id=? AND role IN ('OWNER','ADMIN') AND status IN ('ACTIVE','MUTED')
                ORDER BY (role='OWNER') DESC,user_id
                """, Long.class, communityId);
        for (Long managerId : managers) {
            createNotification(managerId, reporterId, communityId, postId, null,
                    "REPORT_CREATED", "圈子收到新的动态举报", content);
        }
    }

    public List<Map<String,Object>> notifications(Long userId) {
        return jdbc.queryForList("""
                SELECT n.id,n.user_id,n.community_id,c.name community_name,n.post_id,n.comment_id,n.actor_id,
                       a.nickname actor_nickname,a.avatar_url actor_avatar,am.role actor_role,
                       CASE WHEN NULLIF(BTRIM(p.content),'') IS NOT NULL THEN LEFT(p.content,80)
                            WHEN NULLIF(BTRIM(p.video),'') IS NOT NULL THEN '[视频动态]'
                            WHEN NULLIF(BTRIM(p.images),'') IS NOT NULL AND p.images<>'[]' THEN '[图片动态]'
                            ELSE NULL END post_excerpt,
                       n.type,n.title,n.content,
                       (n.read_at IS NULL) unread,n.read_at,n.created_at
                FROM community_notification n
                LEFT JOIN community c ON c.id=n.community_id
                LEFT JOIN sys_user a ON a.id=n.actor_id
                LEFT JOIN community_member am ON am.community_id=n.community_id AND am.user_id=n.actor_id
                LEFT JOIN community_post p ON p.id=n.post_id
                WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100
                """, userId);
    }
    public Map<String,Object> notificationUnreadCount(Long userId) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM community_notification WHERE user_id=? AND read_at IS NULL", Long.class, userId);
        return Map.of("unreadCount", count == null ? 0 : count);
    }
    @Transactional public void markNotificationsRead(Long userId) { jdbc.update("UPDATE community_notification SET read_at=NOW() WHERE user_id=? AND read_at IS NULL", userId); }

    @Transactional
    public void deleteNotification(Long userId, long notificationId) {
        int deleted = jdbc.update("DELETE FROM community_notification WHERE id=? AND user_id=?", notificationId, userId);
        if (deleted == 0) throw new BizException("圈子消息不存在或已删除");
    }

    public List<Map<String,Object>> members(Long userId, long communityId, String keyword) {
        requireManager(userId, communityId);
        String q = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        if (q == null) {
            return jdbc.queryForList("""
                    SELECT m.id,m.user_id,m.role,m.permissions,m.status,m.muted_until,m.join_time,m.status_updated_at,u.nickname,u.avatar_url
                    FROM community_member m JOIN sys_user u ON u.id=m.user_id
                    WHERE m.community_id=?
                    ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,m.join_time ASC
                    """, communityId);
        }
        return jdbc.queryForList("""
                SELECT m.id,m.user_id,m.role,m.permissions,m.status,m.muted_until,m.join_time,m.status_updated_at,u.nickname,u.avatar_url
                FROM community_member m JOIN sys_user u ON u.id=m.user_id
                WHERE m.community_id=? AND (u.nickname ILIKE ? OR u.phone ILIKE ?)
                ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,m.join_time ASC
                """, communityId,q,q);
    }
    public List<Map<String,Object>> members(Long userId, long communityId, String keyword, String status) {
        if(!StringUtils.hasText(status)) return members(userId,communityId,keyword);
        requireManager(userId, communityId);
        String memberStatus=status.trim().toUpperCase(Locale.ROOT);
        if(!Set.of("ACTIVE","MUTED","REMOVED").contains(memberStatus)) throw new BizException("成员状态无效");
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        if(q==null) return jdbc.queryForList("""
                SELECT m.id,m.user_id,m.role,m.permissions,m.status,m.muted_until,m.join_time,m.status_updated_at,u.nickname,u.avatar_url
                FROM community_member m JOIN sys_user u ON u.id=m.user_id
                WHERE m.community_id=? AND m.status=?
                ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,m.join_time ASC
                """,communityId,memberStatus);
        return jdbc.queryForList("""
                SELECT m.id,m.user_id,m.role,m.permissions,m.status,m.muted_until,m.join_time,m.status_updated_at,u.nickname,u.avatar_url
                FROM community_member m JOIN sys_user u ON u.id=m.user_id
                WHERE m.community_id=? AND m.status=? AND (u.nickname ILIKE ? OR u.phone ILIKE ?)
                ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,m.join_time ASC
                """,communityId,memberStatus,q,q);
    }

    public List<Map<String,Object>> adminMembers(long communityId, String keyword, String status) {
        one("SELECT id FROM community WHERE id=?", communityId);
        String memberStatus = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : "ACTIVE";
        if (!Set.of("ACTIVE", "MUTED", "REMOVED").contains(memberStatus)) throw new BizException("成员状态无效");
        String q = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        StringBuilder sql = new StringBuilder("""
                SELECT m.id,m.user_id,m.role,m.permissions,m.status,m.muted_until,m.join_time,m.status_updated_at,
                       u.nickname,u.phone,u.pulse_id,u.avatar_url
                FROM community_member m JOIN sys_user u ON u.id=m.user_id
                WHERE m.community_id=? AND m.status=?
                """);
        List<Object> args = new ArrayList<>(List.of(communityId, memberStatus));
        if (q != null) {
            sql.append(" AND (u.nickname ILIKE ? OR u.phone ILIKE ? OR u.pulse_id ILIKE ?)");
            args.add(q);
            args.add(q);
            args.add(q);
        }
        sql.append(" ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,m.join_time ASC,m.id ASC LIMIT 500");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    @Transactional public void setMemberStatus(Long userId, long communityId, long memberId, String status) {
        setMemberStatus(userId,communityId,memberId,status,"");
    }
    @Transactional public void setMemberStatus(Long userId, long communityId, long memberId, String status,String reason) {
        setMemberStatus(userId, communityId, memberId, status, reason, "", "");
    }
    @Transactional public void setMemberStatus(Long userId, long communityId, long memberId, String status, String reason, String reasonCode, String reasonDetail) {
        requireMemberPermission(userId, communityId, "MEMBERS");
        if (!Set.of("ACTIVE", "REMOVED", "MUTED").contains(status)) throw new BizException("成员状态无效");
        Map<String,Object> member = one("""
                SELECT m.user_id,m.status previous_status,c.name community_name
                FROM community_member m JOIN community c ON c.id=m.community_id
                WHERE m.id=? AND m.community_id=? AND m.role<>'OWNER'
                """, memberId, communityId);
        int n = jdbc.update("UPDATE community_member SET status=?,muted_until=CASE WHEN ?='MUTED' THEN NOW()+INTERVAL '7 days' ELSE NULL END,status_updated_at=NOW() WHERE id=? AND community_id=? AND role<>'OWNER'", status, status, memberId, communityId);
        if (n == 0) throw new BizException("成员不存在或无法操作");
        jdbc.update("UPDATE community SET member_count=(SELECT COUNT(*) FROM community_member WHERE community_id=? AND status='ACTIVE') WHERE id=?", communityId, communityId);
        if ("REMOVED".equals(status)) {
            String removalReason = resolveMemberRemovalReason(reasonCode, reasonDetail, reason);
            jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) VALUES(?,?,'REMOVED',?,?)",communityId,member.get("user_id"),removalReason,userId);
            createNotification(number(member.get("user_id")), userId, communityId, null, null,
                    "MEMBER_REMOVED", "你已被移出圈子", "你已被移出圈子“" + member.get("community_name") + "”");
        } else if ("MUTED".equals(status) && !"MUTED".equals(String.valueOf(member.get("previous_status")))) {
            createNotification(number(member.get("user_id")), userId, communityId, null, null,
                    "MEMBER_MUTED", "你已被圈子禁言", "你在圈子“" + member.get("community_name") + "”中已被禁言 7 天");
        }
    }

    public List<Map<String,Object>> joinRequests(Long userId,long communityId){
        requireManager(userId,communityId);
        return jdbc.queryForList("""
                SELECT r.id,r.user_id,r.status,r.created_at,r.updated_at,r.reviewed_at,
                       u.nickname,u.avatar_url
                FROM community_join_request r JOIN sys_user u ON u.id=r.user_id
                WHERE r.community_id=? AND r.status IN('PENDING','APPROVED')
                ORDER BY (r.status='PENDING') DESC,r.created_at ASC
                """,communityId);
    }

    @Transactional
    public Map<String,Object> leaveCommunity(Long userId,long communityId,String reason){
        if(!StringUtils.hasText(reason)) throw new BizException("请填写退出原因");
        if(reason.trim().length()>500) throw new BizException("退出原因不能超过500字");
        Map<String,Object> member=one("""
                SELECT m.id,m.role,m.status,c.leave_review_required,c.name
                FROM community_member m JOIN community c ON c.id=m.community_id
                WHERE m.community_id=? AND m.user_id=? FOR UPDATE
                """,communityId,userId);
        if("OWNER".equals(member.get("role"))) throw new BizException("圈主请先转让圈主后再退出，或解散圈子");
        if(!Set.of("ACTIVE","MUTED").contains(String.valueOf(member.get("status")))) throw new BizException("你当前不在该圈子中");
        if(Boolean.TRUE.equals(member.get("leave_review_required"))){
            jdbc.update("""
                    INSERT INTO community_leave_request(community_id,user_id,reason,status) VALUES(?,?,?,'PENDING')
                    ON CONFLICT(community_id,user_id) DO UPDATE SET reason=EXCLUDED.reason,status='PENDING',reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW()
                    """,communityId,userId,reason.trim());
            return Map.of("left",false,"pendingApproval",true);
        }
        jdbc.update("UPDATE community_member SET status='REMOVED',muted_until=NULL,status_updated_at=NOW() WHERE id=?",member.get("id"));
        jdbc.update("UPDATE community SET member_count=(SELECT COUNT(*) FROM community_member WHERE community_id=? AND status='ACTIVE'),updated_at=NOW() WHERE id=?",communityId,communityId);
        jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) VALUES(?,?,'LEAVE',?,?)",communityId,userId,reason.trim(),userId);
        return Map.of("left",true,"pendingApproval",false);
    }

    public List<Map<String,Object>> leaveRequests(Long userId,long communityId){
        requireManager(userId,communityId);
        return jdbc.queryForList("""
                SELECT r.id,r.user_id,r.reason,r.status,r.created_at,r.reviewed_at,u.nickname,u.avatar_url
                FROM community_leave_request r JOIN sys_user u ON u.id=r.user_id
                WHERE r.community_id=? AND r.status='PENDING' ORDER BY r.created_at ASC
                """,communityId);
    }

    @Transactional
    public void reviewLeaveRequest(Long userId,long communityId,long requestId,String status,String reviewReason){
        requireManager(userId,communityId);
        String normalized=status==null?"":status.trim().toUpperCase(Locale.ROOT);
        if(!Set.of("APPROVED","REJECTED").contains(normalized)) throw new BizException("审核状态无效");
        Map<String,Object> request=one("SELECT * FROM community_leave_request WHERE id=? AND community_id=? FOR UPDATE",requestId,communityId);
        if(!"PENDING".equals(request.get("status"))) throw new BizException("该退出申请已处理");
        jdbc.update("UPDATE community_leave_request SET status=?,reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=?",normalized,userId,requestId);
        if("APPROVED".equals(normalized)){
            jdbc.update("UPDATE community_member SET status='REMOVED',muted_until=NULL,status_updated_at=NOW() WHERE community_id=? AND user_id=? AND role<>'OWNER'",communityId,request.get("user_id"));
            jdbc.update("UPDATE community SET member_count=(SELECT COUNT(*) FROM community_member WHERE community_id=? AND status='ACTIVE'),updated_at=NOW() WHERE id=?",communityId,communityId);
            String reason=String.valueOf(request.get("reason"));
            if(StringUtils.hasText(reviewReason)) reason=reason+"；审核备注："+reviewReason.trim();
            jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) VALUES(?,?,'LEAVE_APPROVED',?,?)",communityId,request.get("user_id"),reason,userId);
        }
        createNotification(number(request.get("user_id")),userId,communityId,null,null,
                "APPROVED".equals(normalized)?"LEAVE_APPROVED":"LEAVE_REJECTED",
                "退出圈子申请"+("APPROVED".equals(normalized)?"已通过":"未通过"),
                "APPROVED".equals(normalized)?"你的退出申请已通过":"你的退出申请未通过");
    }

    @Transactional
    public void transferOwnership(Long userId,long communityId,long newOwnerId,String reason){
        requireOwner(userId,communityId);
        if(userId==newOwnerId) throw new BizException("该成员已经是圈主");
        if(!StringUtils.hasText(reason)) throw new BizException("请填写转让原因");
        if(reason.trim().length()>500) throw new BizException("转让原因不能超过500字");
        Map<String,Object> target=one("SELECT id,role FROM community_member WHERE community_id=? AND user_id=? AND status='ACTIVE' FOR UPDATE",communityId,newOwnerId);
        jdbc.update("UPDATE community_member SET role='ADMIN',permissions='CONTENT,MEMBERS,COMMENTS',status_updated_at=NOW() WHERE community_id=? AND user_id=? AND role='OWNER'",communityId,userId);
        jdbc.update("UPDATE community_member SET role='OWNER',permissions='',status_updated_at=NOW() WHERE id=?",target.get("id"));
        jdbc.update("UPDATE community SET owner_id=?,updated_at=NOW() WHERE id=?",newOwnerId,communityId);
        jdbc.update("INSERT INTO community_owner_transfer_log(community_id,previous_owner_id,new_owner_id,reason,operator_id,operator_type) VALUES(?,?,?,?,?,?)",communityId,userId,newOwnerId,reason.trim(),userId,"USER");
        createNotification(newOwnerId,userId,communityId,null,null,"OWNER_TRANSFERRED","你已成为圈主","原圈主已将圈子转让给你");
    }

    @Transactional
    public void adminTransferOwnership(long communityId, long newOwnerId, String reason, Long adminId) {
        if (adminId == null) throw new BizException("管理员登录已失效");
        if (!StringUtils.hasText(reason)) throw new BizException("请填写转让原因");
        String normalizedReason = reason.trim();
        if (normalizedReason.length() > 500) throw new BizException("转让原因不能超过500字");

        Map<String,Object> community = one("SELECT id,name,owner_id,status FROM community WHERE id=? FOR UPDATE", communityId);
        if ("DISSOLVED".equals(String.valueOf(community.get("status")))) throw new BizException("已删除的圈子不能更换圈主");
        long previousOwnerId = number(community.get("owner_id"));
        if (previousOwnerId == newOwnerId) throw new BizException("该成员已经是圈主");

        List<Map<String,Object>> targets = jdbc.queryForList(
                "SELECT id FROM community_member WHERE community_id=? AND user_id=? AND status='ACTIVE' FOR UPDATE",
                communityId, newOwnerId);
        if (targets.isEmpty()) throw new BizException("新圈主必须是该圈子的正常成员");

        int demoted = jdbc.update("""
                UPDATE community_member
                   SET role='ADMIN',permissions='CONTENT,MEMBERS,COMMENTS',status_updated_at=NOW()
                 WHERE community_id=? AND user_id=? AND role='OWNER'
                """, communityId, previousOwnerId);
        if (demoted == 0) throw new BizException("原圈主成员记录不存在");
        jdbc.update("UPDATE community_member SET role='OWNER',permissions='',status_updated_at=NOW() WHERE id=?",
                targets.getFirst().get("id"));
        jdbc.update("UPDATE community SET owner_id=?,updated_at=NOW() WHERE id=?", newOwnerId, communityId);
        jdbc.update("""
                INSERT INTO community_owner_transfer_log
                    (community_id,previous_owner_id,new_owner_id,reason,operator_id,operator_type)
                VALUES (?,?,?,?,?,?)
                """, communityId, previousOwnerId, newOwnerId, normalizedReason, adminId, "ADMIN");
        createNotification(newOwnerId, previousOwnerId, communityId, null, null,
                "OWNER_TRANSFERRED", "你已成为圈主", "管理员已将圈子转让给你");
    }

    @Transactional
    public void dissolveCommunity(Long userId,long communityId,String reason){
        requireOwner(userId,communityId);
        if(!StringUtils.hasText(reason)) throw new BizException("请填写解散原因");
        if(reason.trim().length()>500) throw new BizException("解散原因不能超过500字");
        Map<String,Object> community=one("SELECT name,member_count,status FROM community WHERE id=? FOR UPDATE",communityId);
        jdbc.update("INSERT INTO community_dissolve_log(community_id,community_name,owner_id,reason,operator_id,operator_type,member_count) VALUES(?,?,?,?,?,?,?)",communityId,community.get("name"),userId,reason.trim(),userId,"USER",community.get("member_count"));
        jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) SELECT community_id,user_id,'DISSOLVED',?,? FROM community_member WHERE community_id=? AND status IN('ACTIVE','MUTED')",reason.trim(),userId,communityId);
        jdbc.update("UPDATE community_member SET status='REMOVED',muted_until=NULL,status_updated_at=NOW() WHERE community_id=?",communityId);
        jdbc.update("UPDATE community SET status='DISSOLVED',member_count=0,updated_at=NOW() WHERE id=?",communityId);
        recordCommunityStatusEvent(communityId, String.valueOf(community.get("status")), "DISSOLVED");
    }

    @Transactional
    public void reviewJoinRequest(Long userId,long communityId,long requestId,String status){
        requireManager(userId,communityId);
        String normalized=status==null?"":status.trim().toUpperCase(Locale.ROOT);
        if(!Set.of("APPROVED","REJECTED").contains(normalized)) throw new BizException("审核状态无效");
        Map<String,Object> request=one("SELECT r.user_id,r.status,c.name FROM community_join_request r JOIN community c ON c.id=r.community_id WHERE r.id=? AND r.community_id=? FOR UPDATE",requestId,communityId);
        if(!"PENDING".equals(request.get("status"))) throw new BizException("该申请已处理");
        jdbc.update("UPDATE community_join_request SET status=?,reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=?",normalized,userId,requestId);
        createNotification(number(request.get("user_id")),userId,communityId,null,null,
                "APPROVED".equals(normalized)?"JOIN_APPROVED":"JOIN_REJECTED",
                "APPROVED".equals(normalized)?"进圈申请已通过":"进圈申请未通过",
                "圈子“"+request.get("name")+"”的加入申请"+("APPROVED".equals(normalized)?"已通过，请返回圈子完成加入":"已被拒绝"));
    }
    @Transactional public void setAdmin(Long userId, long communityId, long memberId, boolean admin) {
        requireOwner(userId, communityId);
        Map<String,Object> member = one("""
                SELECT m.user_id,m.role,c.name community_name
                FROM community_member m JOIN community c ON c.id=m.community_id
                WHERE m.id=? AND m.community_id=? AND m.role<>'OWNER'
                """, memberId, communityId);
        int n = jdbc.update("UPDATE community_member SET role=? WHERE id=? AND community_id=? AND role<>'OWNER'", admin ? "ADMIN" : "MEMBER", memberId, communityId);
        if (n == 0) throw new BizException("成员不存在或无法操作");
        String nextRole = admin ? "ADMIN" : "MEMBER";
        if (!nextRole.equals(member.get("role"))) {
            createNotification(number(member.get("user_id")), userId, communityId, null, null,
                    admin ? "ADMIN_SET" : "ADMIN_UNSET", "圈子身份已变更",
                    admin ? "你已被设为圈子“" + member.get("community_name") + "”的管理员"
                            : "你在圈子“" + member.get("community_name") + "”的管理员身份已被取消");
        }
    }

    @Transactional
    public void setPermissions(Long userId, long communityId, long memberId, Collection<?> rawPermissions) {
        requireOwner(userId, communityId);
        Set<String> allowed = Set.of("CONTENT", "MEMBERS", "COMMENTS");
        LinkedHashSet<String> permissions = new LinkedHashSet<>();
        if (rawPermissions != null) {
            for (Object value : rawPermissions) {
                String permission = String.valueOf(value).trim().toUpperCase(Locale.ROOT);
                if (allowed.contains(permission)) permissions.add(permission);
            }
        }
        int n = jdbc.update("UPDATE community_member SET permissions=? WHERE id=? AND community_id=? AND role='ADMIN'", String.join(",", permissions), memberId, communityId);
        if (n == 0) throw new BizException("仅管理员可以配置权限");
    }

    @Transactional
    public Map<String,Object> updateCommunity(Long userId, long communityId, Map<String,Object> body) {
        requireOwner(userId, communityId);
        String name=normalizeCommunityNickname(text(body,"name")), description=text(body,"description"), rules=text(body,"rules");
        String avatar=stringNullable(body.get("avatar"));
        String announcement=body.containsKey("announcement")?text(body,"announcement"):null;
        if (description.length()>500 || rules.length()>2000) throw new BizException("圈子介绍或规则过长");
        if (announcement!=null && announcement.length()>2000) throw new BizException("圈子公告不能超过2000字");
        String postMode=upper(body,"postMode","ALL");
        if (!Set.of("ALL","REVIEW","ADMIN_ONLY").contains(postMode)) throw new BizException("发布模式无效");
        boolean joinReviewRequired=Boolean.parseBoolean(String.valueOf(body.getOrDefault("joinReviewRequired",false)));
        boolean leaveReviewRequired=Boolean.parseBoolean(String.valueOf(body.getOrDefault("leaveReviewRequired",false)));
        Map<String,Object> current=one("SELECT name,avatar FROM community WHERE id=? FOR UPDATE",communityId);
        boolean changedName=!Objects.equals(name,String.valueOf(current.get("name")));
        boolean changedAvatar=!Objects.equals(avatar,stringNullable(current.get("avatar")));
        jdbc.update("UPDATE community SET description=?,rules=?,announcement=COALESCE(?,announcement),post_mode=?,join_review_required=?,leave_review_required=?,updated_at=NOW() WHERE id=?",
                description,rules,announcement,postMode,joinReviewRequired,leaveReviewRequired,communityId);
        if(changedName||changedAvatar){
            List<Map<String,Object>> pending=jdbc.queryForList("SELECT id FROM community_profile_review WHERE community_id=? AND status='PENDING' FOR UPDATE",communityId);
            if(pending.isEmpty()){
                jdbc.update("INSERT INTO community_profile_review(community_id,applicant_id,proposed_name,proposed_avatar,changed_name,changed_avatar) VALUES(?,?,?,?,?,?)",
                        communityId,userId,name,avatar,changedName,changedAvatar);
            }else{
                jdbc.update("UPDATE community_profile_review SET applicant_id=?,proposed_name=?,proposed_avatar=?,changed_name=?,changed_avatar=?,reject_reason=NULL,updated_at=NOW() WHERE id=?",
                        userId,name,avatar,changedName,changedAvatar,number(pending.getFirst().get("id")));
            }
        }else{
            jdbc.update("DELETE FROM community_profile_review WHERE community_id=? AND status='PENDING'",communityId);
        }
        return Map.of("profileReviewPending",changedName||changedAvatar);
    }

    public Map<String,Object> adminPosts(String status, String keyword, int page, int size) {
        int p=Math.max(1,page), s=Math.min(100,Math.max(1,size)); String state=StringUtils.hasText(status)?status.trim():null; String q=StringUtils.hasText(keyword)?"%"+keyword+"%":null;
        var items=jdbc.queryForList("""
                SELECT p.id,p.community_id,p.content,p.images,p.original_images,p.media_types,p.media_file_ids,p.video,
                       p.status,p.like_count,p.comment_count,p.created_at,c.name community_name,u.nickname
                FROM community_post p JOIN community c ON c.id=p.community_id JOIN sys_user u ON u.id=p.user_id
                WHERE ((CAST(? AS TEXT) IS NULL AND p.status<>'DELETED')
                       OR (CAST(? AS TEXT) IS NOT NULL AND p.status=CAST(? AS TEXT)))
                  AND (CAST(? AS TEXT) IS NULL OR p.content ILIKE CAST(? AS TEXT) OR c.name ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))
                ORDER BY p.created_at DESC LIMIT ? OFFSET ?
                """,state,state,state,q,q,q,q,s,(p-1)*s);
        Long total=jdbc.queryForObject("SELECT COUNT(*) FROM community_post p JOIN community c ON c.id=p.community_id JOIN sys_user u ON u.id=p.user_id WHERE ((CAST(? AS TEXT) IS NULL AND p.status<>'DELETED') OR (CAST(? AS TEXT) IS NOT NULL AND p.status=CAST(? AS TEXT))) AND (CAST(? AS TEXT) IS NULL OR p.content ILIKE CAST(? AS TEXT) OR c.name ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))",Long.class,state,state,state,q,q,q,q);
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }
    @Transactional public void moderatePost(long id, String status) {
        if(!Set.of("PUBLISHED","BLOCKED","DELETED").contains(status)) throw new BizException("内容状态无效");
        Map<String,Object> post = one("SELECT community_id,user_id,status FROM community_post WHERE id=? FOR UPDATE", id);
        String previous = String.valueOf(post.get("status"));
        if (previous.equals(status)) return;
        int n=jdbc.update("UPDATE community_post SET status=?,updated_at=NOW() WHERE id=?",status,id);
        if(n==0) throw new BizException("动态不存在");
        if ("PUBLISHED".equals(previous) && !"PUBLISHED".equals(status)) {
            jdbc.update("UPDATE community SET post_count=GREATEST(post_count-1,0) WHERE id=?", number(post.get("community_id")));
        } else if (!"PUBLISHED".equals(previous) && "PUBLISHED".equals(status)) {
            jdbc.update("UPDATE community SET post_count=post_count+1 WHERE id=?", number(post.get("community_id")));
        }
        if ("BLOCKED".equals(status)) recordRiskEvent(number(post.get("community_id")), number(post.get("user_id")), id, "BLOCKED_POST");
    }
    public Map<String,Object> adminReports(String status, String keyword, String targetType, int page, int size) {
        String state=StringUtils.hasText(status)?status.trim():null;
        String target=StringUtils.hasText(targetType)?targetType.trim().toUpperCase(Locale.ROOT):null;
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size));
        var items=jdbc.queryForList("""
                SELECT r.id,r.reporter_id,r.target_type,r.target_id,r.reason,r.reason reason_code,
                       COALESCE(rr.name,CASE r.reason
                           WHEN 'PORN' THEN '色情低俗' WHEN 'FRAUD' THEN '欺诈诈骗'
                           WHEN 'AD' THEN '广告骚扰' WHEN 'VIOLENCE' THEN '暴力血腥'
                           WHEN 'ILLEGAL' THEN '违法违规' WHEN 'OTHER' THEN '其他'
                           ELSE r.reason END) reason_name,
                        r.detail,r.evidence_urls,r.evidence_types,r.status,r.handled_by,r.handled_at,r.created_at,
                        u.nickname reporter_name,
                        COALESCE(report_community.id,rp.community_id,rcp.community_id) community_id,
                        report_community.name community_name,
                        COALESCE(rp.id,rcp.id) post_id,
                        COALESCE(rp.content,rcp.content) post_content,
                        COALESCE(rp.status,rcp.status) post_status,
                        COALESCE(rp.user_id,rcp.user_id) post_author_id,
                        post_author.nickname post_author_name,
                        COALESCE(rp.images,rcp.images) post_images,
                        COALESCE(rp.video,rcp.video) post_video,
                        COALESCE(rp.created_at,rcp.created_at) post_created_at
                FROM community_report r
                JOIN sys_user u ON u.id=r.reporter_id
                LEFT JOIN community_report_reason rr ON rr.code=r.reason
                LEFT JOIN community c ON r.target_type='COMMUNITY' AND c.id=r.target_id
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                LEFT JOIN community report_community ON report_community.id=COALESCE(c.id,rp.community_id,rcp.community_id)
                LEFT JOIN sys_user post_author ON post_author.id=COALESCE(rp.user_id,rcp.user_id)
                WHERE (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.target_type=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.detail ILIKE CAST(? AS TEXT)
                       OR r.reason ILIKE CAST(? AS TEXT) OR rr.name ILIKE CAST(? AS TEXT)
                        OR u.nickname ILIKE CAST(? AS TEXT) OR report_community.name ILIKE CAST(? AS TEXT)
                        OR rp.content ILIKE CAST(? AS TEXT) OR rcp.content ILIKE CAST(? AS TEXT)
                        OR post_author.nickname ILIKE CAST(? AS TEXT)
                        OR CAST(r.target_id AS TEXT) ILIKE CAST(? AS TEXT))
                ORDER BY r.created_at DESC LIMIT ? OFFSET ?
                """,state,state,target,target,q,q,q,q,q,q,q,q,q,q,s,(p-1)*s);
        Long total=jdbc.queryForObject("""
                SELECT COUNT(*) FROM community_report r
                JOIN sys_user u ON u.id=r.reporter_id
                LEFT JOIN community_report_reason rr ON rr.code=r.reason
                LEFT JOIN community c ON r.target_type='COMMUNITY' AND c.id=r.target_id
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                LEFT JOIN community report_community ON report_community.id=COALESCE(c.id,rp.community_id,rcp.community_id)
                LEFT JOIN sys_user post_author ON post_author.id=COALESCE(rp.user_id,rcp.user_id)
                WHERE (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.target_type=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.detail ILIKE CAST(? AS TEXT)
                       OR r.reason ILIKE CAST(? AS TEXT) OR rr.name ILIKE CAST(? AS TEXT)
                        OR u.nickname ILIKE CAST(? AS TEXT) OR report_community.name ILIKE CAST(? AS TEXT)
                        OR rp.content ILIKE CAST(? AS TEXT) OR rcp.content ILIKE CAST(? AS TEXT)
                        OR post_author.nickname ILIKE CAST(? AS TEXT)
                        OR CAST(r.target_id AS TEXT) ILIKE CAST(? AS TEXT))
                """,Long.class,state,state,target,target,q,q,q,q,q,q,q,q,q,q);
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    public Map<String,Object> managerReports(Long userId, long communityId, String status, String keyword, int page, int size) {
        requireManager(userId, communityId);
        String state = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : null;
        String q = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        int p = Math.max(1, page), s = Math.min(100, Math.max(1, size));
        var items = jdbc.queryForList("""
                SELECT r.id,r.target_type,r.target_id,r.reason,r.reason reason_code,
                       COALESCE(rr.name,CASE r.reason
                           WHEN 'PORN' THEN '色情低俗' WHEN 'FRAUD' THEN '欺诈诈骗'
                           WHEN 'AD' THEN '广告骚扰' WHEN 'VIOLENCE' THEN '暴力血腥'
                           WHEN 'ILLEGAL' THEN '违法违规' WHEN 'OTHER' THEN '其他'
                           ELSE r.reason END) reason_name,
                       r.detail,r.status,r.created_at,reporter.nickname reporter_name,
                       COALESCE(rp.id,rcp.id) post_id,
                       COALESCE(rp.content,rcp.content) post_content,
                       COALESCE(rp.status,rcp.status) post_status,
                       COALESCE(rp.user_id,rcp.user_id) post_author_id,
                       post_author.nickname post_author_name,
                       COALESCE(rp.images,rcp.images) post_images,
                       COALESCE(rp.video,rcp.video) post_video,
                       COALESCE(rp.created_at,rcp.created_at) post_created_at
                FROM community_report r
                JOIN sys_user reporter ON reporter.id=r.reporter_id
                LEFT JOIN community_report_reason rr ON rr.code=r.reason
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                LEFT JOIN community report_community ON report_community.id=COALESCE(rp.community_id,rcp.community_id)
                LEFT JOIN sys_user post_author ON post_author.id=COALESCE(rp.user_id,rcp.user_id)
                WHERE report_community.id=?
                  AND r.target_type IN ('POST','COMMENT')
                  AND (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.detail ILIKE CAST(? AS TEXT)
                       OR r.reason ILIKE CAST(? AS TEXT) OR rr.name ILIKE CAST(? AS TEXT)
                       OR reporter.nickname ILIKE CAST(? AS TEXT)
                       OR rp.content ILIKE CAST(? AS TEXT) OR rcp.content ILIKE CAST(? AS TEXT)
                       OR post_author.nickname ILIKE CAST(? AS TEXT)
                       OR CAST(r.target_id AS TEXT) ILIKE CAST(? AS TEXT))
                ORDER BY r.created_at DESC LIMIT ? OFFSET ?
                """,communityId,state,state,q,q,q,q,q,q,q,q,q,s,(p-1)*s);
        Long total = jdbc.queryForObject("""
                SELECT COUNT(*) FROM community_report r
                JOIN sys_user reporter ON reporter.id=r.reporter_id
                LEFT JOIN community_report_reason rr ON rr.code=r.reason
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                LEFT JOIN community report_community ON report_community.id=COALESCE(rp.community_id,rcp.community_id)
                LEFT JOIN sys_user post_author ON post_author.id=COALESCE(rp.user_id,rcp.user_id)
                WHERE report_community.id=?
                  AND r.target_type IN ('POST','COMMENT')
                  AND (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR r.detail ILIKE CAST(? AS TEXT)
                       OR r.reason ILIKE CAST(? AS TEXT) OR rr.name ILIKE CAST(? AS TEXT)
                       OR reporter.nickname ILIKE CAST(? AS TEXT)
                       OR rp.content ILIKE CAST(? AS TEXT) OR rcp.content ILIKE CAST(? AS TEXT)
                       OR post_author.nickname ILIKE CAST(? AS TEXT)
                       OR CAST(r.target_id AS TEXT) ILIKE CAST(? AS TEXT))
                """,Long.class,communityId,state,state,q,q,q,q,q,q,q,q,q);
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    @Transactional
    public void moderateManagerReportedPost(Long userId, long communityId, long reportId, String status) {
        requireManager(userId, communityId);
        Map<String,Object> report = one("""
                SELECT r.target_type,COALESCE(rp.id,rcp.id) post_id
                FROM community_report r
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                WHERE r.id=? AND COALESCE(rp.community_id,rcp.community_id)=?
                """,reportId,communityId);
        if (!Set.of("POST", "COMMENT").contains(String.valueOf(report.get("target_type"))) || report.get("post_id") == null) {
            throw new BizException("该举报不是本圈动态或评论");
        }
        moderatePostByManager(userId, number(report.get("post_id")), status);
        handleReport(reportId, "RESOLVED", userId);
    }
    @Transactional public void handleReport(long id, String status, Long adminId) {
        if(!Set.of("RESOLVED","REJECTED").contains(status)) throw new BizException("举报处理状态无效");
        int updated = jdbc.update("UPDATE community_report SET status=?,handled_by=?,handled_at=NOW() WHERE id=?",status,adminId,id);
        if (updated == 0) throw new BizException("举报记录不存在或已被删除");
    }

    @Transactional
    public void moderateReportedPost(long reportId, String status, Long adminId) {
        Map<String,Object> report = one("""
                SELECT r.target_type,COALESCE(rp.id,rcp.id) post_id
                FROM community_report r
                LEFT JOIN community_post rp ON r.target_type='POST' AND rp.id=r.target_id
                LEFT JOIN community_post_comment rc ON r.target_type='COMMENT' AND rc.id=r.target_id
                LEFT JOIN community_post rcp ON r.target_type='COMMENT' AND rcp.id=rc.post_id
                WHERE r.id=? FOR UPDATE
                """, reportId);
        String targetType = String.valueOf(report.get("target_type"));
        if (!Set.of("POST", "COMMENT").contains(targetType) || report.get("post_id") == null) {
            throw new BizException("该举报不是圈子动态或评论");
        }
        moderatePost(number(report.get("post_id")), status);
        handleReport(reportId, "RESOLVED", adminId);
    }

    @Transactional
    public void adminDeleteCommunity(long communityId, String reason, Long adminId) {
        if (!StringUtils.hasText(reason)) throw new BizException("请填写删除圈子的原因");
        String normalizedReason = reason.trim();
        if (normalizedReason.length() > 500) throw new BizException("删除原因不能超过500字");
        Map<String,Object> community = one("SELECT id,name,owner_id,member_count,status FROM community WHERE id=? FOR UPDATE", communityId);
        if ("DISSOLVED".equals(String.valueOf(community.get("status")))) throw new BizException("圈子已删除");
        jdbc.update("INSERT INTO community_dissolve_log(community_id,community_name,owner_id,reason,operator_id,operator_type,member_count) VALUES(?,?,?,?,?,?,?)",
                communityId, community.get("name"), community.get("owner_id"), normalizedReason, adminId, "ADMIN", community.get("member_count"));
        jdbc.update("INSERT INTO community_member_event(community_id,user_id,event_type,reason,operator_id) SELECT community_id,user_id,'DISSOLVED',?,? FROM community_member WHERE community_id=? AND status IN('ACTIVE','MUTED')",
                normalizedReason, adminId, communityId);
        jdbc.update("UPDATE community_post SET status='DELETED',updated_at=NOW() WHERE community_id=? AND status<>'DELETED'", communityId);
        jdbc.update("UPDATE community_member SET status='REMOVED',muted_until=NULL,status_updated_at=NOW() WHERE community_id=?", communityId);
        jdbc.update("UPDATE community_join_request SET status='REJECTED',reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE community_id=? AND status='PENDING'", adminId, communityId);
        jdbc.update("UPDATE community_leave_request SET status='REJECTED',reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE community_id=? AND status='PENDING'", adminId, communityId);
        jdbc.update("UPDATE community SET status='DISSOLVED',member_count=0,post_count=0,updated_at=NOW() WHERE id=?", communityId);
        recordCommunityStatusEvent(communityId, String.valueOf(community.get("status")), "DISSOLVED");
    }

    private boolean isMember(Long uid,long cid){ return uid!=null && !jdbc.queryForList("SELECT 1 FROM community_member WHERE community_id=? AND user_id=? AND status='ACTIVE'",cid,uid).isEmpty(); }
    private void requireMemberPermission(Long uid,long cid,String permission){
        if(hasMemberPermission(uid,cid,permission)) return;
        throw new BizException("无权操作成员");
    }
    private boolean hasMemberPermission(Long uid,long cid,String permission){
        return !jdbc.queryForList("SELECT 1 FROM community_member WHERE community_id=? AND user_id=? AND status='ACTIVE' AND (role='OWNER' OR (role='ADMIN' AND (permissions LIKE ? OR permissions LIKE ? OR permissions LIKE ?)))",cid,uid,"%"+permission+"%",permission+",%","%,"+permission).isEmpty();
    }
    private Map<String,Object> withPostDeleteAccess(Map<String,Object> row, Long currentUserId) {
        Map<String,Object> result = new LinkedHashMap<>(row);
        PostDeleteAccess access = postDeleteAccess(result, currentUserId);
        result.put("author_role", access.authorRole());
        result.put("my_role", access.myRole());
        result.put("can_delete", access.canDelete());
        result.put("can_attempt_delete", access.canAttempt());
        return result;
    }
    private PostDeleteAccess postDeleteAccess(Map<String,Object> row, Long currentUserId) {
        long authorId = number(row.get("user_id"));
        String authorRole = normalizedMemberRole(row.get("author_role"), "MEMBER");
        String myRole = normalizedMemberRole(row.get("my_role"), "");
        boolean authoredByMe = currentUserId != null && authorId == currentUserId;
        boolean owner = "OWNER".equals(myRole);
        boolean admin = "ADMIN".equals(myRole);
        boolean protectedAuthor = "OWNER".equals(authorRole) || "ADMIN".equals(authorRole);
        boolean canAttempt = authoredByMe || owner || admin;
        return new PostDeleteAccess(authoredByMe || owner || (admin && !protectedAuthor), canAttempt, authorRole, myRole);
    }
    private String normalizedMemberRole(Object value, String fallback) {
        String role = value == null ? "" : String.valueOf(value).trim().toUpperCase(Locale.ROOT);
        return Set.of("OWNER", "ADMIN", "MEMBER").contains(role) ? role : fallback;
    }
    private String postDeleteDeniedMessage(PostDeleteAccess access) {
        if ("ADMIN".equals(access.myRole()) && "OWNER".equals(access.authorRole())) return "管理员不能删除圈主的动态";
        if ("ADMIN".equals(access.myRole()) && "ADMIN".equals(access.authorRole())) return "管理员不能删除其他管理员的动态";
        return "无权删除该动态";
    }
    private record PostDeleteAccess(boolean canDelete, boolean canAttempt, String authorRole, String myRole) {}
    private void requireMember(Long uid,long cid){ if(!isMember(uid,cid)) throw new BizException("请先加入圈子"); }

    public Map<String,Object> adminList(String status,String keyword,String type,Long topicId,int page,int size){
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size)); String state=StringUtils.hasText(status)?status.trim():null; String q=StringUtils.hasText(keyword)?"%"+keyword+"%":null;
        String category=StringUtils.hasText(type)?type.trim().toUpperCase(Locale.ROOT):null;
        var items=jdbc.queryForList("""
                SELECT c.id,c.name,c.avatar,c.announcement,c.type,c.price,c.platform_rate,c.status,c.reject_reason,c.member_count,c.post_count,c.created_at,
                       t.name topic,u.nickname owner_name FROM community c
                LEFT JOIN community_topic t ON t.id=c.topic_id JOIN sys_user u ON u.id=c.owner_id
                WHERE (CAST(? AS TEXT) IS NULL OR c.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.type=CAST(? AS TEXT))
                  AND (CAST(? AS BIGINT) IS NULL OR c.topic_id=CAST(? AS BIGINT))
                ORDER BY c.created_at DESC LIMIT ? OFFSET ?
                """,state,state,q,q,q,category,category,topicId,topicId,s,(p-1)*s);
        Long total=jdbc.queryForObject("""
                SELECT COUNT(*) FROM community c JOIN sys_user u ON u.id=c.owner_id
                WHERE (CAST(? AS TEXT) IS NULL OR c.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT) OR u.nickname ILIKE CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.type=CAST(? AS TEXT))
                  AND (CAST(? AS BIGINT) IS NULL OR c.topic_id=CAST(? AS BIGINT))
                """,Long.class,state,state,q,q,q,category,category,topicId,topicId);
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    public Map<String,Object> adminOrders(String status,String keyword,int page,int size){
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size));
        String state=StringUtils.hasText(status)?status.trim().toUpperCase(Locale.ROOT):null;
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        String where="""
                WHERE (CAST(? AS TEXT) IS NULL OR o.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR o.order_no ILIKE CAST(? AS TEXT)
                       OR c.name ILIKE CAST(? AS TEXT)
                       OR buyer.nickname ILIKE CAST(? AS TEXT)
                       OR buyer.phone ILIKE CAST(? AS TEXT)
                       OR buyer.pulse_id ILIKE CAST(? AS TEXT)
                       OR owner.nickname ILIKE CAST(? AS TEXT))
                """;
        List<Object> baseArgs=new ArrayList<>(Arrays.asList(state,state,q,q,q,q,q,q,q));
        List<Map<String,Object>> items=jdbc.queryForList("""
                SELECT o.id,o.order_no,o.community_id,c.name community_name,c.type community_type,
                       o.buyer_id,buyer.nickname buyer_name,buyer.phone buyer_phone,buyer.pulse_id buyer_pulse_id,
                       c.owner_id,owner.nickname owner_name,o.amount,o.platform_fee,o.owner_income,
                       o.platform_rate,o.status,o.created_at
                FROM community_order o
                JOIN community c ON c.id=o.community_id
                JOIN sys_user buyer ON buyer.id=o.buyer_id
                JOIN sys_user owner ON owner.id=c.owner_id
                """+where+" ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?",
                appendArgs(baseArgs,s,(p-1)*s));
        Long total=jdbc.queryForObject("""
                SELECT COUNT(*) FROM community_order o
                JOIN community c ON c.id=o.community_id
                JOIN sys_user buyer ON buyer.id=o.buyer_id
                JOIN sys_user owner ON owner.id=c.owner_id
                """+where,Long.class,baseArgs.toArray());
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    public Map<String,Object> adminIncomeDetails(String keyword,int page,int size){
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size));
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        String where="""
                WHERE (CAST(? AS TEXT) IS NULL OR o.order_no ILIKE CAST(? AS TEXT)
                       OR c.name ILIKE CAST(? AS TEXT)
                       OR buyer.nickname ILIKE CAST(? AS TEXT)
                       OR buyer.phone ILIKE CAST(? AS TEXT)
                       OR buyer.pulse_id ILIKE CAST(? AS TEXT)
                       OR owner.nickname ILIKE CAST(? AS TEXT)
                       OR owner.phone ILIKE CAST(? AS TEXT)
                       OR owner.pulse_id ILIKE CAST(? AS TEXT))
                """;
        List<Object> baseArgs=new ArrayList<>(Arrays.asList(q,q,q,q,q,q,q,q,q));
        List<Map<String,Object>> items=jdbc.queryForList("""
                SELECT i.id,i.owner_id,owner.nickname owner_name,owner.phone owner_phone,owner.pulse_id owner_pulse_id,
                       i.community_id,c.name community_name,i.order_id,o.order_no,o.buyer_id,
                       buyer.nickname buyer_name,buyer.phone buyer_phone,buyer.pulse_id buyer_pulse_id,
                       o.amount order_amount,o.platform_fee,o.owner_income,i.amount income_amount,
                       i.type,i.created_at
                FROM community_income i
                JOIN community_order o ON o.id=i.order_id
                JOIN community c ON c.id=i.community_id
                JOIN sys_user owner ON owner.id=i.owner_id
                JOIN sys_user buyer ON buyer.id=o.buyer_id
                """+where+" ORDER BY i.created_at DESC,i.id DESC LIMIT ? OFFSET ?",
                appendArgs(baseArgs,s,(p-1)*s));
        Long total=jdbc.queryForObject("""
                SELECT COUNT(*) FROM community_income i
                JOIN community_order o ON o.id=i.order_id
                JOIN community c ON c.id=i.community_id
                JOIN sys_user owner ON owner.id=i.owner_id
                JOIN sys_user buyer ON buyer.id=o.buyer_id
                """+where,Long.class,baseArgs.toArray());
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    private static Object[] appendArgs(List<Object> args,Object...tail){
        List<Object> result=new ArrayList<>(args);
        result.addAll(Arrays.asList(tail));
        return result.toArray();
    }

    public Map<String,Object> adminDetail(long id) {
        Map<String,Object> detail = new LinkedHashMap<>(one("""
                SELECT c.id,c.name,c.avatar,c.description,c.rules,c.announcement,c.topic_id,c.type,c.price,c.platform_rate,
                       c.join_review_required,c.leave_review_required,c.post_mode,c.status,c.reject_reason,
                       c.member_count,c.post_count,c.created_at,c.updated_at,
                       t.name topic,u.id owner_id,u.nickname owner_name,u.phone owner_phone,
                       u.pulse_id owner_pulse_id,u.avatar_url owner_avatar,
                       (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.status='ACTIVE') active_member_count,
                       (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.status='MUTED') muted_member_count,
                       (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.status='REMOVED') exited_member_count,
                       (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.role='ADMIN' AND m.status='ACTIVE') admin_count,
                       (SELECT COUNT(*) FROM community_join_request r WHERE r.community_id=c.id AND r.status='PENDING') pending_join_count,
                       (SELECT COUNT(*) FROM community_leave_request r WHERE r.community_id=c.id AND r.status='PENDING') pending_leave_count,
                       (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.status<>'DELETED') total_post_count,
                       (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.status='PUBLISHED') published_post_count,
                       (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.status='PENDING') pending_post_count,
                       (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.status='PUBLISHED' AND p.pinned=TRUE) pinned_post_count,
                       (SELECT COUNT(*) FROM community_order o WHERE o.community_id=c.id AND o.status='PAID') order_count,
                       (SELECT COALESCE(SUM(o.amount),0) FROM community_order o WHERE o.community_id=c.id AND o.status='PAID') paid_amount,
                       (SELECT COALESCE(SUM(o.platform_fee),0) FROM community_order o WHERE o.community_id=c.id AND o.status='PAID') platform_income,
                       (SELECT COALESCE(SUM(o.owner_income),0) FROM community_order o WHERE o.community_id=c.id AND o.status='PAID') owner_income,
                       (SELECT COUNT(*) FROM community_member m WHERE m.community_id=c.id AND m.join_time::date=CURRENT_DATE) today_join_count,
                       (SELECT COUNT(*) FROM community_post p WHERE p.community_id=c.id AND p.created_at::date=CURRENT_DATE AND p.status<>'DELETED') today_post_count
                FROM community c
                LEFT JOIN community_topic t ON t.id=c.topic_id
                JOIN sys_user u ON u.id=c.owner_id
                WHERE c.id=?
                """, id));

        detail.put("recent_members", jdbc.queryForList("""
                SELECT m.id,m.user_id,m.role,m.status,m.permissions,m.muted_until,m.join_time,m.status_updated_at,
                       u.nickname,u.phone,u.pulse_id,u.avatar_url
                FROM community_member m JOIN sys_user u ON u.id=m.user_id
                WHERE m.community_id=?
                ORDER BY (m.role='OWNER') DESC,(m.role='ADMIN') DESC,
                         (m.status IN ('ACTIVE','MUTED')) DESC,m.join_time DESC
                LIMIT 100
                """, id));
        detail.put("recent_posts", jdbc.queryForList("""
                SELECT p.id,p.user_id,p.content,p.status,p.pinned,p.like_count,p.comment_count,p.created_at,
                       u.nickname,u.avatar_url
                FROM community_post p JOIN sys_user u ON u.id=p.user_id
                WHERE p.community_id=?
                ORDER BY p.created_at DESC LIMIT 50
                """, id));
        detail.put("profile_reviews", jdbc.queryForList("""
                SELECT r.id,r.proposed_name,r.proposed_avatar,r.changed_name,r.changed_avatar,r.status,
                       r.reject_reason,r.created_at,r.reviewed_at,applicant.nickname applicant_name,
                       reviewer.username reviewer_name
                FROM community_profile_review r
                JOIN sys_user applicant ON applicant.id=r.applicant_id
                LEFT JOIN sys_admin reviewer ON reviewer.id=r.reviewed_by
                WHERE r.community_id=? ORDER BY r.created_at DESC LIMIT 50
                """, id));
        detail.put("member_events", jdbc.queryForList("""
                SELECT history.id,history.user_id,history.event_type,history.reason,history.occurred_at,
                       member.nickname member_name,operator.nickname operator_name
                FROM (
                    SELECT e.id,e.user_id,e.event_type,e.reason,e.occurred_at,e.operator_id
                    FROM community_member_event e
                    WHERE e.community_id=?
                    UNION ALL
                    SELECT -m.id,m.user_id,'JOIN','历史成员数据补录',m.join_time,NULL
                    FROM community_member m
                    WHERE m.community_id=? AND m.join_time IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM community_member_event e WHERE e.community_id=m.community_id AND e.user_id=m.user_id AND e.event_type='JOIN')
                    UNION ALL
                    SELECT -m.id * 1000000 - 1,m.user_id,'REMOVED','历史成员数据补录',COALESCE(m.status_updated_at,m.join_time),NULL
                    FROM community_member m
                    WHERE m.community_id=? AND m.status='REMOVED'
                      AND COALESCE(m.status_updated_at,m.join_time) IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM community_member_event e WHERE e.community_id=m.community_id AND e.user_id=m.user_id AND e.event_type IN ('LEAVE','LEAVE_APPROVED','REMOVED','DISSOLVED'))
                ) history
                LEFT JOIN sys_user member ON member.id=history.user_id
                LEFT JOIN sys_user operator ON operator.id=history.operator_id
                ORDER BY history.occurred_at DESC LIMIT 100
                """, id,id,id));
        detail.put("owner_transfers", jdbc.queryForList("""
                SELECT l.id,l.reason,l.created_at,previous.nickname previous_owner_name,
                       next.nickname new_owner_name,
                       COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) operator_name
                FROM community_owner_transfer_log l
                LEFT JOIN sys_user previous ON previous.id=l.previous_owner_id
                LEFT JOIN sys_user next ON next.id=l.new_owner_id
                LEFT JOIN sys_user operator_user ON l.operator_type='USER' AND operator_user.id=l.operator_id
                LEFT JOIN sys_admin operator_admin ON l.operator_type='ADMIN' AND operator_admin.id=l.operator_id
                WHERE l.community_id=? ORDER BY l.created_at DESC LIMIT 50
                """, id));
        return detail;
    }

    @Transactional public void review(long id,String status,String reason){
        if(!Set.of("APPROVED","REJECTED","CLOSED").contains(status)) throw new BizException("审核状态无效");
        Map<String,Object> current = one("SELECT status FROM community WHERE id=? FOR UPDATE", id);
        String previousStatus = String.valueOf(current.get("status"));
        int n=jdbc.update("UPDATE community SET status=?,reject_reason=?,updated_at=NOW() WHERE id=?",status,StringUtils.hasText(reason)?reason:null,id);
        if(n==0) throw new BizException("圈子不存在");
        if (!previousStatus.equals(status)) recordCommunityStatusEvent(id, previousStatus, status);
    }

    public Map<String,Object> adminProfileReviews(String status,String keyword,int page,int size){
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size));
        String state=StringUtils.hasText(status)?status.trim().toUpperCase(Locale.ROOT):null;
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        var items=jdbc.queryForList("""
                SELECT r.id,r.community_id,r.proposed_name,r.proposed_avatar,r.changed_name,r.changed_avatar,
                       r.status,r.reject_reason,r.created_at,r.reviewed_at,c.name current_name,c.avatar current_avatar,
                       u.nickname applicant_name
                FROM community_profile_review r JOIN community c ON c.id=r.community_id
                JOIN sys_user u ON u.id=r.applicant_id
                WHERE (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT)
                       OR u.nickname ILIKE CAST(? AS TEXT) OR r.proposed_name ILIKE CAST(? AS TEXT)
                       OR r.reject_reason ILIKE CAST(? AS TEXT))
                ORDER BY (r.status='PENDING') DESC,r.created_at DESC LIMIT ? OFFSET ?
                """,state,state,q,q,q,q,q,s,(p-1)*s);
        Long total=jdbc.queryForObject("""
                SELECT COUNT(*) FROM community_profile_review r
                JOIN community c ON c.id=r.community_id JOIN sys_user u ON u.id=r.applicant_id
                WHERE (CAST(? AS TEXT) IS NULL OR r.status=CAST(? AS TEXT))
                  AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT)
                       OR u.nickname ILIKE CAST(? AS TEXT) OR r.proposed_name ILIKE CAST(? AS TEXT)
                       OR r.reject_reason ILIKE CAST(? AS TEXT))
                """,Long.class,state,state,q,q,q,q,q);
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    public Map<String,Object> adminCommunityAuditLogs(String type,String keyword,String eventType,int page,int size){
        int p=Math.max(1,page),s=Math.min(100,Math.max(1,size)),offset=(p-1)*s;
        String normalized=type==null?"":type.trim().toUpperCase(Locale.ROOT);
        String q=StringUtils.hasText(keyword)?"%"+keyword.trim()+"%":null;
        String event=StringUtils.hasText(eventType)?eventType.trim().toUpperCase(Locale.ROOT):null;
        List<Map<String,Object>> items;
        Long total;
        if("DISSOLVE".equals(normalized)){
            items=jdbc.queryForList("""
                    SELECT l.id,l.community_id,l.community_name,l.reason,l.member_count,l.created_at,
                           owner.nickname owner_name,
                           COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) operator_name
                    FROM community_dissolve_log l LEFT JOIN sys_user owner ON owner.id=l.owner_id
                    LEFT JOIN sys_user operator_user ON l.operator_type='USER' AND operator_user.id=l.operator_id
                    LEFT JOIN sys_admin operator_admin ON l.operator_type='ADMIN' AND operator_admin.id=l.operator_id
                    WHERE (CAST(? AS TEXT) IS NULL OR l.community_name ILIKE CAST(? AS TEXT)
                           OR l.reason ILIKE CAST(? AS TEXT) OR owner.nickname ILIKE CAST(? AS TEXT)
                           OR COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) ILIKE CAST(? AS TEXT))
                    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
                    """,q,q,q,q,q,s,offset);
            total=jdbc.queryForObject("""
                    SELECT COUNT(*) FROM community_dissolve_log l
                    LEFT JOIN sys_user owner ON owner.id=l.owner_id
                    LEFT JOIN sys_user operator_user ON l.operator_type='USER' AND operator_user.id=l.operator_id
                    LEFT JOIN sys_admin operator_admin ON l.operator_type='ADMIN' AND operator_admin.id=l.operator_id
                    WHERE (CAST(? AS TEXT) IS NULL OR l.community_name ILIKE CAST(? AS TEXT)
                           OR l.reason ILIKE CAST(? AS TEXT) OR owner.nickname ILIKE CAST(? AS TEXT)
                           OR COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) ILIKE CAST(? AS TEXT))
                    """,Long.class,q,q,q,q,q);
        }else if("TRANSFER".equals(normalized)){
            items=jdbc.queryForList("""
                    SELECT l.id,l.community_id,c.name community_name,l.reason,l.created_at,
                           previous.nickname previous_owner_name,next.nickname new_owner_name,
                           COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) operator_name
                    FROM community_owner_transfer_log l LEFT JOIN community c ON c.id=l.community_id
                    LEFT JOIN sys_user previous ON previous.id=l.previous_owner_id
                    LEFT JOIN sys_user next ON next.id=l.new_owner_id
                    LEFT JOIN sys_user operator_user ON l.operator_type='USER' AND operator_user.id=l.operator_id
                    LEFT JOIN sys_admin operator_admin ON l.operator_type='ADMIN' AND operator_admin.id=l.operator_id
                    WHERE (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT)
                           OR l.reason ILIKE CAST(? AS TEXT) OR previous.nickname ILIKE CAST(? AS TEXT)
                           OR next.nickname ILIKE CAST(? AS TEXT)
                           OR COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) ILIKE CAST(? AS TEXT))
                    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
                    """,q,q,q,q,q,q,s,offset);
            total=jdbc.queryForObject("""
                    SELECT COUNT(*) FROM community_owner_transfer_log l
                    LEFT JOIN community c ON c.id=l.community_id
                    LEFT JOIN sys_user previous ON previous.id=l.previous_owner_id
                    LEFT JOIN sys_user next ON next.id=l.new_owner_id
                    LEFT JOIN sys_user operator_user ON l.operator_type='USER' AND operator_user.id=l.operator_id
                    LEFT JOIN sys_admin operator_admin ON l.operator_type='ADMIN' AND operator_admin.id=l.operator_id
                    WHERE (CAST(? AS TEXT) IS NULL OR c.name ILIKE CAST(? AS TEXT)
                           OR l.reason ILIKE CAST(? AS TEXT) OR previous.nickname ILIKE CAST(? AS TEXT)
                           OR next.nickname ILIKE CAST(? AS TEXT)
                           OR COALESCE(operator_admin.nickname,operator_admin.username,operator_user.nickname,operator_user.phone) ILIKE CAST(? AS TEXT))
                    """,Long.class,q,q,q,q,q,q);
        }else if("MEMBER".equals(normalized)){
            String historySql="""
                    WITH history AS (
                        SELECT e.id,e.community_id,c.name community_name,e.user_id,e.event_type,e.reason,e.occurred_at created_at,e.operator_id
                        FROM community_member_event e LEFT JOIN community c ON c.id=e.community_id
                        UNION ALL
                        SELECT -m.id,m.community_id,c.name,m.user_id,'JOIN','历史成员数据补录',m.join_time,NULL
                        FROM community_member m JOIN community c ON c.id=m.community_id
                        WHERE m.join_time IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM community_member_event e WHERE e.community_id=m.community_id AND e.user_id=m.user_id AND e.event_type='JOIN')
                        UNION ALL
                        SELECT -m.id * 1000000 - 1,m.community_id,c.name,m.user_id,'REMOVED','历史成员数据补录',COALESCE(m.status_updated_at,m.join_time),NULL
                        FROM community_member m JOIN community c ON c.id=m.community_id
                        WHERE m.status='REMOVED' AND COALESCE(m.status_updated_at,m.join_time) IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM community_member_event e WHERE e.community_id=m.community_id AND e.user_id=m.user_id AND e.event_type IN ('LEAVE','LEAVE_APPROVED','REMOVED','DISSOLVED'))
                    )
                    """;
            String filter="""
                    WHERE (CAST(? AS TEXT) IS NULL OR history.community_name ILIKE CAST(? AS TEXT)
                           OR history.reason ILIKE CAST(? AS TEXT) OR member.nickname ILIKE CAST(? AS TEXT)
                           OR operator.nickname ILIKE CAST(? AS TEXT))
                           AND (CAST(? AS TEXT) IS NULL OR history.event_type=CAST(? AS TEXT))
                    """;
            items=jdbc.queryForList(historySql+"""
                    SELECT history.id,history.community_id,history.community_name,history.user_id,history.event_type,
                           history.reason,history.created_at,member.nickname member_name,operator.nickname operator_name
                    FROM history
                    LEFT JOIN sys_user member ON member.id=history.user_id
                    LEFT JOIN sys_user operator ON operator.id=history.operator_id
                    """+filter+" ORDER BY history.created_at DESC LIMIT ? OFFSET ?",q,q,q,q,q,event,event,s,offset);
            total=jdbc.queryForObject(historySql+"""
                    SELECT COUNT(*) FROM history
                    LEFT JOIN sys_user member ON member.id=history.user_id
                    LEFT JOIN sys_user operator ON operator.id=history.operator_id
                    """+filter,Long.class,q,q,q,q,q,event,event);
        }else throw new BizException("记录类型无效");
        return Map.of("items",items,"total",total==null?0:total,"page",p,"size",s);
    }

    @Transactional
    public void reviewProfileChange(long reviewId,String status,String reason,Long adminId){
        String normalized=status==null?"":status.trim().toUpperCase(Locale.ROOT);
        if(!Set.of("APPROVED","REJECTED").contains(normalized)) throw new BizException("审核状态无效");
        Map<String,Object> review=one("SELECT * FROM community_profile_review WHERE id=? FOR UPDATE",reviewId);
        if(!"PENDING".equals(review.get("status"))) throw new BizException("该资料变更已处理");
        if("REJECTED".equals(normalized)&&!StringUtils.hasText(reason)) throw new BizException("请填写拒绝原因");
        if("APPROVED".equals(normalized)){
            if (Boolean.TRUE.equals(review.get("changed_name"))) {
                normalizeCommunityNickname(String.valueOf(review.get("proposed_name")));
            }
            jdbc.update("UPDATE community SET name=CASE WHEN ? THEN ? ELSE name END,avatar=CASE WHEN ? THEN ? ELSE avatar END,updated_at=NOW() WHERE id=?",
                    Boolean.TRUE.equals(review.get("changed_name")),review.get("proposed_name"),Boolean.TRUE.equals(review.get("changed_avatar")),review.get("proposed_avatar"),review.get("community_id"));
        }
        jdbc.update("UPDATE community_profile_review SET status=?,reject_reason=?,reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=?",
                normalized,StringUtils.hasText(reason)?reason.trim():null,adminId,reviewId);
        jdbc.update("INSERT INTO community_notification(user_id,community_id,type,title,content) VALUES(?,?,?,?,?)",
                review.get("applicant_id"),review.get("community_id"),
                "APPROVED".equals(normalized)?"PROFILE_APPROVED":"PROFILE_REJECTED",
                "圈子资料审核"+("APPROVED".equals(normalized)?"通过":"未通过"),
                "APPROVED".equals(normalized)?"圈子名称或头像变更已生效":"圈子资料变更未通过："+reason);
    }
    public Map<String,Object> config(){ return one("SELECT platform_rate,updated_at FROM community_config WHERE id=1"); }
    public void config(BigDecimal rate){ if(rate==null||rate.signum()<0||rate.compareTo(BigDecimal.valueOf(100))>0) throw new BizException("平台比例须为0-100"); jdbc.update("UPDATE community_config SET platform_rate=?,updated_at=NOW() WHERE id=1",rate); }

    public void communityRevenueConfig(long communityId, BigDecimal rate) {
        if (rate != null && (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0)) {
            throw new BizException("圈子比例须为0-100");
        }
        int updated = jdbc.update("UPDATE community SET platform_rate=?,updated_at=NOW() WHERE id=?", rate, communityId);
        if (updated == 0) throw new BizException("圈子不存在");
    }

    private String normalizeCommunityNickname(String raw) {
        if (nicknameConfigService != null) {
            return nicknameConfigService.normalizeCommunityNickname(raw);
        }
        String name = raw == null ? "" : raw.trim();
        if (name.length() < 2 || name.length() > 30) {
            throw new BizException("圈子昵称须为2-30个字符");
        }
        if (sensitiveWordService != null) {
            sensitiveWordService.assertCleanNickname(name);
        }
        return name;
    }

    private void requireManager(Long uid,long cid){ if(jdbc.queryForList("SELECT 1 FROM community_member WHERE community_id=? AND user_id=? AND role IN('OWNER','ADMIN') AND status='ACTIVE'",cid,uid).isEmpty()) throw new BizException("无管理权限"); }
    private void requireOwner(Long uid,long cid){ if(jdbc.queryForList("SELECT 1 FROM community_member WHERE community_id=? AND user_id=? AND role='OWNER' AND status='ACTIVE'",cid,uid).isEmpty()) throw new BizException("仅圈主可执行此操作"); }
    private void recordCommunityStatusEvent(long communityId, String fromStatus, String toStatus) {
        jdbc.update("INSERT INTO community_status_event(community_id,from_status,to_status) VALUES(?,?,?)", communityId, fromStatus, toStatus);
    }
    private void recordRiskEvent(long communityId, long userId, Long targetId, String eventType) {
        try {
            if (communityRiskEventService != null) {
                communityRiskEventService.record(communityId, userId, targetId, eventType);
            } else {
                jdbc.update("INSERT INTO community_risk_event(community_id,user_id,target_id,event_type) VALUES(?,?,?,?)",
                        communityId, userId, targetId, eventType);
            }
        } catch (RuntimeException ignored) {
            // 风控记录不能改变原有发帖/审核业务的成功或失败结果。
        }
    }
    private void notifyUserForPost(long postId,long actorId,String type,String title,String content){ List<Map<String,Object>> rows=jdbc.queryForList("SELECT p.user_id,p.community_id FROM community_post p WHERE p.id=?",postId); if(rows.isEmpty())return; createNotification(number(rows.getFirst().get("user_id")),actorId,number(rows.getFirst().get("community_id")),postId,null,type,title,content); }
    private void createNotification(long recipientId,long actorId,long communityId,Long postId,Long commentId,String type,String title,String content){
        if(recipientId==actorId)return;
        String actorName=jdbc.queryForObject("SELECT COALESCE(NULLIF(nickname,''),'用户') FROM sys_user WHERE id=?",String.class,actorId);
        String displayName=StringUtils.hasText(actorName)?actorName:"用户";
        String localizedTitle=switch(type){
            case "LIKE" -> displayName+"赞了你的圈子动态";
            case "COMMENT" -> displayName+"评论了你的圈子动态";
            case "REPLY" -> displayName+"回复了你的评论";
            case "COMMENT_LIKE" -> displayName+"赞了你的评论";
            case "ADMIN_SET" -> displayName+"将你设为圈子管理员";
            case "ADMIN_UNSET" -> displayName+"取消了你的圈子管理员身份";
            case "MEMBER_REMOVED" -> displayName+"将你移出圈子";
            case "POST_PINNED" -> displayName+"置顶了你的圈子动态";
            case "POST_UNPINNED" -> displayName+"取消置顶了你的圈子动态";
            case "POST_DELETED" -> displayName+"删除了你的圈子动态";
            case "MEMBER_MUTED" -> displayName+"将你禁言";
            case "REPORT_CREATED" -> displayName+"举报了圈子动态";
            default -> title;
        };
        jdbc.update("INSERT INTO community_notification(user_id,community_id,post_id,comment_id,actor_id,type,title,content) VALUES(?,?,?,?,?,?,?,?)",recipientId,communityId,postId,commentId,actorId,type,truncateCodePoints(localizedTitle,128),truncateCodePoints(content,500));
    }
    private void walletTx(String no,long uid,String dir,long amount,long peer,String remark){ jdbc.update("INSERT INTO wallet_transaction(trade_no,user_id,direction,trade_type,amount,balance_after,counterparty_user_id,remark) SELECT ?,?,?, 'COMMUNITY_INCOME',?,wallet_balance,?,? FROM sys_user WHERE id=?",no,uid,dir,amount,peer,remark,uid); }

    private static String normalizeReasonCode(String code) {
        String value = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (!value.matches("[A-Z0-9_]{2,32}")) throw new BizException("举报理由标识须为2-32位大写字母、数字或下划线");
        return value;
    }

    private static String normalizeReasonName(String name) {
        String value = name == null ? "" : name.trim();
        if (value.isEmpty() || value.length() > 64) throw new BizException("举报理由名称须为1-64字");
        return value;
    }

    private static String normalizeMemberRemovalReasonCode(String code) {
        String value = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (!value.matches("[A-Z0-9_]{2,32}")) throw new BizException("移除理由标识须为2-32位大写字母、数字或下划线");
        return value;
    }

    private static String normalizeMemberRemovalReasonName(String name) {
        String value = name == null ? "" : name.trim();
        if (value.isEmpty() || value.length() > 64) throw new BizException("移除理由名称须为1-64字");
        return value;
    }

    private String resolveMemberRemovalReason(String reasonCode, String reasonDetail, String legacyReason) {
        if (StringUtils.hasText(reasonCode)) {
            String code = reasonCode.trim().toUpperCase(Locale.ROOT);
            List<Map<String,Object>> rows = jdbc.queryForList(
                    "SELECT name FROM community_member_removal_reason WHERE code=? AND enabled=TRUE", code);
            if (rows.isEmpty()) throw new BizException("请选择有效的移除理由");
            String detail = reasonDetail == null ? "" : reasonDetail.trim();
            if (detail.length() > 200) throw new BizException("补充说明不能超过200字");
            String name = String.valueOf(rows.getFirst().get("name"));
            return detail.isEmpty() ? name : name + "：" + detail;
        }
        String value = legacyReason == null ? "" : legacyReason.trim();
        if (value.length() > 500) throw new BizException("移除原因不能超过500字");
        return StringUtils.hasText(value) ? value : "管理员移除成员";
    }

    private static String truncateCodePoints(String value, int maxCodePoints) {
        if (value == null || value.isEmpty()) return "";
        int count = value.codePointCount(0, value.length());
        if (count <= maxCodePoints) return value;
        return value.substring(0, value.offsetByCodePoints(0, maxCodePoints));
    }

    private static List<String> evidenceValues(Object raw, String label) {
        if (raw == null) return new ArrayList<>();
        List<String> values = new ArrayList<>();
        if (raw instanceof Collection<?> collection) {
            for (Object item : collection) appendEvidenceValue(values, item, label);
            return values;
        }
        String value = String.valueOf(raw).trim();
        if (value.isEmpty()) return values;
        if (value.startsWith("[")) {
            try {
                JsonNode node = JSON.readTree(value);
                if (!node.isArray()) throw new BizException(label + "格式无效");
                for (JsonNode item : node) appendEvidenceValue(values, item.isTextual() ? item.textValue() : null, label);
                return values;
            } catch (BizException e) {
                throw e;
            } catch (Exception e) {
                throw new BizException(label + "格式无效");
            }
        }
        appendEvidenceValue(values, value, label);
        return values;
    }

    private static void appendEvidenceValue(List<String> values, Object raw, String label) {
        String value = raw == null ? "" : String.valueOf(raw).trim();
        if (value.isEmpty()) throw new BizException(label + "不能为空");
        values.add(value);
    }

    private static String inferEvidenceType(String url) {
        String normalized = url.toLowerCase(Locale.ROOT);
        return normalized.matches(".*\\.(mp4|mov|m4v|webm)(\\?.*)?$") ? "video" : "image";
    }

    private static String jsonOrNull(List<String> values) {
        if (values.isEmpty()) return null;
        try {
            return JSON.writeValueAsString(values);
        } catch (Exception e) {
            throw new BizException("举报凭证格式无效");
        }
    }

    private Map<String,Object> one(String sql,Object...args){ var rows=jdbc.queryForList(sql,args); if(rows.isEmpty()) throw new BizException("数据不存在"); return rows.getFirst(); }
    private static String text(Map<String,Object>b,String k){return b.get(k)==null?"":String.valueOf(b.get(k)).trim();}
    private static String upper(Map<String,Object>b,String k,String d){String v=text(b,k);return (v.isEmpty()?d:v).toUpperCase(Locale.ROOT);}
    private static Object nullable(Object v){return v==null||String.valueOf(v).isBlank()?null:String.valueOf(v);}
    private static String stringNullable(Object v){return v==null||String.valueOf(v).isBlank()?null:String.valueOf(v);}
    private static Long nullableLong(Object v){return v==null||String.valueOf(v).isBlank()?null:Long.valueOf(String.valueOf(v));}
    private static Double nullableDouble(Object v){return v==null||String.valueOf(v).isBlank()?null:Double.valueOf(String.valueOf(v));}
    private static long number(Object v){return v==null?0:((Number)v).longValue();}
}
