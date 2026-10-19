package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class ConversationReadStateVO {
    private Long conversationId;
    /** 1 私聊 / 2 群聊 */
    private Integer conversationType;
    private Boolean readReceiptEnabled;
    /** 当前用户已读水位 */
    private String myLastReadMsgId;
    private Long myLastReadSendTime;
    /** 私聊对方已读水位 */
    private String peerLastReadMsgId;
    private Long peerLastReadSendTime;
    private List<MemberReadState> members;

    @Data
    @Builder
    public static class MemberReadState {
        private Long userId;
        private String lastReadMsgId;
        private Long lastReadSendTime;
        private OffsetDateTime lastReadAt;
    }
}
