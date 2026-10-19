package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
public class GlobalSearchVO {
    @Builder.Default
    private List<ContactHit> contacts = new ArrayList<>();
    @Builder.Default
    private List<GroupHit> groups = new ArrayList<>();
    /** @deprecated 兼容旧前端；优先使用 conversations */
    @Builder.Default
    private List<MessageHit> messages = new ArrayList<>();
    /** 按会话聚合的聊天记录命中（微信样式） */
    @Builder.Default
    private List<ConversationHit> conversations = new ArrayList<>();

    @Data
    @Builder
    public static class ContactHit {
        private Long userId;
        private String nickname;
        private String avatarUrl;
        private Boolean online;
        private String subtitle;
        /** 是否为系统文件传输助手账号。 */
        private Boolean fileTransferAssistant;
    }

    @Data
    @Builder
    public static class GroupHit {
        private Long id;
        private String title;
        private String avatarUrl;
        private Integer memberCount;
    }

    @Data
    @Builder
    public static class MessageHit {
        private String msgId;
        private Long conversationId;
        private String conversationTitle;
        private Integer conversationType;
        private String fromNickname;
        private String content;
        private Integer msgType;
        private String createdAt;
    }

    /** 某会话内匹配到的聊天记录汇总 */
    @Data
    @Builder
    public static class ConversationHit {
        private Long conversationId;
        private String conversationTitle;
        private Integer conversationType;
        private String avatarUrl;
        private Integer matchCount;
        /** 最近一条匹配内容预览 */
        private String preview;
        private String latestMsgId;
        private Integer latestMsgType;
        private String createdAt;
    }
}
