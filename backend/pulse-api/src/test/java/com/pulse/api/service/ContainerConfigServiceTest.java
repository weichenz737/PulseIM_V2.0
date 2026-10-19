package com.pulse.api.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ContainerConfigServiceTest {
    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final ContainerConfigService service = new ContainerConfigService(jdbcTemplate);

    @BeforeEach
    void targetServerIsConfigured() {
        when(jdbcTemplate.queryForList(anyString()))
                .thenReturn(List.of(Map.of("target_server_origin", "https://117.72.220.127:9001")));
    }

    @Test
    void rejectsCleanupWhenSourceIsRegisteredTarget() {
        assertThatThrownBy(() -> service.assertCleanupSourceIsNotTarget("117.72.220.127"))
                .hasMessageContaining("不能是已登记的新服务器地址");
    }

    @Test
    void allowsCleanupOnDifferentSourceServer() {
        assertThatCode(() -> service.assertCleanupSourceIsNotTarget("110.42.238.238"))
                .doesNotThrowAnyException();
    }
}
