package com.pulse.api.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.util.StringUtils;

/**
 * 登录态 HttpOnly Cookie 工具。
 * <p>
 * 聊天附件 / 头像等通过 <img>/<video> 直接加载，无法携带 Authorization 头，
 * 因此登录时额外下发 HttpOnly Cookie，供浏览器自动携带；
 * HTTPS 下使用 SameSite=None + Secure（兼容 Capacitor WebView 跨站加载），
 * HTTP 开发环境使用 SameSite=Lax；
 * JS 无法读取，降低 XSS 窃取令牌的风险。
 */
public final class AuthCookieUtil {
    public static final String COOKIE_NAME = "pulse_token";
    /**
     * Cookie 仅用于 <img>/<video> 等无法携带 Authorization 头的附件请求，
     * 因此收窄到 raw 路径，避免其他接口暴露在 Cookie 鉴权下（缩小 CSRF 面）。
     */
    private static final String COOKIE_PATH = "/api/v1/files";
    /** 管理端附件由 <img>/<video>/<audio> 直接读取，单独限制 Cookie 作用域。 */
    private static final String ADMIN_COOKIE_PATH = "/api/admin/messages/files";
    private static final String LEGACY_COOKIE_PATH = "/api/v1/files/raw";

    private AuthCookieUtil() {
    }

    public static void issue(HttpServletRequest request, HttpServletResponse response,
                             String token, long maxAgeSeconds) {
        if (!StringUtils.hasText(token)) {
            return;
        }
        boolean https = isHttps(request);
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .secure(https)
                // 打包后的 Capacitor WebView 里 <img> 是跨站请求，
                // 需要 None + Secure 才会携带；浏览器同源场景用 Lax 更安全
                .sameSite(https ? "None" : "Lax")
                .path(cookiePath(request))
                .maxAge(Math.max(1, maxAgeSeconds))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        clearLegacyCookieIfNeeded(request, response);
    }

    public static void clear(HttpServletRequest request, HttpServletResponse response) {
        boolean https = isHttps(request);
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(https)
                .sameSite(https ? "None" : "Lax")
                .path(cookiePath(request))
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        clearLegacyCookieIfNeeded(request, response);
    }

    public static String resolveToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName()) && StringUtils.hasText(cookie.getValue())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private static void clearLegacyCookieIfNeeded(HttpServletRequest request, HttpServletResponse response) {
        if (LEGACY_COOKIE_PATH.equals(cookiePath(request))) {
            return;
        }
        boolean https = isHttps(request);
        ResponseCookie legacy = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(https)
                .sameSite(https ? "None" : "Lax")
                .path(LEGACY_COOKIE_PATH)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, legacy.toString());
    }

    private static boolean isHttps(HttpServletRequest request) {
        if (request.isSecure()) {
            return true;
        }
        String forwarded = request.getHeader("X-Forwarded-Proto");
        return StringUtils.hasText(forwarded) && "https".equalsIgnoreCase(forwarded.trim());
    }

    /**
     * Reverse proxies may mount the application below a path such as /pulseim.
     * In that case a cookie scoped only to /api/v1/files will not be sent
     * to /pulseim/api/v1/files by browsers or Capacitor WebViews.
     */
    private static String cookiePath(HttpServletRequest request) {
        String forwardedPrefix = request.getHeader("X-Forwarded-Prefix");
        if (StringUtils.hasText(forwardedPrefix)) {
            String prefix = forwardedPrefix.trim();
            if (!prefix.startsWith("/")) {
                prefix = "/" + prefix;
            }
            while (prefix.length() > 1 && prefix.endsWith("/")) {
                prefix = prefix.substring(0, prefix.length() - 1);
            }
            return prefix;
        }
        String uri = request.getRequestURI();
        if (uri != null && uri.startsWith("/api/admin/")) {
            return ADMIN_COOKIE_PATH;
        }
        return COOKIE_PATH;
    }
}
