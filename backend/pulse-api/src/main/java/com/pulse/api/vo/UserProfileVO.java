package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

@Data
@Builder
public class UserProfileVO {
    private Long userId;
    /** 7 位对外 PulseID */
    private String pulseId;
    private String nickname;
    /** 当前查看者视角的展示名。 */
    private String displayName;
    private String avatarUrl;
    /** 朋友圈封面 */
    private String momentsCoverUrl;
    private String gender;
    private LocalDate birthday;
    private String region;
    private String signature;
    private String phone;
    /** 系统文件传输助手不能发起或接听通话。 */
    private Boolean fileTransferAssistant;
    /** 当前登录用户是否已加对方为好友 */
    private Boolean friend;
    /**
     * 与对方的好友申请状态：
     * none / pending_sent / pending_received / friend / blocked
     */
    private String friendStatus;
    /** 当前登录用户是否已拉黑对方 */
    private Boolean blocked;
    /** 对方是否已将当前登录用户拉黑 */
    private Boolean blockedByPeer;
    /** 共同群聊数量（查看他人资料时） */
    private Integer commonGroupCount;
    /** 我对对方的备注名 */
    private String remark;
    /** 好友标签（如默认好友后台配置） */
    private String tag;
    /** 好友添加来源 */
    private String friendAddSource;
    /** 发起添加的用户 ID */
    private Long friendAddInitiatorId;
    /** 成为好友的时间 */
    private java.time.OffsetDateTime friendSince;
    /** 不看对方的朋友圈 */
    private Boolean hideHisMoments;
    /** 不让对方看我的朋友圈 */
    private Boolean rejectHisMoments;
}
