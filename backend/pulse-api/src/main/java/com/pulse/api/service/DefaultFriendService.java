package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DefaultFriendService {
    private final JdbcTemplate jdbcTemplate;
    private final ConversationService conversationService;

    public DefaultFriendService(JdbcTemplate jdbcTemplate, @Lazy ConversationService conversationService) {
        this.jdbcTemplate = jdbcTemplate;
        this.conversationService = conversationService;
    }

    public boolean isConfiguredDefaultFriend(Long userId) {
        if (userId == null) return false;
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM sys_default_friend_item i
                JOIN sys_default_friend_config c ON c.id=1
                WHERE c.enabled=TRUE AND i.friend_user_id=?
                """, Integer.class, userId);
        return count != null && count > 0;
    }

    public Map<String, Object> getConfig() {
        Boolean enabled = jdbcTemplate.queryForObject(
                "SELECT enabled FROM sys_default_friend_config WHERE id=1", Boolean.class);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT i.friend_user_id, i.nickname_mode, i.custom_nickname, i.tag, i.greeting_text,
                       u.nickname AS friend_nickname, u.phone AS friend_phone,
                       u.pulse_id AS friend_pulse_id, u.avatar_url AS friend_avatar_url,
                       (SELECT COUNT(*) FROM im_friend f
                        WHERE f.friend_id=i.friend_user_id AND f.add_source='default_friend') AS affected_users
                FROM sys_default_friend_item i
                JOIN sys_user u ON u.id=i.friend_user_id
                ORDER BY i.sort_order, i.created_at
                """);
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("friendUserId", row.get("friend_user_id"));
            item.put("nicknameMode", row.getOrDefault("nickname_mode", "original"));
            item.put("customNickname", row.get("custom_nickname"));
            item.put("tag", row.get("tag"));
            item.put("greetingText", row.get("greeting_text"));
            item.put("friendNickname", row.get("friend_nickname"));
            item.put("friendPhone", row.get("friend_phone"));
            item.put("friendPulseId", row.get("friend_pulse_id"));
            item.put("friendAvatarUrl", row.get("friend_avatar_url"));
            item.put("affectedUsers", row.get("affected_users"));
            items.add(item);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", Boolean.TRUE.equals(enabled));
        out.put("items", items);
        out.put("affectedUsers", jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT user_id) FROM im_friend WHERE add_source='default_friend'",
                Integer.class));
        return out;
    }

    @Transactional
    public Map<String, Object> saveConfig(Map<String, Object> body) {
        Boolean previouslyEnabled = jdbcTemplate.queryForObject(
                "SELECT enabled FROM sys_default_friend_config WHERE id=1", Boolean.class);
        Set<Long> previousIds = new LinkedHashSet<>(jdbcTemplate.query(
                "SELECT friend_user_id FROM sys_default_friend_item",
                (rs, rowNum) -> rs.getLong(1)));
        boolean enabled = body != null
                && Boolean.parseBoolean(String.valueOf(body.getOrDefault("enabled", false)));
        List<?> rawItems = body != null && body.get("items") instanceof List<?> list ? list : List.of();
        List<FriendItem> items = new ArrayList<>();
        Set<Long> ids = new LinkedHashSet<>();
        for (Object raw : rawItems) {
            if (!(raw instanceof Map<?, ?> map)) continue;
            Long friendId = longValue(map.get("friendUserId"));
            if (friendId == null || !userExists(friendId)) throw new BizException("请选择有效的默认好友");
            if (!ids.add(friendId)) throw new BizException("默认好友不能重复");
            String mode = "custom".equalsIgnoreCase(String.valueOf(map.get("nicknameMode")))
                    ? "custom" : "original";
            String custom = clean(map.get("customNickname"), 64);
            if ("custom".equals(mode) && !StringUtils.hasText(custom)) {
                throw new BizException("请输入自定义昵称");
            }
            String tag = clean(map.get("tag"), 32);
            String greetingText = clean(map.get("greetingText"), 500);
            items.add(new FriendItem(friendId, mode, custom, tag, greetingText));
        }
        if (enabled && items.isEmpty()) throw new BizException("请至少选择一个默认好友");

        jdbcTemplate.update("""
                UPDATE sys_default_friend_config
                SET enabled=?, friend_user_id=NULL, nickname_mode='original',
                    custom_nickname=NULL, updated_at=NOW()
                WHERE id=1
                """, enabled);
        jdbcTemplate.update("DELETE FROM sys_default_friend_item");
        for (int i = 0; i < items.size(); i++) {
            FriendItem item = items.get(i);
            jdbcTemplate.update("""
                    INSERT INTO sys_default_friend_item
                    (friend_user_id, nickname_mode, custom_nickname, tag, greeting_text, sort_order, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, NOW())
                    """, item.friendId(), item.mode(), item.customNickname(), item.tag(),
                    item.greetingText(), i);
        }

        removeAllManagedRelations();
        if (enabled) {
            for (FriendItem item : items) {
                applyToAllUsers(item.friendId(),
                        "custom".equals(item.mode()) ? item.customNickname() : null,
                        item.tag(),
                        (!Boolean.TRUE.equals(previouslyEnabled) || !previousIds.contains(item.friendId()))
                                ? item.greetingText() : null);
            }
        }
        return getConfig();
    }

    @Transactional
    public void applyToNewUser(Long userId) {
        syncUserRelations(userId, true);
    }

    /** 读取联系人列表时补齐当前默认好友关系，保证各端展示一致。 */
    public void ensureForUser(Long userId) {
        syncUserRelations(userId, false);
    }

    private void syncUserRelations(Long userId, boolean sendGreeting) {
        if (userId == null) return;
        Boolean enabled = jdbcTemplate.queryForObject(
                "SELECT enabled FROM sys_default_friend_config WHERE id=1", Boolean.class);
        if (!Boolean.TRUE.equals(enabled)) return;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT friend_user_id, nickname_mode, custom_nickname, tag, greeting_text
                FROM sys_default_friend_item ORDER BY sort_order, created_at
                """);
        for (Map<String, Object> row : rows) {
            Long friendId = longValue(row.get("friend_user_id"));
            if (friendId == null || friendId.equals(userId) || !userExists(friendId)) continue;
            String remark = "custom".equals(row.get("nickname_mode"))
                    ? clean(row.get("custom_nickname"), 64) : null;
            String tag = clean(row.get("tag"), 32);
            upsertPair(userId, friendId, remark, tag);
            if (sendGreeting) {
                try {
                    conversationService.sendDefaultFriendGreeting(
                            friendId, userId, clean(row.get("greeting_text"), 500));
                } catch (Exception ignored) {
                // 会话可在首次拉列表时补齐
                }
            }
        }
    }

    private void applyToAllUsers(Long friendId, String remark, String tag, String greetingText) {
        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, remark, tag, add_source, add_initiator_id, created_at)
                SELECT id, ?, ?, ?, 'default_friend', ?, NOW()
                FROM sys_user WHERE id <> ?
                ON CONFLICT (user_id, friend_id) DO UPDATE
                SET remark=EXCLUDED.remark, tag=EXCLUDED.tag, add_source='default_friend'
                """, friendId, remark, tag, friendId, friendId);
        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, add_source, add_initiator_id, created_at)
                SELECT ?, id, 'default_friend', ?, NOW()
                FROM sys_user WHERE id <> ?
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """, friendId, friendId, friendId);
        if (StringUtils.hasText(greetingText)) {
            List<Long> userIds = jdbcTemplate.query(
                    "SELECT id FROM sys_user WHERE id<>?",
                    (rs, rowNum) -> rs.getLong(1),
                    friendId);
            for (Long userId : userIds) {
                try {
                    conversationService.sendDefaultFriendGreeting(friendId, userId, greetingText);
                } catch (Exception ignored) {
                    // 单个用户发送失败不阻断全站默认好友配置。
                }
            }
        }
    }

    private void upsertPair(Long userId, Long friendId, String remark, String tag) {
        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, remark, tag, add_source, add_initiator_id, created_at)
                VALUES (?, ?, ?, ?, 'default_friend', ?, NOW())
                ON CONFLICT (user_id, friend_id) DO UPDATE
                SET remark=EXCLUDED.remark, tag=EXCLUDED.tag, add_source='default_friend'
                """, userId, friendId, remark, tag, friendId);
        jdbcTemplate.update("""
                INSERT INTO im_friend(user_id, friend_id, add_source, add_initiator_id, created_at)
                VALUES (?, ?, 'default_friend', ?, NOW())
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """, friendId, userId, friendId);
    }

    private void removeAllManagedRelations() {
        jdbcTemplate.update("DELETE FROM im_friend WHERE add_source='default_friend'");
    }

    private boolean userExists(Long id) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE id=?", Integer.class, id);
        return count != null && count > 0;
    }

    private static Long longValue(Object value) {
        if (value == null) return null;
        try {
            long id = Long.parseLong(String.valueOf(value));
            return id > 0 ? id : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String clean(Object value, int max) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        if (!StringUtils.hasText(text)) return null;
        return text.length() <= max ? text : text.substring(0, max);
    }

    private record FriendItem(
            Long friendId,
            String mode,
            String customNickname,
            String tag,
            String greetingText
    ) {}
}
