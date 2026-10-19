package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@Builder
public class AdminFavoriteVO {
    private Long id;
    private Long conversationId;
    private String msgId;
    private Integer msgType;
    private String msgTypeLabel;
    private String content;
    private String contentPreview;
    private String fromNickname;
    private String sourceTitle;
    private OffsetDateTime createdAt;
    /** 收藏所属用户（全局收藏列表用） */
    private Long ownerUserId;
    private String ownerNickname;
    private String ownerPhone;
    private String ownerPulseId;
}
