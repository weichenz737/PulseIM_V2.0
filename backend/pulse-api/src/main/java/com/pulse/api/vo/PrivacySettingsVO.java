package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PrivacySettingsVO {
    /** 加我为好友是否需要验证 */
    private Boolean friendVerifyRequired;
    /** 拉我入群时是否需要我确认 */
    private Boolean groupInviteVerify;
    /** 添加我的方式 */
    private Boolean addByPhone;
    private Boolean addByPulseId;
    private Boolean addByGroup;
    private Boolean addByQrcode;
    private Boolean addByCard;
    private Boolean addByDeletedChat;
    /** 可通过以下方式搜索到我 */
    private Boolean searchByPhone;
    private Boolean searchByPulseId;
    /**
     * 允许朋友查看朋友圈的范围：
     * all / half_year / month / three_days
     */
    private String momentsVisibleRange;
    /** 允许陌生人查看十条朋友圈 */
    private Boolean momentsStrangerTen;
    /** 隐藏我的在线状态（开启后双方都看不到彼此在线状态） */
    private Boolean hideOnlineStatus;
    /** 已读回执开关（关闭后双方都看不到是否已读，群聊同样生效） */
    private Boolean readReceiptEnabled;
    /** 展示输入状态开关（双方都开启时才展示） */
    private Boolean typingStatusEnabled;
}
