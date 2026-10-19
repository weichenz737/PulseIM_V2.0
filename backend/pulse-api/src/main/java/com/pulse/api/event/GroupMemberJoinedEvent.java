package com.pulse.api.event;

/** 成员已经写入群成员表后的入群事件。 */
public record GroupMemberJoinedEvent(Long conversationId, Long userId, Long memberId) {
}
