package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SensitiveWordService {
    private final JdbcTemplate jdbcTemplate;

    private volatile List<String> cachedWords = List.of();
    private volatile long loadedAt = 0L;
    private static final long CACHE_TTL_MS = 15_000L;

    /** 聊天文本、朋友圈和圈子动态命中启用敏感词时抛出业务异常 */
    public void assertCleanText(String content) {
        assertClean(content, "内容包含敏感词，无法发布或发送");
    }

    /** 用户昵称和圈子昵称命中启用敏感词时禁止保存。 */
    public void assertCleanNickname(String content) {
        assertClean(content, "昵称包含敏感词，无法设置");
    }

    private void assertClean(String content, String message) {
        String text = content == null ? "" : content;
        if (!StringUtils.hasText(text)) {
            return;
        }
        ensureLoaded();
        List<String> words = cachedWords;
        if (words.isEmpty()) {
            return;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        for (String word : words) {
            if (!StringUtils.hasText(word)) {
                continue;
            }
            if (text.contains(word) || lower.contains(word.toLowerCase(Locale.ROOT))) {
                throw new BizException(message);
            }
        }
    }

    public synchronized void reload() {
        List<String> list = jdbcTemplate.query(
                """
                        SELECT word FROM sys_sensitive_word
                        WHERE enabled = TRUE
                        ORDER BY CHAR_LENGTH(word) DESC, id ASC
                        """,
                (rs, rowNum) -> {
                    String w = rs.getString("word");
                    return w == null ? "" : w.trim();
                });
        List<String> cleaned = new ArrayList<>();
        for (String w : list) {
            if (StringUtils.hasText(w)) {
                cleaned.add(w);
            }
        }
        cachedWords = List.copyOf(cleaned);
        loadedAt = System.currentTimeMillis();
    }

    private void ensureLoaded() {
        if (System.currentTimeMillis() - loadedAt < CACHE_TTL_MS && loadedAt > 0) {
            return;
        }
        reload();
    }

    public Map<String, Object> adminList(int page, int size, String keyword, Boolean enabled) {
        int p = Math.max(1, page);
        int s = Math.min(200, Math.max(1, size));
        String q = keyword == null ? "" : keyword.trim();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(q)) {
            where.append(" AND word ILIKE ?");
            args.add("%" + q + "%");
        }
        if (enabled != null) {
            where.append(" AND enabled = ?");
            args.add(enabled);
        }
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_sensitive_word" + where,
                Long.class,
                args.toArray());
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(s);
        listArgs.add((p - 1) * s);
        List<Map<String, Object>> list = jdbcTemplate.queryForList(
                """
                        SELECT id, word, enabled, created_at, updated_at
                        FROM sys_sensitive_word
                        """ + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                listArgs.toArray());
        Map<String, Object> pageMap = new LinkedHashMap<>();
        pageMap.put("list", list);
        pageMap.put("total", total == null ? 0 : total);
        pageMap.put("page", p);
        pageMap.put("size", s);
        return pageMap;
    }

    public Map<String, Object> save(Long id, String word, Boolean enabled) {
        String clean = normalizeWord(word);
        boolean active = enabled == null || enabled;
        if (id == null) {
            Long exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_sensitive_word WHERE word = ?",
                    Long.class,
                    clean);
            if (exists != null && exists > 0) {
                throw new BizException("该敏感词已存在");
            }
            Long savedId = jdbcTemplate.queryForObject(
                    """
                            INSERT INTO sys_sensitive_word(word, enabled)
                            VALUES (?, ?) RETURNING id
                            """,
                    Long.class,
                    clean,
                    active);
            reload();
            return jdbcTemplate.queryForMap("SELECT * FROM sys_sensitive_word WHERE id=?", savedId);
        }
        Long dup = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_sensitive_word WHERE word = ? AND id <> ?",
                Long.class,
                clean,
                id);
        if (dup != null && dup > 0) {
            throw new BizException("该敏感词已存在");
        }
        int changed = jdbcTemplate.update(
                """
                        UPDATE sys_sensitive_word
                        SET word=?, enabled=?, updated_at=NOW()
                        WHERE id=?
                        """,
                clean,
                active,
                id);
        if (changed == 0) {
            throw new BizException("敏感词不存在");
        }
        reload();
        return jdbcTemplate.queryForMap("SELECT * FROM sys_sensitive_word WHERE id=?", id);
    }

    public void delete(Long id) {
        if (jdbcTemplate.update("DELETE FROM sys_sensitive_word WHERE id=?", id) == 0) {
            throw new BizException("敏感词不存在");
        }
        reload();
    }

    /** 批量导入：按换行 / 逗号 / 中文逗号 / 顿号拆分 */
    public Map<String, Object> batchImport(String raw, Boolean enabled) {
        if (!StringUtils.hasText(raw)) {
            throw new BizException("请填写敏感词");
        }
        boolean active = enabled == null || enabled;
        String[] parts = raw.split("[\\r\\n,，、;；]+");
        Set<String> uniq = new LinkedHashSet<>();
        for (String part : parts) {
            String w = part == null ? "" : part.trim();
            if (StringUtils.hasText(w)) {
                if (w.length() > 128) {
                    throw new BizException("敏感词不能超过128字：" + w.substring(0, 16) + "…");
                }
                uniq.add(w);
            }
        }
        if (uniq.isEmpty()) {
            throw new BizException("未解析到有效敏感词");
        }
        int inserted = 0;
        int skipped = 0;
        for (String w : uniq) {
            Long exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_sensitive_word WHERE word = ?",
                    Long.class,
                    w);
            if (exists != null && exists > 0) {
                skipped++;
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_sensitive_word(word, enabled) VALUES (?, ?)",
                    w,
                    active);
            inserted++;
        }
        reload();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("inserted", inserted);
        result.put("skipped", skipped);
        result.put("total", uniq.size());
        return result;
    }

    private static String normalizeWord(String word) {
        String clean = word == null ? "" : word.trim();
        if (!StringUtils.hasText(clean)) {
            throw new BizException("敏感词不能为空");
        }
        if (clean.length() > 128) {
            throw new BizException("敏感词不能超过128字");
        }
        return clean;
    }
}
