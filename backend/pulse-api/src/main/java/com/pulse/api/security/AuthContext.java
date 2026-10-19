package com.pulse.api.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class AuthContext {
    private AuthContext() {
    }

    public static Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            return null;
        }
        Object p = auth.getPrincipal();
        if (p instanceof Long l) {
            return l;
        }
        try {
            return Long.valueOf(String.valueOf(p));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static String currentDeviceId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getDetails() == null) {
            return null;
        }
        String deviceId = String.valueOf(auth.getDetails()).trim();
        return deviceId.isEmpty() ? null : deviceId;
    }
}
