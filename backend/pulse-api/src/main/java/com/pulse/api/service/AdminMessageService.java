package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImFile;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImFileMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.AdminMessageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminMessageService {
    private final JdbcTemplate jdbcTemplate;
    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImFileMapper fileMapper;
    private final ChatFileStorageService chatFileStorageService;
    private final SysUserMapper userMapper;

    /**
     * @param conversationType 1 私聊 / 2 群聊
     */
    public Map<String, Object> listMessages(
            int page,
            int size,
            int conversationType,
            String keyword,
            Long conversationId,
            Long fromUserId,
            Integer msgType,
            String mediaKind,
            String contentKind,
            Boolean recalled,
            Boolean userDeleted
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int type = conversationType == 2 ? 2 : 1;

        StringBuilder where = new StringBuilder(" WHERE c.type = ? ");
        List<Object> args = new ArrayList<>();
        args.add(type);

        if (type == 1) {
            where.append("""
                     AND LEFT(COALESCE(m.client_msg_id, ''), 8) <> 'callrec_'
                     AND COALESCE(m.content, '') !~* '"kind"[[:space:]]*:[[:space:]]*"(voice_call|video_call)"'
                    """);
        }

        if (conversationId != null) {
            where.append(" AND m.conversation_id = ? ");
            args.add(conversationId);
        }
        if (fromUserId != null) {
            where.append(" AND m.from_user_id = ? ");
            args.add(fromUserId);
        }
        String kind = StringUtils.hasText(mediaKind) ? mediaKind.trim().toLowerCase() : "";
        if ("video".equals(kind) || "file".equals(kind)) {
            where.append(" AND m.msg_type = 2 ");
            String videoCond = """
                    (
                        LOWER(COALESCE(m.content, '')) LIKE '%video/%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%"mime":"video%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%"contenttype":"video%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%.mp4%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%.webm%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%.mov%'
                        OR LOWER(COALESCE(m.content, '')) LIKE '%.m4v%'
                        OR EXISTS (
                            SELECT 1 FROM im_file f
                            WHERE f.file_id = m.file_id
                              AND (
                                LOWER(COALESCE(f.content_type, '')) LIKE 'video/%'
                                OR LOWER(COALESCE(f.original_name, '')) ~* '\\.(mp4|webm|mov|m4v|3gp|3gpp)$'
                              )
                        )
                    )
                    """;
            if ("video".equals(kind)) {
                where.append(" AND ").append(videoCond).append(' ');
            } else {
                where.append(" AND NOT ").append(videoCond).append(' ');
            }
        } else if (msgType != null) {
            if (msgType == 6) {
                where.append("""
                        AND (
                            m.msg_type = 6
                            OR (
                                m.msg_type = 0
                                AND COALESCE(m.content, '') ~* '"(latitude|lat)"[[:space:]]*:'
                                AND COALESCE(m.content, '') ~* '"(longitude|lng|lon)"[[:space:]]*:'
                            )
                        )
                        """);
            } else {
                where.append(" AND m.msg_type = ? ");
                args.add(msgType);
            }
        }
        if ("live-location".equalsIgnoreCase(StringUtils.trimWhitespace(contentKind))) {
            where.append(" AND LEFT(COALESCE(m.content, ''), 23) = '__PULSE_LIVE_LOCATION__' ");
        }
        if (recalled != null) {
            where.append(" AND COALESCE(m.recalled, FALSE) = ? ");
            args.add(recalled);
        }
        if (userDeleted != null) {
            if (userDeleted) {
                where.append("""
                         AND EXISTS (
                            SELECT 1 FROM im_message_hide h
                            WHERE h.msg_id = m.msg_id
                              AND h.conversation_id = m.conversation_id
                         )
                        """);
            } else {
                where.append("""
                         AND NOT EXISTS (
                            SELECT 1 FROM im_message_hide h
                            WHERE h.msg_id = m.msg_id
                              AND h.conversation_id = m.conversation_id
                         )
                        """);
            }
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        m.content ILIKE ?
                        OR CAST(m.conversation_id AS TEXT) LIKE ?
                        OR CAST(m.from_user_id AS TEXT) LIKE ?
                        OR COALESCE(c.title, '') ILIKE ?
                        OR EXISTS (
                            SELECT 1 FROM sys_user su
                            WHERE su.id = m.from_user_id
                              AND (su.nickname ILIKE ? OR su.phone ILIKE ? OR CAST(su.pulse_id AS TEXT) LIKE ?)
                        )
                     )
                    """);
            args.add(kw);
            args.add("%" + keyword.trim() + "%");
            args.add("%" + keyword.trim() + "%");
            args.add(kw);
            args.add(kw);
            args.add(kw);
            args.add("%" + keyword.trim() + "%");
        }

        String countSql = "SELECT COUNT(*) FROM im_message m "
                + "INNER JOIN im_conversation c ON c.id = m.conversation_id "
                + where;
        Long total = jdbcTemplate.queryForObject(countSql, Long.class, args.toArray());
        long totalVal = total == null ? 0L : total;

        int offset = (safePage - 1) * safeSize;
        String listSql = """
                SELECT m.id, m.msg_id, m.conversation_id, m.from_user_id, m.msg_type, m.file_id, m.burn_after_read,
                       m.burn_expires_at, m.auto_delete_expires_at, m.scheduled_message, m.content,
                       m.reply_to_msg_id, m.recalled, m.send_time,
                       c.type AS conversation_type, c.title AS conversation_title,
                       (
                           SELECT COUNT(*) FROM im_message_hide h
                           WHERE h.msg_id = m.msg_id AND h.conversation_id = m.conversation_id
                       ) AS hide_count
                FROM im_message m
                INNER JOIN im_conversation c ON c.id = m.conversation_id
                """ + where + " ORDER BY m.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add(offset);

        List<Row> rows = jdbcTemplate.query(listSql, (rs, rowNum) -> {
            Row r = new Row();
            r.id = rs.getLong("id");
            r.msgId = rs.getString("msg_id");
            r.conversationId = rs.getLong("conversation_id");
            r.fromUserId = rs.getObject("from_user_id") == null ? null : rs.getLong("from_user_id");
            r.msgType = rs.getObject("msg_type") == null ? null : rs.getInt("msg_type");
            r.fileId = rs.getString("file_id");
            r.burnAfterRead = rs.getObject("burn_after_read") != null && rs.getBoolean("burn_after_read");
            r.burnExpiresAt = toOffsetDateTime(rs.getObject("burn_expires_at"));
            r.autoDeleteExpiresAt = toOffsetDateTime(rs.getObject("auto_delete_expires_at"));
            r.scheduledMessage = rs.getObject("scheduled_message") != null && rs.getBoolean("scheduled_message");
            r.content = rs.getString("content");
            r.replyToMsgId = rs.getString("reply_to_msg_id");
            r.recalled = rs.getObject("recalled") != null && rs.getBoolean("recalled");
            r.hideCount = rs.getInt("hide_count");
            Timestamp ts = rs.getTimestamp("send_time");
            r.sendTime = ts == null ? null : ts.toInstant().atOffset(ZoneOffset.ofHours(8));
            r.conversationType = rs.getInt("conversation_type");
            r.conversationTitle = rs.getString("conversation_title");
            return r;
        }, listArgs.toArray());

        List<AdminMessageVO> list = enrich(rows, type);

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", totalVal);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    /**
     * 查看某条消息前后的上下文（按时间升序）。
     * - anchorId：定位消息，返回其前 before 条 + 自身 + 后 after 条
     * - beforeId：加载比该 id 更早的消息（不含自身）
     * - afterId：加载比该 id 更新的消息（不含自身）
     */
    public Map<String, Object> listContext(
            Long conversationId,
            Long anchorId,
            Long beforeId,
            Long afterId,
            int before,
            int after
    ) {
        if (conversationId == null || conversationId <= 0) {
            throw new com.pulse.common.exception.BizException("会话 ID 无效");
        }
        ImConversation conv = conversationMapper.selectById(conversationId);
        if (conv == null) {
            throw new com.pulse.common.exception.BizException("会话不存在");
        }
        int type = conv.getType() != null && conv.getType() == 2 ? 2 : 1;
        int safeBefore = Math.min(Math.max(before, 0), 100);
        int safeAfter = Math.min(Math.max(after, 0), 100);
        if (safeBefore == 0 && safeAfter == 0) {
            safeBefore = 30;
            safeAfter = 30;
        }

        List<Row> rows = new ArrayList<>();
        Long focusId = anchorId;

        if (beforeId != null && beforeId > 0) {
            rows.addAll(queryContextRows(
                    " WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ? ",
                    List.of(conversationId, beforeId, Math.max(safeBefore, 1))
            ));
            Collections.reverse(rows);
            focusId = null;
        } else if (afterId != null && afterId > 0) {
            rows.addAll(queryContextRows(
                    " WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ? ",
                    List.of(conversationId, afterId, Math.max(safeAfter, 1))
            ));
            focusId = null;
        } else {
            if (anchorId == null || anchorId <= 0) {
                throw new com.pulse.common.exception.BizException("请指定定位消息");
            }
            Long exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM im_message WHERE id = ? AND conversation_id = ?",
                    Long.class, anchorId, conversationId);
            if (exists == null || exists == 0) {
                throw new com.pulse.common.exception.BizException("消息不存在或不属于该会话");
            }
            List<Row> older = queryContextRows(
                    " WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ? ",
                    List.of(conversationId, anchorId, safeBefore)
            );
            Collections.reverse(older);
            List<Row> self = queryContextRows(
                    " WHERE m.conversation_id = ? AND m.id = ? ",
                    List.of(conversationId, anchorId)
            );
            List<Row> newer = queryContextRows(
                    " WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ? ",
                    List.of(conversationId, anchorId, safeAfter)
            );
            rows.addAll(older);
            rows.addAll(self);
            rows.addAll(newer);
        }

        List<AdminMessageVO> list = enrich(rows, type);
        boolean hasMoreBefore = false;
        boolean hasMoreAfter = false;
        if (!rows.isEmpty()) {
            Long minId = rows.get(0).id;
            Long maxId = rows.get(rows.size() - 1).id;
            Long olderCnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM im_message WHERE conversation_id = ? AND id < ?",
                    Long.class, conversationId, minId);
            Long newerCnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM im_message WHERE conversation_id = ? AND id > ?",
                    Long.class, conversationId, maxId);
            hasMoreBefore = olderCnt != null && olderCnt > 0;
            hasMoreAfter = newerCnt != null && newerCnt > 0;
        }

        String title = conv.getTitle();
        if (!StringUtils.hasText(title) && !list.isEmpty()) {
            title = list.get(0).getConversationTitle();
        }
        if (!StringUtils.hasText(title)) {
            title = type == 2 ? ("群聊 #" + conversationId) : ("会话 #" + conversationId);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("conversationId", conversationId);
        data.put("conversationType", type);
        data.put("conversationTitle", title);
        data.put("anchorId", focusId);
        data.put("hasMoreBefore", hasMoreBefore);
        data.put("hasMoreAfter", hasMoreAfter);
        return data;
    }

    private List<Row> queryContextRows(String whereAndOrder, List<Object> args) {
        String sql = """
                SELECT m.id, m.msg_id, m.conversation_id, m.from_user_id, m.msg_type, m.file_id, m.burn_after_read,
                       m.burn_expires_at, m.auto_delete_expires_at, m.scheduled_message, m.content,
                       m.reply_to_msg_id, m.recalled, m.send_time,
                       c.type AS conversation_type, c.title AS conversation_title,
                       (
                           SELECT COUNT(*) FROM im_message_hide h
                           WHERE h.msg_id = m.msg_id AND h.conversation_id = m.conversation_id
                       ) AS hide_count
                FROM im_message m
                INNER JOIN im_conversation c ON c.id = m.conversation_id
                """ + whereAndOrder;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Row r = new Row();
            r.id = rs.getLong("id");
            r.msgId = rs.getString("msg_id");
            r.conversationId = rs.getLong("conversation_id");
            r.fromUserId = rs.getObject("from_user_id") == null ? null : rs.getLong("from_user_id");
            r.msgType = rs.getObject("msg_type") == null ? null : rs.getInt("msg_type");
            r.fileId = rs.getString("file_id");
            r.burnAfterRead = rs.getObject("burn_after_read") != null && rs.getBoolean("burn_after_read");
            r.burnExpiresAt = toOffsetDateTime(rs.getObject("burn_expires_at"));
            r.autoDeleteExpiresAt = toOffsetDateTime(rs.getObject("auto_delete_expires_at"));
            r.scheduledMessage = rs.getObject("scheduled_message") != null && rs.getBoolean("scheduled_message");
            r.content = rs.getString("content");
            r.replyToMsgId = rs.getString("reply_to_msg_id");
            r.recalled = rs.getObject("recalled") != null && rs.getBoolean("recalled");
            r.hideCount = rs.getInt("hide_count");
            Timestamp ts = rs.getTimestamp("send_time");
            r.sendTime = ts == null ? null : ts.toInstant().atOffset(ZoneOffset.ofHours(8));
            r.conversationType = rs.getInt("conversation_type");
            r.conversationTitle = rs.getString("conversation_title");
            return r;
        }, args.toArray());
    }

    private List<AdminMessageVO> enrich(List<Row> rows, int conversationType) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        Set<Long> userIds = new HashSet<>();
        Set<Long> convIds = new HashSet<>();
        for (Row r : rows) {
            if (r.fromUserId != null) {
                userIds.add(r.fromUserId);
            }
            if (r.conversationId != null) {
                convIds.add(r.conversationId);
            }
        }

        Map<Long, List<ImConversationMember>> membersByConv = new HashMap<>();
        if (conversationType == 1 && !convIds.isEmpty()) {
            List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                    .in(ImConversationMember::getConversationId, convIds));
            for (ImConversationMember m : members) {
                membersByConv.computeIfAbsent(m.getConversationId(), k -> new ArrayList<>()).add(m);
                if (m.getUserId() != null) {
                    userIds.add(m.getUserId());
                }
            }
        }

        Set<String> fileIds = rows.stream()
                .map(r -> r.fileId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Map<Long, SysUser> users = loadUsers(userIds);
        Map<Long, ImConversation> conversations = loadConversations(convIds);
        Map<String, ImFile> files = loadFiles(fileIds);

        List<AdminMessageVO> result = new ArrayList<>();
        for (Row r : rows) {
            SysUser from = r.fromUserId == null ? null : users.get(r.fromUserId);
            Long peerId = null;
            SysUser peer = null;
            String title = r.conversationTitle;
            if (conversationType == 1) {
                List<ImConversationMember> members = membersByConv.getOrDefault(r.conversationId, List.of());
                for (ImConversationMember m : members) {
                    if (m.getUserId() != null && !Objects.equals(m.getUserId(), r.fromUserId)) {
                        peerId = m.getUserId();
                        break;
                    }
                }
                // 若发送者为空或找不到对方，取非发送者/任意另一成员
                if (peerId == null) {
                    for (ImConversationMember m : members) {
                        if (m.getUserId() != null && (r.fromUserId == null || !m.getUserId().equals(r.fromUserId))) {
                            peerId = m.getUserId();
                            break;
                        }
                    }
                }
                peer = peerId == null ? null : users.get(peerId);
                if (!StringUtils.hasText(title)) {
                    String a = from == null ? (r.fromUserId == null ? "?" : String.valueOf(r.fromUserId))
                            : (StringUtils.hasText(from.getNickname()) ? from.getNickname() : from.getPhone());
                    String b = peer == null ? (peerId == null ? "?" : String.valueOf(peerId))
                            : (StringUtils.hasText(peer.getNickname()) ? peer.getNickname() : peer.getPhone());
                    title = a + " ↔ " + b;
                }
            } else if (!StringUtils.hasText(title)) {
                ImConversation c = conversations.get(r.conversationId);
                title = c != null && StringUtils.hasText(c.getTitle()) ? c.getTitle() : ("群聊 #" + r.conversationId);
            }

            ImFile attachment = StringUtils.hasText(r.fileId) ? files.get(r.fileId) : null;
            result.add(AdminMessageVO.builder()
                    .id(r.id)
                    .msgId(r.msgId)
                    .conversationId(r.conversationId)
                    .conversationType(r.conversationType)
                    .conversationTitle(title)
                    .fromUserId(r.fromUserId)
                    .fromNickname(from == null ? null : from.getNickname())
                    .fromPhone(from == null ? null : from.getPhone())
                    .fromPulseId(from == null ? null : from.getPulseId())
                    .fromAvatarUrl(from == null ? null : from.getAvatarUrl())
                    .peerUserId(peerId)
                    .peerNickname(peer == null ? null : peer.getNickname())
                    .peerPhone(peer == null ? null : peer.getPhone())
                    .msgType(r.msgType)
                    .burnAfterRead(Boolean.TRUE.equals(r.burnAfterRead))
                    .burnExpiresAt(r.burnExpiresAt)
                    .autoDeleteExpiresAt(r.autoDeleteExpiresAt)
                    .scheduledMessage(Boolean.TRUE.equals(r.scheduledMessage))
                    .fileId(r.fileId)
                    .file(attachment == null ? null : chatFileStorageService.toAdminMetadata(attachment))
                    .content(r.content)
                    .contentPreview(buildPreview(r.msgType, r.content, r.recalled, r.hideCount > 0))
                    .recalled(Boolean.TRUE.equals(r.recalled))
                    .userDeleted(r.hideCount > 0)
                    .hideCount(r.hideCount)
                    .replyToMsgId(r.replyToMsgId)
                    .sendTime(r.sendTime)
                    .build());
        }
        return result;
    }

    private Map<String, ImFile> loadFiles(Set<String> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<ImFile> list = fileMapper.selectBatchIds(fileIds);
        Map<String, ImFile> map = new HashMap<>();
        for (ImFile file : list) {
            if (StringUtils.hasText(file.getFileId())) {
                map.put(file.getFileId(), file);
            }
        }
        return map;
    }

    private Map<Long, SysUser> loadUsers(Set<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<SysUser> list = userMapper.selectBatchIds(userIds);
        Map<Long, SysUser> map = new HashMap<>();
        for (SysUser u : list) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private Map<Long, ImConversation> loadConversations(Set<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<ImConversation> list = conversationMapper.selectBatchIds(ids);
        return list.stream().collect(Collectors.toMap(ImConversation::getId, c -> c, (a, b) -> a));
    }

    @Transactional
    public int deleteByIds(List<Long> ids) {
        List<Long> clean = normalizeIds(ids);
        if (clean.isEmpty()) {
            return 0;
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(clean.size(), "?"));
        Object[] args = clean.toArray();

        List<Long> conversationIds = jdbcTemplate.query(
                "SELECT DISTINCT conversation_id FROM im_message WHERE id IN (" + placeholders + ")",
                (rs, rowNum) -> rs.getLong("conversation_id"),
                args
        );

        Map<Long, Map<Long, ReadWatermark>> priorReadMarks = new HashMap<>();
        for (Long cid : conversationIds) {
            if (cid != null && cid > 0) {
                priorReadMarks.put(cid, loadMemberReadWatermarks(cid));
            }
        }

        jdbcTemplate.update(
                "DELETE FROM im_message_hide WHERE msg_id IN (SELECT msg_id FROM im_message WHERE id IN ("
                        + placeholders + "))",
                args);
        int deleted = jdbcTemplate.update("DELETE FROM im_message WHERE id IN (" + placeholders + ")", args);

        Set<Long> touched = new HashSet<>();
        for (Long cid : conversationIds) {
            if (cid != null && cid > 0 && touched.add(cid)) {
                refreshConversationLastMsg(cid);
                recomputeMemberUnread(cid, priorReadMarks.getOrDefault(cid, Collections.emptyMap()));
            }
        }
        return deleted;
    }

    /**
     * 一键清空指定类型会话的全部聊天记录（硬删除）。
     *
     * @param conversationType 1 私聊 / 2 群聊
     */
    @Transactional
    public int clearAllByConversationType(int conversationType) {
        int type = conversationType == 2 ? 2 : 1;

        jdbcTemplate.update(
                """
                        DELETE FROM im_message_hide
                        WHERE conversation_id IN (SELECT id FROM im_conversation WHERE type = ?)
                           OR msg_id IN (
                                SELECT m.msg_id FROM im_message m
                                JOIN im_conversation c ON c.id = m.conversation_id
                                WHERE c.type = ?
                           )
                        """,
                type, type
        );
        jdbcTemplate.update(
                """
                        DELETE FROM im_favorite
                        WHERE conversation_id IN (SELECT id FROM im_conversation WHERE type = ?)
                        """,
                type
        );
        int deleted = jdbcTemplate.update(
                """
                        DELETE FROM im_message
                        WHERE conversation_id IN (SELECT id FROM im_conversation WHERE type = ?)
                        """,
                type
        );
        jdbcTemplate.update(
                """
                        UPDATE im_conversation
                        SET last_msg_preview = '',
                            last_msg_time = NULL,
                            updated_at = NOW()
                        WHERE type = ?
                        """,
                type
        );
        // 清空后同步清掉成员未读，避免离线用户登录后仍看到幽灵未读数
        jdbcTemplate.update(
                """
                        UPDATE im_conversation_member m
                        SET unread_count = 0,
                            mention_unread = FALSE,
                            last_read_msg_id = NULL,
                            last_read_at = NULL
                        WHERE m.conversation_id IN (SELECT id FROM im_conversation WHERE type = ?)
                        """,
                type
        );
        return deleted;
    }

    private record ReadWatermark(OffsetDateTime sendTime, long id) {}

    /** 删除前记录各成员已读水位，便于水位消息被删后回退到仍存在的前一条 */
    private Map<Long, ReadWatermark> loadMemberReadWatermarks(Long conversationId) {
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        Map<Long, ReadWatermark> map = new HashMap<>();
        for (ImConversationMember m : members) {
            if (m.getUserId() == null || !StringUtils.hasText(m.getLastReadMsgId())) {
                continue;
            }
            ReadWatermark w = loadReadWatermark(conversationId, m.getLastReadMsgId().trim());
            if (w != null) {
                map.put(m.getUserId(), w);
            }
        }
        return map;
    }

    private ReadWatermark loadReadWatermark(Long conversationId, String msgId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        SELECT id, send_time
                        FROM im_message
                        WHERE conversation_id = ? AND msg_id = ?
                        LIMIT 1
                        """,
                conversationId, msgId
        );
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> row = rows.get(0);
        long id = ((Number) row.get("id")).longValue();
        OffsetDateTime sendTime = toOffsetDateTime(row.get("send_time"));
        if (sendTime == null) {
            sendTime = OffsetDateTime.now();
        }
        return new ReadWatermark(sendTime, id);
    }

    private String findLatestMsgIdAtOrBefore(Long conversationId, ReadWatermark w) {
        List<String> rows = jdbcTemplate.query(
                """
                        SELECT msg_id
                        FROM im_message
                        WHERE conversation_id = ?
                          AND (
                            send_time < ?
                            OR (send_time = ? AND id <= ?)
                          )
                        ORDER BY send_time DESC NULLS LAST, id DESC
                        LIMIT 1
                        """,
                (rs, rowNum) -> rs.getString("msg_id"),
                conversationId,
                Timestamp.from(w.sendTime().toInstant()),
                Timestamp.from(w.sendTime().toInstant()),
                w.id()
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private int countUnreadAfter(Long conversationId, Long userId, String lastReadMsgId) {
        if (!StringUtils.hasText(lastReadMsgId)) {
            Integer n = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*)::int
                            FROM im_message msg
                            WHERE msg.conversation_id = ?
                              AND msg.from_user_id IS DISTINCT FROM ?
                              AND COALESCE(msg.recalled, FALSE) = FALSE
                            """,
                    Integer.class,
                    conversationId, userId
            );
            return n == null ? 0 : Math.max(0, n);
        }
        Integer n = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)::int
                        FROM im_message msg
                        WHERE msg.conversation_id = ?
                          AND msg.from_user_id IS DISTINCT FROM ?
                          AND COALESCE(msg.recalled, FALSE) = FALSE
                          AND EXISTS (
                            SELECT 1 FROM im_message lr
                            WHERE lr.conversation_id = ?
                              AND lr.msg_id = ?
                              AND (
                                msg.send_time > lr.send_time
                                OR (msg.send_time = lr.send_time AND msg.id > lr.id)
                              )
                          )
                        """,
                Integer.class,
                conversationId, userId, conversationId, lastReadMsgId.trim()
        );
        return n == null ? 0 : Math.max(0, n);
    }

    private boolean hasMentionUnreadAfter(Long conversationId, Long userId, String lastReadMsgId) {
        String uid = String.valueOf(userId);
        List<Integer> rows;
        if (!StringUtils.hasText(lastReadMsgId)) {
            rows = jdbcTemplate.query(
                    """
                            SELECT 1
                            FROM im_message msg
                            WHERE msg.conversation_id = ?
                              AND msg.from_user_id IS DISTINCT FROM ?
                              AND COALESCE(msg.recalled, FALSE) = FALSE
                              AND (
                                COALESCE(msg.at_all, FALSE) = TRUE
                                OR (
                                  msg.mention_user_ids IS NOT NULL
                                  AND msg.mention_user_ids <> ''
                                  AND (',' || msg.mention_user_ids || ',') LIKE ?
                                )
                              )
                            LIMIT 1
                            """,
                    (rs, rowNum) -> 1,
                    conversationId, userId, "%," + uid + ",%"
            );
        } else {
            rows = jdbcTemplate.query(
                    """
                            SELECT 1
                            FROM im_message msg
                            WHERE msg.conversation_id = ?
                              AND msg.from_user_id IS DISTINCT FROM ?
                              AND COALESCE(msg.recalled, FALSE) = FALSE
                              AND (
                                COALESCE(msg.at_all, FALSE) = TRUE
                                OR (
                                  msg.mention_user_ids IS NOT NULL
                                  AND msg.mention_user_ids <> ''
                                  AND (',' || msg.mention_user_ids || ',') LIKE ?
                                )
                              )
                              AND EXISTS (
                                SELECT 1 FROM im_message lr
                                WHERE lr.conversation_id = ?
                                  AND lr.msg_id = ?
                                  AND (
                                    msg.send_time > lr.send_time
                                    OR (msg.send_time = lr.send_time AND msg.id > lr.id)
                                  )
                              )
                            LIMIT 1
                            """,
                    (rs, rowNum) -> 1,
                    conversationId, userId, "%," + uid + ",%", conversationId, lastReadMsgId.trim()
            );
        }
        return !rows.isEmpty();
    }

    /** 删除消息后按已读水位重算未读，避免离线用户登录后看到幽灵未读 */
    private void recomputeMemberUnread(Long conversationId, Map<Long, ReadWatermark> priorReadMarks) {
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        for (ImConversationMember m : members) {
            if (m.getUserId() == null) {
                continue;
            }
            String lr = StringUtils.hasText(m.getLastReadMsgId()) ? m.getLastReadMsgId().trim() : null;
            if (StringUtils.hasText(lr)) {
                Long exists = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM im_message WHERE conversation_id = ? AND msg_id = ?",
                        Long.class,
                        conversationId, lr
                );
                if (exists == null || exists == 0) {
                    ReadWatermark prior = priorReadMarks.get(m.getUserId());
                    String replacement = prior != null ? findLatestMsgIdAtOrBefore(conversationId, prior) : null;
                    m.setLastReadMsgId(replacement);
                    if (replacement == null) {
                        m.setLastReadAt(null);
                    }
                    lr = replacement;
                }
            }
            m.setUnreadCount(countUnreadAfter(conversationId, m.getUserId(), lr));
            m.setMentionUnread(hasMentionUnreadAfter(conversationId, m.getUserId(), lr));
            memberMapper.updateById(m);
        }
    }

    private OffsetDateTime toOffsetDateTime(Object sendTime) {
        if (sendTime instanceof Timestamp ts) {
            return ts.toInstant().atOffset(ZoneOffset.ofHours(8));
        }
        if (sendTime instanceof OffsetDateTime odt) {
            return odt;
        }
        if (sendTime instanceof java.time.LocalDateTime ldt) {
            return ldt.atOffset(ZoneOffset.ofHours(8));
        }
        if (sendTime instanceof java.time.Instant instant) {
            return instant.atOffset(ZoneOffset.ofHours(8));
        }
        return null;
    }

    /** 删除消息后，将会话最新预览回填为仍存在的最新未撤回消息 */
    private void refreshConversationLastMsg(Long conversationId) {
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null) {
            return;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                        SELECT msg_type, content, send_time
                        FROM im_message
                        WHERE conversation_id = ?
                          AND COALESCE(recalled, FALSE) = FALSE
                        ORDER BY send_time DESC NULLS LAST, id DESC
                        LIMIT 1
                        """,
                conversationId
        );
        if (rows.isEmpty()) {
            c.setLastMsgPreview("");
            c.setLastMsgTime(null);
        } else {
            Map<String, Object> row = rows.get(0);
            Integer msgType = row.get("msg_type") == null ? null : ((Number) row.get("msg_type")).intValue();
            String content = row.get("content") == null ? null : String.valueOf(row.get("content"));
            Object sendTime = row.get("send_time");
            c.setLastMsgPreview(sessionPreview(msgType, content));
            if (sendTime instanceof Timestamp ts) {
                c.setLastMsgTime(ts.toInstant().atOffset(ZoneOffset.ofHours(8)));
            } else if (sendTime instanceof OffsetDateTime odt) {
                c.setLastMsgTime(odt);
            } else if (sendTime instanceof java.time.LocalDateTime ldt) {
                c.setLastMsgTime(ldt.atOffset(ZoneOffset.ofHours(8)));
            } else if (sendTime instanceof java.time.Instant instant) {
                c.setLastMsgTime(instant.atOffset(ZoneOffset.ofHours(8)));
            } else {
                c.setLastMsgTime(OffsetDateTime.now());
            }
        }
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
    }

    private String sessionPreview(Integer msgType, String content) {
        int type = msgType == null ? 0 : msgType;
        if (type == 9) {
            return formatSystemPreview(content);
        }
        if (type == 4) {
            try {
                com.fasterxml.jackson.databind.JsonNode n =
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
                String title = n.path("title").asText("");
                return StringUtils.hasText(title) ? ("[聊天记录] " + truncate(title, 40)) : "[聊天记录]";
            } catch (Exception e) {
                return "[聊天记录]";
            }
        }
        String preview = previewBody(type, content);
        return "—".equals(preview) ? "" : preview;
    }

    private static List<Long> normalizeIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return ids.stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .distinct()
                .toList();
    }

    private String buildPreview(Integer msgType, String content, boolean recalled, boolean userDeleted) {
        String body = previewBody(msgType, content);
        StringBuilder sb = new StringBuilder();
        if (recalled) {
            sb.append("[已撤回]");
        }
        if (userDeleted) {
            if (sb.length() > 0) sb.append(' ');
            sb.append("[已删除]");
        }
        if (sb.length() > 0) {
            sb.append(' ').append(body);
            return sb.toString();
        }
        return body;
    }

    private String previewBody(Integer msgType, String content) {
        int type = msgType == null ? 0 : msgType;
        return switch (type) {
            case 1 -> "[图片]";
            case 2 -> {
                String c = content == null ? "" : content.toLowerCase();
                yield c.contains("video/") || c.contains("\"mime\":\"video") ? "[视频]" : "[文件]";
            }
            case 3 -> "[语音]";
            case 4 -> {
                if (!StringUtils.hasText(content)) {
                    yield "[聊天记录]";
                }
                try {
                    com.fasterxml.jackson.databind.JsonNode n =
                            new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
                    String title = n.path("title").asText("聊天记录");
                    int count = n.path("count").asInt(0);
                    if (count <= 0 && n.path("items").isArray()) {
                        count = n.path("items").size();
                    }
                    yield count > 0
                            ? "[聊天记录] " + truncate(title, 40) + "（" + count + "条）"
                            : "[聊天记录] " + truncate(title, 40);
                } catch (Exception e) {
                    yield "[聊天记录]";
                }
            }
            case 5 -> formatCardPreview(content);
            case 6 -> "[位置]";
            case 7 -> formatWalletPreview(content, false);
            case 8 -> formatWalletPreview(content, true);
            case 9 -> formatSystemPreview(content);
            default -> type == 0 ? readableTextPreview(content) : truncate(content, 120);
        };
    }

    private String formatWalletPreview(String content, boolean transfer) {
        String fallback = transfer ? "[转账]" : "[红包]";
        if (!StringUtils.hasText(content)) {
            return fallback;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            String status = switch (n.path("status").asText("")) {
                case "ACTIVE" -> "领取中";
                case "PENDING" -> "待领取";
                case "FINISHED" -> "已领完";
                case "RECEIVED" -> "已收款";
                case "EXPIRED" -> "已过期";
                case "REFUNDED" -> "已退款";
                case "CANCELLED" -> "已取消";
                default -> n.path("status").asText("");
            };
            if (!transfer) {
                String packetType = switch (n.path("packetType").asText("")) {
                    case "PRIVATE" -> "单聊红包";
                    case "NORMAL" -> "普通红包";
                    case "LUCKY" -> "拼手气红包";
                    case "EXCLUSIVE" -> "专属红包";
                    default -> "红包";
                };
                String greeting = n.path("greeting").asText("恭喜发财，大吉大利");
                return "[" + packetType + "] " + greeting + (StringUtils.hasText(status) ? " · " + status : "");
            }
            long amount = n.path("amount").asLong(0);
            String remark = n.path("remark").asText("");
            String amountText = String.format(java.util.Locale.ROOT, "%.2f", amount / 100.0d);
            return "[转账] ¥" + amountText
                    + (StringUtils.hasText(remark) ? " · " + remark : "")
                    + (StringUtils.hasText(status) ? " · " + status : "");
        } catch (Exception e) {
            return fallback;
        }
    }

    private String formatSystemPreview(String content) {
        if (!StringUtils.hasText(content)) {
            return "[系统提示]";
        }
        String text = content.trim();
        if (CallLogService.looksLikeCallTip(text, null)) {
            return CallLogService.displayCallPreview(text);
        }
        if (!text.startsWith("{")) {
            return truncate(text, 80);
        }
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(text);
            String kind = n.path("kind").asText("");
            String actor = n.path("actorName").asText("成员");
            String owner = n.path("ownerName").asText("发送人");
            String target = n.path("targetName").asText("成员");
            if ("red_packet_received".equals(kind)) return actor + "领取了" + owner + "的红包";
            if ("transfer_received".equals(kind)) return actor + "已收取" + owner + "的转账";
            if ("red_packet_expired".equals(kind)) {
                return "红包已过期，未领取金额 ¥" + centsText(n.path("refundAmount").asLong(0)) + " 已退回";
            }
            if ("transfer_expired".equals(kind)) {
                return "转账已过期，金额 ¥" + centsText(n.path("refundAmount").asLong(0)) + " 已退回";
            }
            if ("group_member_join".equals(kind)) {
                if (n.hasNonNull("actorId")) return actor + "邀请" + target + "加入群聊";
                if ("qrcode".equals(n.path("source").asText(""))) return target + "通过扫描二维码加入群聊";
                if ("card".equals(n.path("source").asText(""))) return target + "通过群名片加入群聊";
                return target + "加入群聊";
            }
            if ("group_member_kick".equals(kind)) return actor + "将" + target + "移出群聊";
            if (StringUtils.hasText(n.path("text").asText())) return truncate(n.path("text").asText(), 80);
            return StringUtils.hasText(kind) ? "系统事件：" + kind : "[系统提示]";
        } catch (Exception e) {
            return "[系统提示]";
        }
    }

    private String readableTextPreview(String content) {
        if (!StringUtils.hasText(content)) {
            return "—";
        }
        String raw = content.trim();
        if (!raw.startsWith("{") && !raw.startsWith("[")) {
            return truncate(content, 120);
        }
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
            if (n.isTextual()) return truncate(n.asText(), 120);
            if (n.isArray()) return "[结构化消息]";
            for (String key : List.of("text", "message", "content", "title", "name")) {
                if (StringUtils.hasText(n.path(key).asText())) return truncate(n.path(key).asText(), 120);
            }
            String kind = StringUtils.hasText(n.path("kind").asText())
                    ? n.path("kind").asText() : n.path("type").asText();
            return StringUtils.hasText(kind) ? "系统事件：" + kind : "[结构化消息]";
        } catch (Exception e) {
            return truncate(content, 120);
        }
    }

    private String centsText(long cents) {
        return String.format(java.util.Locale.ROOT, "%.2f", Math.max(0, cents) / 100.0d);
    }

    private String formatCardPreview(String content) {
        if (!StringUtils.hasText(content)) {
            return "[名片]";
        }
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            String type = n.path("cardType").asText(n.path("type").asText(""));
            boolean group = "group".equalsIgnoreCase(type);
            boolean community = "community".equalsIgnoreCase(type);
            String name = n.path("nickname").asText("");
            if (!StringUtils.hasText(name)) {
                name = n.path("title").asText("");
            }
            if (!StringUtils.hasText(name)) {
                name = community ? "圈子" : group ? "群聊" : "用户";
            }
            return (community ? "[圈子名片] " : group ? "[群名片] " : "[个人名片] ") + truncate(name, 40);
        } catch (Exception e) {
            String c = content.toLowerCase();
            if (c.contains("\"cardtype\":\"community\"") || c.contains("\"type\":\"community\"")) {
                return "[圈子名片]";
            }
            if (c.contains("\"cardtype\":\"group\"") || c.contains("\"type\":\"group\"")) {
                return "[群名片]";
            }
            return "[个人名片]";
        }
    }

    private String truncate(String value, int max) {
        if (!StringUtils.hasText(value)) {
            return "—";
        }
        String v = value.trim().replace('\n', ' ');
        return v.length() <= max ? v : v.substring(0, max) + "…";
    }

    private static class Row {
        Long id;
        String msgId;
        Long conversationId;
        Long fromUserId;
        Integer msgType;
        String fileId;
        Boolean burnAfterRead;
        OffsetDateTime burnExpiresAt;
        OffsetDateTime autoDeleteExpiresAt;
        Boolean scheduledMessage;
        String content;
        String replyToMsgId;
        boolean recalled;
        int hideCount;
        OffsetDateTime sendTime;
        Integer conversationType;
        String conversationTitle;
    }
}
