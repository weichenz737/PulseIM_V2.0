package com.pulse.api.security;

import com.pulse.common.constant.SecurityConstants;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redis;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = null;
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(header) && header.startsWith(SecurityConstants.TOKEN_PREFIX)) {
            token = header.substring(SecurityConstants.TOKEN_PREFIX.length());
        } else if (isAttachmentRequest(request)) {
            // <img>/<video> 等附件请求无法携带 Authorization 头，
            // 仅在只读附件路径上回退到 HttpOnly Cookie
            token = AuthCookieUtil.resolveToken(request);
        }
        if (StringUtils.hasText(token)) {
            try {
                if (jwtUtil.isValid(token)) {
                    Long userId = jwtUtil.getUserId(token);
                    String role = jwtUtil.getRole(token);
                    if (SecurityConstants.ROLE_USER.equals(role)
                            && jwtUtil.getAuthVersion(token) != currentAuthVersion(userId)) {
                        filterChain.doFilter(request, response);
                        return;
                    }
                    String deviceId = jwtUtil.getDeviceId(token);
                    if (SecurityConstants.ROLE_USER.equals(role)
                            && StringUtils.hasText(deviceId)
                            && Boolean.TRUE.equals(redis.hasKey(RedisKeys.userDeviceRevoked(userId, deviceId)))) {
                        filterChain.doFilter(request, response);
                        return;
                    }
                    var auth = new UsernamePasswordAuthenticationToken(
                            userId,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                    );
                    auth.setDetails(deviceId);
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (Exception ignored) {
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private long currentAuthVersion(Long userId) {
        String value = redis.opsForValue().get(RedisKeys.userAuthVersion(userId));
        return StringUtils.hasText(value) ? Long.parseLong(value) : 0L;
    }

    private static boolean isAttachmentRequest(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        String uri = request.getRequestURI();
        return uri != null && (uri.startsWith("/api/v1/files/raw/")
                || uri.matches("/api/v1/files/[^/]+/(download|preview)/?")
                || uri.matches("/api/admin/messages/files/[^/]+/?"));
    }
}
