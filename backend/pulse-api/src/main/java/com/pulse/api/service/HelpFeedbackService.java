package com.pulse.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HelpFeedbackService {
    private static final List<String> STATUSES = List.of("pending", "processing", "replied", "closed");
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public List<Map<String, Object>> publicFaqs() {
        return jdbcTemplate.queryForList("""
                SELECT id, title, sort_order, created_at, updated_at
                FROM sys_help_faq WHERE enabled = TRUE
                ORDER BY sort_order ASC, id ASC
                """);
    }

    public Map<String, Object> publicFaq(Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, title, answer, sort_order, created_at, updated_at
                FROM sys_help_faq WHERE id = ? AND enabled = TRUE
                """, id);
        if (rows.isEmpty()) throw new BizException("问题不存在或已停用");
        return rows.get(0);
    }

    public Map<String, Object> createFeedback(Long userId, String content, List<String> imageUrls) {
        if (userId == null) throw new BizException(401, "请先登录");
        String text = content == null ? "" : content.trim();
        List<String> images = sanitizeImages(imageUrls);
        if (!StringUtils.hasText(text) && images.isEmpty()) throw new BizException("请填写反馈内容或上传图片");
        if (text.length() > 2000) throw new BizException("反馈内容不能超过2000字");
        Long id = jdbcTemplate.queryForObject("""
                INSERT INTO sys_user_feedback(user_id, content, image_urls)
                VALUES (?, ?, ?::text) RETURNING id
                """, Long.class, userId, text, toJson(images));
        return Map.of("id", id, "status", "pending");
    }

    public Map<String, Object> adminFaqs(int page, int size, String keyword) {
        int p = Math.max(1, page);
        int s = Math.min(100, Math.max(1, size));
        String q = keyword == null ? "" : keyword.trim();
        String where = StringUtils.hasText(q) ? " WHERE title ILIKE ?" : "";
        Object[] countArgs = StringUtils.hasText(q) ? new Object[]{"%" + q + "%"} : new Object[]{};
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sys_help_faq" + where, Long.class, countArgs);
        Object[] args = StringUtils.hasText(q)
                ? new Object[]{"%" + q + "%", s, (p - 1) * s}
                : new Object[]{s, (p - 1) * s};
        List<Map<String, Object>> list = jdbcTemplate.queryForList("""
                SELECT id, title, answer, sort_order, enabled, created_at, updated_at
                FROM sys_help_faq
                """ + where + " ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?", args);
        return page(list, total, p, s);
    }

    public Map<String, Object> saveFaq(Long id, String title, String answer, Integer sortOrder, Boolean enabled) {
        String cleanTitle = title == null ? "" : title.trim();
        if (!StringUtils.hasText(cleanTitle)) throw new BizException("问题标题不能为空");
        if (cleanTitle.length() > 200) throw new BizException("问题标题不能超过200字");
        String cleanAnswer = answer == null ? "" : answer.trim();
        if (!StringUtils.hasText(cleanAnswer)) throw new BizException("问题回答不能为空");
        int sort = sortOrder == null ? 0 : sortOrder;
        boolean active = enabled == null || enabled;
        Long savedId;
        if (id == null) {
            savedId = jdbcTemplate.queryForObject("""
                    INSERT INTO sys_help_faq(title, answer, sort_order, enabled)
                    VALUES (?, ?, ?, ?) RETURNING id
                    """, Long.class, cleanTitle, cleanAnswer, sort, active);
        } else {
            int changed = jdbcTemplate.update("""
                    UPDATE sys_help_faq SET title=?, answer=?, sort_order=?, enabled=?, updated_at=NOW()
                    WHERE id=?
                    """, cleanTitle, cleanAnswer, sort, active, id);
            if (changed == 0) throw new BizException("问题不存在");
            savedId = id;
        }
        return jdbcTemplate.queryForMap("SELECT * FROM sys_help_faq WHERE id=?", savedId);
    }

    public void deleteFaq(Long id) {
        if (jdbcTemplate.update("DELETE FROM sys_help_faq WHERE id=?", id) == 0) throw new BizException("问题不存在");
    }

    public Map<String, Object> adminFeedback(int page, int size, String status, String keyword) {
        int p = Math.max(1, page);
        int s = Math.min(100, Math.max(1, size));
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        java.util.ArrayList<Object> params = new java.util.ArrayList<>();
        if (StringUtils.hasText(status)) {
            where.append(" AND f.status=?");
            params.add(status.trim());
        }
        if (StringUtils.hasText(keyword)) {
            where.append(" AND (f.content ILIKE ? OR u.nickname ILIKE ? OR u.phone ILIKE ?)");
            String like = "%" + keyword.trim() + "%";
            params.add(like); params.add(like); params.add(like);
        }
        Long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM sys_user_feedback f LEFT JOIN sys_user u ON u.id=f.user_id
                """ + where, Long.class, params.toArray());
        params.add(s);
        params.add((p - 1) * s);
        List<Map<String, Object>> list = jdbcTemplate.queryForList("""
                SELECT f.id, f.user_id, u.nickname, u.phone, u.pulse_id, f.content,
                       f.image_urls, f.status, f.reply, f.replied_at, f.created_at, f.updated_at
                FROM sys_user_feedback f LEFT JOIN sys_user u ON u.id=f.user_id
                """ + where + " ORDER BY f.created_at DESC LIMIT ? OFFSET ?", params.toArray());
        list.forEach(this::decodeImages);
        return page(list, total, p, s);
    }

    public Map<String, Object> feedbackDetail(Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT f.id, f.user_id, u.nickname, u.phone, u.pulse_id, f.content,
                       f.image_urls, f.status, f.reply, f.replied_at, f.created_at, f.updated_at
                FROM sys_user_feedback f LEFT JOIN sys_user u ON u.id=f.user_id WHERE f.id=?
                """, id);
        if (rows.isEmpty()) throw new BizException("反馈不存在");
        decodeImages(rows.get(0));
        return rows.get(0);
    }

    public Map<String, Object> updateFeedback(Long id, String status, String reply) {
        String state = status == null ? "" : status.trim();
        if (!STATUSES.contains(state)) throw new BizException("无效的处理状态");
        String cleanReply = reply == null ? "" : reply.trim();
        if (cleanReply.length() > 2000) throw new BizException("回复不能超过2000字");
        int changed = jdbcTemplate.update("""
                UPDATE sys_user_feedback SET status=?, reply=?, replied_at=CASE WHEN ?='replied' THEN NOW() ELSE replied_at END,
                updated_at=NOW() WHERE id=?
                """, state, cleanReply, state, id);
        if (changed == 0) throw new BizException("反馈不存在");
        return feedbackDetail(id);
    }

    private List<String> sanitizeImages(List<String> urls) {
        if (urls == null) return List.of();
        if (urls.size() > 6) throw new BizException("反馈图片最多上传6张");
        return urls.stream().filter(StringUtils::hasText).map(String::trim).peek(url -> {
            if (url.length() > 1000) throw new BizException("图片地址无效");
        }).toList();
    }

    private String toJson(List<String> value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new BizException("图片信息保存失败"); }
    }

    private void decodeImages(Map<String, Object> row) {
        try {
            row.put("image_urls", objectMapper.readValue(String.valueOf(row.get("image_urls")), new TypeReference<List<String>>() {}));
        } catch (Exception e) {
            row.put("image_urls", List.of());
        }
    }

    private Map<String, Object> page(List<Map<String, Object>> list, Long total, int p, int s) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total == null ? 0 : total);
        result.put("page", p);
        result.put("size", s);
        return result;
    }
}
