package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** 免打扰会话中仍需提醒的群消息类型。 */
@Data
@Builder
public class ImportantNotificationSettingVO {
    private Boolean atAll;
    private Boolean mentionMe;
    private Boolean replyMe;
    private Boolean announcement;
    private List<Long> followedMemberIds;
}
