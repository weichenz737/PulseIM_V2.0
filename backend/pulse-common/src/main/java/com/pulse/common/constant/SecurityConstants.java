package com.pulse.common.constant;

public final class SecurityConstants {
    private SecurityConstants() {
    }

    public static final String TOKEN_HEADER = "Authorization";
    public static final String TOKEN_PREFIX = "Bearer ";
    public static final String CLAIM_USER_ID = "uid";
    public static final String CLAIM_ROLE = "role";
    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";
}
