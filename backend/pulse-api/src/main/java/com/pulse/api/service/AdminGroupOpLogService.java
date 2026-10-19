package com.pulse.api.service;

import com.pulse.api.vo.AdminGroupOpLogVO;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 群聊操作记录：同步群内系统提示消息（msgType=9，不含通话 tip）。
 */
@Service
@RequiredArgsConstructor
public class AdminGroupOpLogService {
    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> list(int page, int size, String keyword, Long conversationId, String opType) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder("""
                WHERE m.msg_type = 9
                  AND c.type = 2
                  AND (m.content IS NULL OR (m.content NOT LIKE '{%' AND m.content NOT LIKE '%"kind"%'))
                """);
        List<Object> args = new ArrayList<>();
        if (conversationId != null && conversationId > 0) {
            where.append(" AND m.conversation_id = ? ");
            args.add(conversationId);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        COALESCE(c.title,'') LIKE ?
                        OR COALESCE(m.content,'') LIKE ?
                        OR COALESCE(u.nickname,'') LIKE ?
                        OR COALESCE(u.phone,'') LIKE ?
                        OR CAST(m.conversation_id AS TEXT) LIKE ?
                     )
                    """);
            for (int i = 0; i < 5; i++) {
                args.add(kw);
            }
        }
        if (StringUtils.hasText(opType)) {
            String type = opType.trim().toLowerCase();
            String like = contentLikeForOpType(type);
            if (like != null) {
                where.append(" AND m.content LIKE ? ");
                args.add(like);
            }
        }

        String from = """
                FROM im_message m
                INNER JOIN im_conversation c ON c.id = m.conversation_id
                LEFT JOIN sys_user u ON u.id = m.from_user_id
                """;
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + from + where, Long.class, args.toArray());
        String listSql = """
                SELECT m.id, m.msg_id, m.conversation_id, c.title AS conversation_title,
                       m.from_user_id AS operator_id, u.nickname AS operator_nickname, u.phone AS operator_phone,
                       m.content, m.send_time
                """ + from + where + " ORDER BY m.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<AdminGroupOpLogVO> list = jdbcTemplate.query(listSql, (rs, i) -> {
            String content = rs.getString("content");
            String type = classifyOpType(content);
            return AdminGroupOpLogVO.builder()
                    .id(rs.getLong("id"))
                    .msgId(rs.getString("msg_id"))
                    .conversationId(rs.getObject("conversation_id") == null ? null : rs.getLong("conversation_id"))
                    .conversationTitle(rs.getString("conversation_title"))
                    .operatorId(rs.getObject("operator_id") == null ? null : rs.getLong("operator_id"))
                    .operatorNickname(rs.getString("operator_nickname"))
                    .operatorPhone(rs.getString("operator_phone"))
                    .opType(type)
                    .opTypeLabel(opTypeLabel(type))
                    .content(content)
                    .createdAt(toOffset(rs.getObject("send_time")))
                    .build();
        }, listArgs.toArray());

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", total == null ? 0 : total);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public int deleteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (clean.isEmpty()) {
            return 0;
        }
        String placeholders = String.join(",", clean.stream().map(id -> "?").toList());
        return jdbcTemplate.update(
                "DELETE FROM im_message WHERE msg_type = 9 AND id IN (" + placeholders + ")",
                clean.toArray()
        );
    }

    private static String contentLikeForOpType(String type) {
        return switch (type) {
            case "owner" -> "%群主%";
            case "admin" -> "%管理员%";
            case "mute" -> "%禁言%";
            case "notice" -> "%群公告%";
            case "title" -> "%群名称%";
            case "avatar" -> "%群头像%";
            case "verify" -> "%加群审核%";
            case "join" -> "%加入了群聊%";
            case "leave" -> "%退出了群聊%";
            case "kick" -> "%被移出群聊%";
            case "create" -> "%群聊已创建%";
            default -> null;
        };
    }

    static String classifyOpType(String content) {
        if (!StringUtils.hasText(content)) {
            return "other";
        }
        if (content.contains("群主")) return "owner";
        if (content.contains("管理员")) return "admin";
        if (content.contains("禁言")) return "mute";
        if (content.contains("群公告")) return "notice";
        if (content.contains("群名称")) return "title";
        if (content.contains("群头像")) return "avatar";
        if (content.contains("加群审核")) return "verify";
        if (content.contains("加入了群聊")) return "join";
        if (content.contains("退出了群聊")) return "leave";
        if (content.contains("被移出群聊")) return "kick";
        if (content.contains("群聊已创建")) return "create";
        return "other";
    }

    static String opTypeLabel(String type) {
        return switch (type == null ? "" : type) {
            case "owner" -> "转让群主";
            case "admin" -> "管理员";
            case "mute" -> "禁言";
            case "notice" -> "群公告";
            case "title" -> "群名称";
            case "avatar" -> "群头像";
            case "verify" -> "加群审核";
            case "join" -> "加入群聊";
            case "leave" -> "退出群聊";
            case "kick" -> "移出群聊";
            case "create" -> "创建群聊";
            default -> "其他";
        };
    }

    private static OffsetDateTime toOffset(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof OffsetDateTime odt) {
            return odt;
        }
        if (value instanceof Timestamp ts) {
            return ts.toInstant().atOffset(ZoneOffset.ofHours(8));
        }
        if (value instanceof java.time.LocalDateTime ldt) {
            return ldt.atOffset(ZoneOffset.ofHours(8));
        }
        return null;
    }
}
