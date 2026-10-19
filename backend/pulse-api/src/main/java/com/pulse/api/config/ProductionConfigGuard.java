package com.pulse.api.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/** Fails startup before a production instance can run with development credentials. */
@Component
@Profile("prod")
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class ProductionConfigGuard implements ApplicationRunner {
    private static final String DEFAULT_DB_PASSWORD = "pulse123";
    private static final String DEFAULT_JWT_SECRET = "pulse-im-jwt-secret-key-change-me-32bytes!!";

    private final Environment environment;

    @Override
    public void run(ApplicationArguments args) {
        List<String> errors = new ArrayList<>();
        rejectMissingOrDefault(errors, "DB_PASSWORD", DEFAULT_DB_PASSWORD);
        rejectMissingOrDefault(errors, "JWT_SECRET", DEFAULT_JWT_SECRET);
        require(errors, "TURN_CREDENTIAL");
        String corsOrigins = environment.getProperty("CORS_ALLOWED_ORIGINS", "").trim();
        if (!StringUtils.hasText(corsOrigins) || "*".equals(corsOrigins)) {
            errors.add("CORS_ALLOWED_ORIGINS must list trusted production origins");
        }

        String fixedCode = environment.getProperty("SMS_DEV_FIXED_CODE", "").trim();
        boolean fixedCodeExplicitlyEnabled = Boolean.parseBoolean(
                environment.getProperty("ALLOW_FIXED_SMS_CODE", "false").trim()
        );
        if (StringUtils.hasText(fixedCode) && !fixedCodeExplicitlyEnabled) {
            errors.add("SMS_DEV_FIXED_CODE requires ALLOW_FIXED_SMS_CODE=true in production");
        }
        if (!errors.isEmpty()) {
            throw new IllegalStateException("Unsafe production configuration: " + String.join("; ", errors));
        }
    }

    private void require(List<String> errors, String key) {
        if (!StringUtils.hasText(environment.getProperty(key))) {
            errors.add(key + " is required");
        }
    }

    private void rejectMissingOrDefault(List<String> errors, String key, String unsafeDefault) {
        String value = environment.getProperty(key);
        if (!StringUtils.hasText(value)) {
            errors.add(key + " is required");
        } else if (unsafeDefault.equals(value)) {
            errors.add(key + " still uses the development default");
        }
    }
}
