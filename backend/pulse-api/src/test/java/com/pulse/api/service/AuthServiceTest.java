package com.pulse.api.service;

import com.pulse.api.config.SmsProperties;
import com.pulse.api.dto.AuthDtos;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.entity.SysUser;
import com.pulse.api.support.UserIdentityAllocator;
import com.pulse.common.exception.BizException;
import com.pulse.common.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceTest {
    @Test
    void recordsFailedPasswordLoginForUnknownUser() {
        SysUserMapper userMapper = mock(SysUserMapper.class);
        LoginLogService loginLogService = mock(LoginLogService.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOps = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(valueOps);
        AuthService service = new AuthService(
                userMapper,
                mock(SysAdminMapper.class),
                mock(PasswordEncoder.class),
                mock(JwtUtil.class),
                redis,
                new SmsProperties(),
                mock(UserIdentityAllocator.class),
                loginLogService,
                mock(AdminAuditService.class),
                mock(AdminPermissionService.class),
                mock(JdbcTemplate.class),
                mock(DefaultFriendService.class),
                mock(ClientAccessConfigService.class));
        AuthDtos.LoginPasswordReq request = new AuthDtos.LoginPasswordReq();
        request.setPhone("13800138000");
        request.setPassword("incorrect");

        assertThrows(BizException.class, () -> service.loginByPassword(request));

        verify(loginLogService).recordFailure(eq("13800138000"), eq("password"), anyString());
        verify(userMapper, never()).updateById(org.mockito.ArgumentMatchers.any(SysUser.class));
    }
}
