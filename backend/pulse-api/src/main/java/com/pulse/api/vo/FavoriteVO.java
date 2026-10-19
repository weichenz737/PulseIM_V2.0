package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class FavoriteVO {
    private Long id;
    private Long conversationId;
    private String msgId;
    private Integer msgType;
    private String content;
    private String fileId;
    private List<String> images;
    private List<String> mediaTypes;
    private List<String> mediaFileIds;
    private String fromNickname;
    private String sourceTitle;
    private OffsetDateTime createdAt;
}
