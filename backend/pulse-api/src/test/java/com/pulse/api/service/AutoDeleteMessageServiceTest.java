package com.pulse.api.service;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AutoDeleteMessageServiceTest {
    @Test
    void anyEnabledMemberActivatesAutoDeleteAndShortestTtlWins() {
        assertThat(AutoDeleteMessageService.effectiveTtlSeconds(List.of(604800)))
                .isEqualTo(604800);
        assertThat(AutoDeleteMessageService.effectiveTtlSeconds(List.of(2592000, 86400)))
                .isEqualTo(86400);
    }

    @Test
    void noEnabledMemberLeavesMessageWithoutExpiry() {
        assertThat(AutoDeleteMessageService.effectiveTtlSeconds(List.of()))
                .isNull();
        assertThat(AutoDeleteMessageService.effectiveTtlSeconds(Arrays.asList(0, -1, null)))
                .isNull();
    }
}
