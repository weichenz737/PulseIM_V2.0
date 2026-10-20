package com.pulse.api.service;

import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImMessageMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationBurnReadTest {
    @Mock private ImConversationMemberMapper memberMapper;
    @Mock private ImMessageMapper messageMapper;
    @Mock private BurnAfterReadService burnAfterReadService;
    @InjectMocks private ConversationService service;

    @Test
    void startsNewBurnMessageEvenWhenReadWatermarkAlreadyAdvanced() {
        ImConversationMember member = new ImConversationMember();
        member.setLastReadMsgId("latest");
        ImMessage latest = new ImMessage();
        latest.setMsgId("latest");
        latest.setSendTime(OffsetDateTime.now());
        when(memberMapper.selectOne(any())).thenReturn(member);
        when(messageMapper.selectOne(any())).thenReturn(latest);
        when(burnAfterReadService.startCountdowns(7L, 12L, "latest"))
                .thenReturn(List.of(Map.of(
                        "msg_id", "burn-new",
                        "burn_read_at", OffsetDateTime.parse("2026-10-20T12:00:00Z"),
                        "burn_expires_at", OffsetDateTime.parse("2026-10-20T12:00:05Z"))));

        Map<String, Object> result = service.markRead(7L, 12L, "latest");

        verify(burnAfterReadService).startCountdowns(7L, 12L, "latest");
        assertThat(result.get("requestedReadMsgFound")).isEqualTo(true);
        assertThat((List<?>) result.get("burnStarted")).hasSize(1);
    }
}
