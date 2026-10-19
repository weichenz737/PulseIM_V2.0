package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class NicknameConfigService {
    public static final int USER_MIN_LENGTH = 1;
    public static final int USER_MAX_LENGTH = 64;
    public static final int COMMUNITY_MIN_LENGTH = 2;
    public static final int COMMUNITY_MAX_LENGTH = 30;
    private static final int DEFAULT_USER_LENGTH = 20;
    private static final int DEFAULT_COMMUNITY_LENGTH = 30;

    private final JdbcTemplate jdbcTemplate;
    private final SensitiveWordService sensitiveWordService;

    public Map<String, Object> getAdminConfig() {
        return readConfig();
    }

    public Map<String, Object> getClientConfig() {
        return readConfig();
    }

    public Map<String, Object> update(Integer userNicknameMaxLength, Integer communityNicknameMaxLength) {
        int userLength = userNicknameMaxLength == null
                ? readLength("user_nickname_max_length", DEFAULT_USER_LENGTH)
                : userNicknameMaxLength;
        int communityLength = communityNicknameMaxLength == null
                ? readLength("community_nickname_max_length", DEFAULT_COMMUNITY_LENGTH)
                : communityNicknameMaxLength;
        validateUserLength(userLength);
        validateCommunityLength(communityLength);
        jdbcTemplate.update("""
                UPDATE sys_nickname_config
                SET user_nickname_max_length=?, community_nickname_max_length=?, updated_at=NOW()
                WHERE id=1
                """, userLength, communityLength);
        return readConfig();
    }

    public String normalizeUserNickname(String raw) {
        String nickname = normalize(raw, "用户昵称");
        int maxLength = readLength("user_nickname_max_length", DEFAULT_USER_LENGTH);
        if (nickname.length() > maxLength) {
            throw new BizException("用户昵称不能超过" + maxLength + "个字符");
        }
        sensitiveWordService.assertCleanNickname(nickname);
        return nickname;
    }

    public String normalizeCommunityNickname(String raw) {
        String nickname = normalize(raw, "圈子昵称");
        int maxLength = readLength("community_nickname_max_length", DEFAULT_COMMUNITY_LENGTH);
        if (nickname.length() < COMMUNITY_MIN_LENGTH || nickname.length() > maxLength) {
            throw new BizException("圈子昵称须为" + COMMUNITY_MIN_LENGTH + "-" + maxLength + "个字符");
        }
        sensitiveWordService.assertCleanNickname(nickname);
        return nickname;
    }

    private Map<String, Object> readConfig() {
        Map<String, Object> row = jdbcTemplate.queryForMap("SELECT * FROM sys_nickname_config WHERE id=1");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userNicknameMaxLength", ((Number) row.get("user_nickname_max_length")).intValue());
        result.put("communityNicknameMaxLength", ((Number) row.get("community_nickname_max_length")).intValue());
        result.put("updatedAt", row.get("updated_at"));
        return result;
    }

    private int readLength(String column, int fallback) {
        Integer value = jdbcTemplate.queryForObject("SELECT " + column + " FROM sys_nickname_config WHERE id=1", Integer.class);
        return value == null ? fallback : value;
    }

    private static String normalize(String raw, String label) {
        String value = raw == null ? "" : raw.trim();
        if (!StringUtils.hasText(value)) {
            throw new BizException(label + "不能为空");
        }
        return value;
    }

    private static void validateUserLength(int length) {
        if (length < USER_MIN_LENGTH || length > USER_MAX_LENGTH) {
            throw new BizException("用户昵称长度须为" + USER_MIN_LENGTH + "-" + USER_MAX_LENGTH + "个字符");
        }
    }

    private static void validateCommunityLength(int length) {
        if (length < COMMUNITY_MIN_LENGTH || length > COMMUNITY_MAX_LENGTH) {
            throw new BizException("圈子昵称长度须为" + COMMUNITY_MIN_LENGTH + "-" + COMMUNITY_MAX_LENGTH + "个字符");
        }
    }
}
