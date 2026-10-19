package com.pulse.common.util;

import com.pulse.common.constant.SecurityConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

public class JwtUtil {
    private final SecretKey key;
    private final long expireMs;

    public JwtUtil(String secret, long expireMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireMs = expireMs;
    }

    public String createToken(Long userId, String role) {
        return createToken(userId, role, 0L);
    }

    public String createToken(Long userId, String role, long authVersion) {
        return createToken(userId, role, authVersion, null);
    }

    public String createToken(Long userId, String role, long authVersion, String deviceId) {
        long now = System.currentTimeMillis();
        Map<String, Object> claims = new java.util.HashMap<>();
        claims.put(SecurityConstants.CLAIM_USER_ID, userId);
        claims.put(SecurityConstants.CLAIM_ROLE, role);
        claims.put("authVersion", authVersion);
        if (deviceId != null && !deviceId.isBlank()) claims.put("deviceId", deviceId);
        return Jwts.builder()
                .claims(claims)
                .subject(String.valueOf(userId))
                .issuedAt(new Date(now))
                .expiration(new Date(now + expireMs))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Long getUserId(String token) {
        Object uid = parse(token).get(SecurityConstants.CLAIM_USER_ID);
        if (uid instanceof Integer i) {
            return i.longValue();
        }
        if (uid instanceof Long l) {
            return l;
        }
        return Long.valueOf(String.valueOf(uid));
    }

    public String getRole(String token) {
        return String.valueOf(parse(token).get(SecurityConstants.CLAIM_ROLE));
    }

    public long getAuthVersion(String token) {
        Object version = parse(token).get("authVersion");
        return version == null ? 0L : Long.parseLong(String.valueOf(version));
    }

    public String getDeviceId(String token) {
        Object deviceId = parse(token).get("deviceId");
        return deviceId == null ? null : String.valueOf(deviceId);
    }

    public boolean isValid(String token) {
        try {
            parse(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
