package com.pulse.api.support;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;

/**
 * 生成不可顺序枚举的用户 ID / PulseID。
 */
@Component
@RequiredArgsConstructor
public class UserIdentityAllocator {
    /** 12 位：100000000000 ~ 999999999999，落在 JS 安全整数范围内 */
    private static final long USER_ID_MIN = 100_000_000_000L;
    private static final long USER_ID_SPAN = 900_000_000_000L;
    private static final int MAX_TRY = 48;

    private final SysUserMapper userMapper;
    private final SecureRandom random = new SecureRandom();

    public long allocateUserId() {
        for (int i = 0; i < MAX_TRY; i++) {
            long id = USER_ID_MIN + Math.floorMod(random.nextLong(), USER_ID_SPAN);
            if (userMapper.selectById(id) == null) {
                return id;
            }
        }
        throw new BizException("生成用户 ID 失败，请重试");
    }

    /** 随机 7 位 PulseID：1000000 ~ 9999999 */
    public String allocatePulseId() {
        for (int i = 0; i < MAX_TRY; i++) {
            String pulseId = String.format("%07d", 1_000_000 + random.nextInt(9_000_000));
            Long count = userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getPulseId, pulseId));
            if (count == null || count == 0L) {
                return pulseId;
            }
        }
        throw new BizException("生成 PulseID 失败，请重试");
    }

    /** 补齐缺失的 PulseID（不再用自增 id 推导，避免可枚举） */
    public void ensurePulseId(SysUser user) {
        if (user == null || user.getId() == null) {
            return;
        }
        if (StringUtils.hasText(user.getPulseId()) && user.getPulseId().matches("\\d{7}")) {
            return;
        }
        user.setPulseId(allocatePulseId());
        userMapper.updateById(user);
    }
}
