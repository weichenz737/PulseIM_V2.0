package com.pulse.api.service;

import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 展示昵称优先级：后台设置的客服昵称（默认好友自定义昵称）＞好友备注＞用户昵称。
 * 保证默认好友昵称在其他任何页面展示一致。
 */
@Service
@RequiredArgsConstructor
public class DisplayNameService {
    private final JdbcTemplate jdbcTemplate;
    private final SysUserMapper userMapper;

    public String displayName(Long viewerId, Long targetUserId) {
        return displayName(viewerId, null, targetUserId);
    }

    public String displayName(Long viewerId, SysUser target, Long targetUserId) {
        if (targetUserId != null && (viewerId == null || !viewerId.equals(targetUserId))) {
            // 1) 后台设置的客服昵称：对所有查看者一致，优先级最高
            String serviceNickname = customerServiceNickname(targetUserId);
            if (StringUtils.hasText(serviceNickname)) {
                return serviceNickname.trim();
            }
        }
        // 2) 好友备注：查看者对该好友的备注
        if (viewerId != null && targetUserId != null && !viewerId.equals(targetUserId)) {
            String remark = friendRemark(viewerId, targetUserId);
            if (StringUtils.hasText(remark)) {
                return remark.trim();
            }
        }
        // 3) 用户真实昵称
        if (target == null && targetUserId != null) {
            target = userMapper.selectById(targetUserId);
        }
        if (target != null && StringUtils.hasText(target.getNickname())) {
            return target.getNickname();
        }
        return targetUserId == null ? "未知用户" : ("用户" + targetUserId);
    }

    private String customerServiceNickname(Long friendUserId) {
        List<String> names = jdbcTemplate.query("""
                SELECT i.custom_nickname
                FROM sys_default_friend_item i
                JOIN sys_default_friend_config c ON c.id=1
                WHERE c.enabled=TRUE AND i.friend_user_id=?
                  AND i.nickname_mode='custom' AND NULLIF(TRIM(i.custom_nickname),'') IS NOT NULL
                LIMIT 1
                """, (rs, rowNum) -> rs.getString(1), friendUserId);
        return names.isEmpty() ? null : names.get(0);
    }

    private String friendRemark(Long viewerId, Long friendId) {
        List<String> remarks = jdbcTemplate.query(
                "SELECT remark FROM im_friend WHERE user_id=? AND friend_id=? LIMIT 1",
                (rs, rowNum) -> rs.getString(1),
                viewerId, friendId);
        return remarks.isEmpty() ? null : remarks.get(0);
    }
}
