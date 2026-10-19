package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.PreparedStatement;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CallRingtoneService {
    private final JdbcTemplate jdbcTemplate;

    /** 客户端：启用中的铃声列表 */
    public List<Map<String, Object>> listEnabledForClient() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, name, url, is_default, sort_order
                FROM sys_call_ringtone
                WHERE enabled = TRUE AND TRIM(url) <> ''
                ORDER BY is_default DESC, sort_order ASC, id ASC
                """);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            list.add(toClientItem(row));
        }
        return list;
    }

    /** 当前用户生效铃声（未选则默认） */
    public Map<String, Object> getEffectiveRingtone(Long userId) {
        Long chosen = null;
        if (userId != null) {
            List<Map<String, Object>> u = jdbcTemplate.queryForList(
                    "SELECT ringtone_id FROM sys_user WHERE id = ?", userId);
            if (!u.isEmpty() && u.get(0).get("ringtone_id") != null) {
                chosen = ((Number) u.get(0).get("ringtone_id")).longValue();
            }
        }
        Map<String, Object> tone = null;
        if (chosen != null) {
            tone = findEnabled(chosen);
        }
        if (tone == null) {
            tone = findDefault();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        if (tone == null) {
            result.put("enabled", false);
            result.put("configured", false);
            result.put("id", null);
            result.put("url", "");
            result.put("name", "");
            return result;
        }
        result.put("enabled", true);
        result.put("configured", true);
        result.put("id", tone.get("id"));
        result.put("url", tone.get("url"));
        result.put("name", tone.get("name"));
        return result;
    }

    /** 指定用户的生效铃声（主叫播放被叫铃声） */
    public Map<String, Object> getUserEffectiveRingtone(Long targetUserId) {
        return getEffectiveRingtone(targetUserId);
    }

    public Map<String, Object> getMyRingtone(Long userId) {
        Map<String, Object> effective = getEffectiveRingtone(userId);
        Long selectedId = null;
        List<Map<String, Object>> u = jdbcTemplate.queryForList(
                "SELECT ringtone_id FROM sys_user WHERE id = ?", userId);
        if (!u.isEmpty() && u.get(0).get("ringtone_id") != null) {
            selectedId = ((Number) u.get(0).get("ringtone_id")).longValue();
        }
        Map<String, Object> result = new LinkedHashMap<>(effective);
        result.put("selectedId", selectedId);
        result.put("list", listEnabledForClient());
        return result;
    }

    @Transactional
    public Map<String, Object> setMyRingtone(Long userId, Long ringtoneId) {
        if (ringtoneId == null) {
            jdbcTemplate.update("UPDATE sys_user SET ringtone_id = NULL WHERE id = ?", userId);
            return getMyRingtone(userId);
        }
        Map<String, Object> tone = findEnabled(ringtoneId);
        if (tone == null) {
            throw new BizException("铃声不存在或已停用");
        }
        jdbcTemplate.update("UPDATE sys_user SET ringtone_id = ? WHERE id = ?", ringtoneId, userId);
        return getMyRingtone(userId);
    }

    public Map<String, Object> adminList(int page, int size, String keyword) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        String kw = keyword == null ? "" : keyword.trim();
        String where = " WHERE 1=1 ";
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(kw)) {
            where += " AND name ILIKE ? ";
            args.add("%" + kw + "%");
        }
        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_call_ringtone" + where, Integer.class, args.toArray());
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(s);
        listArgs.add(offset);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT r.id, r.name, r.url, r.enabled, r.is_default, r.sort_order, r.created_at, r.updated_at,
                       (SELECT COUNT(*) FROM sys_user u WHERE u.ringtone_id = r.id) AS usage_count
                FROM sys_call_ringtone r
                """ + where + """
                ORDER BY r.is_default DESC, r.sort_order ASC, r.id DESC
                LIMIT ? OFFSET ?
                """, listArgs.toArray());
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            list.add(toAdminItem(row));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total == null ? 0 : total);
        result.put("page", p);
        result.put("size", s);
        return result;
    }

    public Map<String, Object> adminDetail(long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT r.id, r.name, r.url, r.enabled, r.is_default, r.sort_order, r.created_at, r.updated_at,
                       (SELECT COUNT(*) FROM sys_user u WHERE u.ringtone_id = r.id) AS usage_count
                FROM sys_call_ringtone r
                WHERE r.id = ?
                """, id);
        if (rows.isEmpty()) {
            throw new BizException("铃声不存在");
        }
        Map<String, Object> item = toAdminItem(rows.get(0));
        item.put("users", listUsersUsing(id, 1, 50));
        return item;
    }

    public Map<String, Object> listUsersUsing(long ringtoneId, int page, int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE ringtone_id = ?", Integer.class, ringtoneId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, nickname, avatar_url, pulse_id, phone
                FROM sys_user
                WHERE ringtone_id = ?
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """, ringtoneId, s, offset);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("userId", row.get("id"));
            u.put("nickname", row.get("nickname") == null ? "" : String.valueOf(row.get("nickname")));
            u.put("avatarUrl", row.get("avatar_url") == null ? "" : String.valueOf(row.get("avatar_url")));
            u.put("pulseId", row.get("pulse_id") == null ? "" : String.valueOf(row.get("pulse_id")));
            u.put("phone", maskPhone(row.get("phone") == null ? "" : String.valueOf(row.get("phone"))));
            list.add(u);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total == null ? 0 : total);
        result.put("page", p);
        result.put("size", s);
        return result;
    }

    @Transactional
    public Map<String, Object> create(String name, String url, boolean enabled, boolean isDefault, int sortOrder) {
        String safeName = trimName(name);
        String safeUrl = trimUrl(url);
        if (!StringUtils.hasText(safeUrl)) {
            throw new BizException("请先上传铃声文件");
        }
        if (isDefault) {
            clearDefault();
        } else if (!hasAnyDefault()) {
            isDefault = true;
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        boolean finalDefault = isDefault;
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO sys_call_ringtone(name, url, enabled, is_default, sort_order, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, new String[]{"id"});
            ps.setString(1, safeName);
            ps.setString(2, safeUrl);
            ps.setBoolean(3, enabled);
            ps.setBoolean(4, finalDefault);
            ps.setInt(5, sortOrder);
            ps.setObject(6, OffsetDateTime.now());
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new BizException("创建铃声失败");
        }
        return adminDetail(key.longValue());
    }

    @Transactional
    public Map<String, Object> update(long id, String name, String url, Boolean enabled, Boolean isDefault, Integer sortOrder) {
        Map<String, Object> existing = adminDetail(id);
        String safeName = name != null ? trimName(name) : String.valueOf(existing.get("name"));
        String safeUrl = url != null ? trimUrl(url) : String.valueOf(existing.get("url"));
        boolean en = enabled != null ? enabled : Boolean.TRUE.equals(existing.get("enabled"));
        boolean def = isDefault != null ? isDefault : Boolean.TRUE.equals(existing.get("isDefault"));
        int sort = sortOrder != null ? sortOrder : ((Number) existing.get("sortOrder")).intValue();
        if (!StringUtils.hasText(safeUrl)) {
            throw new BizException("铃声地址不能为空");
        }
        if (def) {
            clearDefault();
        }
        jdbcTemplate.update("""
                UPDATE sys_call_ringtone
                SET name = ?, url = ?, enabled = ?, is_default = ?, sort_order = ?, updated_at = ?
                WHERE id = ?
                """, safeName, safeUrl, en, def, sort, OffsetDateTime.now(), id);
        if (!hasAnyDefault()) {
            promoteFirstDefault();
        }
        return adminDetail(id);
    }

    @Transactional
    public void delete(long id) {
        Integer usage = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE ringtone_id = ?", Integer.class, id);
        if (usage != null && usage > 0) {
            jdbcTemplate.update("UPDATE sys_user SET ringtone_id = NULL WHERE ringtone_id = ?", id);
        }
        int n = jdbcTemplate.update("DELETE FROM sys_call_ringtone WHERE id = ?", id);
        if (n == 0) {
            throw new BizException("铃声不存在");
        }
        if (!hasAnyDefault()) {
            promoteFirstDefault();
        }
    }

    private void promoteFirstDefault() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id FROM sys_call_ringtone
                WHERE enabled = TRUE
                ORDER BY sort_order ASC, id ASC
                LIMIT 1
                """);
        if (rows.isEmpty()) {
            return;
        }
        long id = ((Number) rows.get(0).get("id")).longValue();
        clearDefault();
        jdbcTemplate.update(
                "UPDATE sys_call_ringtone SET is_default = TRUE, updated_at = ? WHERE id = ?",
                OffsetDateTime.now(), id);
    }

    private Map<String, Object> findEnabled(long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, name, url FROM sys_call_ringtone
                WHERE id = ? AND enabled = TRUE AND TRIM(url) <> ''
                """, id);
        return rows.isEmpty() ? null : toClientItem(rows.get(0));
    }

    private Map<String, Object> findDefault() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, name, url FROM sys_call_ringtone
                WHERE enabled = TRUE AND TRIM(url) <> ''
                ORDER BY is_default DESC, sort_order ASC, id ASC
                LIMIT 1
                """);
        return rows.isEmpty() ? null : toClientItem(rows.get(0));
    }

    private void clearDefault() {
        jdbcTemplate.update("UPDATE sys_call_ringtone SET is_default = FALSE");
    }

    private boolean hasAnyDefault() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_call_ringtone WHERE is_default = TRUE AND enabled = TRUE",
                Integer.class);
        return n != null && n > 0;
    }

    private Map<String, Object> toClientItem(Map<String, Object> row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", ((Number) row.get("id")).longValue());
        item.put("name", row.get("name") == null ? "" : String.valueOf(row.get("name")));
        item.put("url", row.get("url") == null ? "" : String.valueOf(row.get("url")));
        if (row.containsKey("is_default")) {
            item.put("isDefault", Boolean.TRUE.equals(row.get("is_default")));
        }
        return item;
    }

    private Map<String, Object> toAdminItem(Map<String, Object> row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", ((Number) row.get("id")).longValue());
        item.put("name", row.get("name") == null ? "" : String.valueOf(row.get("name")));
        item.put("url", row.get("url") == null ? "" : String.valueOf(row.get("url")));
        item.put("enabled", !Boolean.FALSE.equals(row.get("enabled")));
        item.put("isDefault", Boolean.TRUE.equals(row.get("is_default")));
        item.put("sortOrder", row.get("sort_order") == null ? 0 : ((Number) row.get("sort_order")).intValue());
        item.put("usageCount", row.get("usage_count") == null ? 0 : ((Number) row.get("usage_count")).intValue());
        item.put("createdAt", row.get("created_at"));
        item.put("updatedAt", row.get("updated_at"));
        return item;
    }

    private static String trimName(String name) {
        String n = name == null ? "" : name.trim();
        if (!StringUtils.hasText(n)) {
            n = "未命名铃声";
        }
        return n.length() > 128 ? n.substring(0, 128) : n;
    }

    private static String trimUrl(String url) {
        String u = url == null ? "" : url.trim();
        return u.length() > 512 ? u.substring(0, 512) : u;
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone == null ? "" : phone;
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
