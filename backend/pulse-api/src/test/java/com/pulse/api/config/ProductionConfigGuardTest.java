package com.pulse.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProductionConfigGuardTest {
    private static final DefaultApplicationArguments NO_ARGS =
            new DefaultApplicationArguments(new String[0]);

    @Test
    void rejectsDevelopmentDefaults() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DB_PASSWORD", "pulse123")
                .withProperty("JWT_SECRET", "pulse-im-jwt-secret-key-change-me-32bytes!!")
                .withProperty("TURN_CREDENTIAL", "turn-secret")
                .withProperty("CORS_ALLOWED_ORIGINS", "*")
                .withProperty("SMS_DEV_FIXED_CODE", "1234");

        ProductionConfigGuard guard = new ProductionConfigGuard(env);
        assertThrows(IllegalStateException.class, () -> guard.run(NO_ARGS));
    }

    @Test
    void rejectsMissingRequiredSecrets() {
        ProductionConfigGuard guard = new ProductionConfigGuard(new MockEnvironment());
        assertThrows(IllegalStateException.class, () -> guard.run(NO_ARGS));
    }

    @Test
    void acceptsHardenedProductionConfiguration() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DB_PASSWORD", "a-long-random-database-password")
                .withProperty("JWT_SECRET", "a-long-random-jwt-secret-that-is-not-the-default")
                .withProperty("TURN_CREDENTIAL", "a-long-random-turn-secret")
                .withProperty("CORS_ALLOWED_ORIGINS", "https://chat.example.com,https://localhost")
                .withProperty("SMS_DEV_FIXED_CODE", "");

        ProductionConfigGuard guard = new ProductionConfigGuard(env);
        assertDoesNotThrow(() -> guard.run(NO_ARGS));
    }
}
