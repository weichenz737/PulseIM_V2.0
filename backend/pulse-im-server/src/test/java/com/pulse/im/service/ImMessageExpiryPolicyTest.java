package com.pulse.im.service;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ImMessageExpiryPolicyTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ImMessageExpiryPolicy policy = new ImMessageExpiryPolicy(jdbc);
    private final OffsetDateTime sentAt = OffsetDateTime.parse("2026-10-20T12:00:00Z");

    @Test
    void websocketTextSnapshotsBurnAndAutoDeleteSettings() {
        when(jdbc.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), eq(7L), eq(12L)))
                .thenReturn(List.of(15));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(12L), eq(7L)))
                .thenReturn(60);

        ImMessageExpiryPolicy.Snapshot snapshot = policy.resolve(7L, 12L, 0, sentAt);

        assertTrue(snapshot.burnAfterRead());
        assertEquals(15, snapshot.burnSeconds());
        assertEquals(sentAt.plusSeconds(60), snapshot.autoDeleteExpiresAt());
    }

    @Test
    void unsupportedMessageTypeCannotBurn() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(12L), eq(7L)))
                .thenReturn(null);

        ImMessageExpiryPolicy.Snapshot snapshot = policy.resolve(7L, 12L, 4, sentAt);

        assertFalse(snapshot.burnAfterRead());
        assertNull(snapshot.autoDeleteExpiresAt());
        verify(jdbc, never()).query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(), any());
    }
}
