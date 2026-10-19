package com.pulse.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 登录类接口的按 IP 简单限流（30 次/分钟），降低撞库与批量爆破风险。
 */
@Component
@RequiredArgsConstructor
public class AuthThrottleFilter extends OncePerRequestFilter {
    private static final Set<String> THROTTLED_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/admin/auth/login"
    );
    private static final int MAX_PER_MINUTE = 30;

    private final StringRedisTemplate redis;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        if (path == null || path.endsWith("/")) {
            path = path == null ? "" : path.substring(0, path.length() - 1);
        }
        return !THROTTLED_PATHS.contains(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String ip = clientIp(request);
        String key = "pulse:auth:req:ip:" + ip;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, 60, TimeUnit.SECONDS);
        }
        if (count != null && count > MAX_PER_MINUTE) {
            SecurityResponseWriter.write(response, 429, "请求过于频繁，请稍后再试");
            return;
        }
        chain.doFilter(request, response);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            int comma = forwarded.indexOf(',');
            String first = (comma >= 0 ? forwarded.substring(0, comma) : forwarded).trim();
            if (StringUtils.hasText(first)) {
                return first;
            }
        }
        String ip = request.getRemoteAddr();
        return StringUtils.hasText(ip) ? ip : "unknown";
    }
}
