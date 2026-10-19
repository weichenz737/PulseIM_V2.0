package com.pulse.api.vo;

import java.time.LocalDate;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ContactVO {
    private Long userId;
    /** 7 位对外 PulseID */
    private String pulseId;
    private String nickname;
    /** 当前查看者视角的展示名：后台客服昵称＞好友备注＞用户昵称。 */
    private String displayName;
    private String avatarUrl;
    private Boolean online;
    /** 在线状态被隐藏（开启隐藏在线状态后双方都不展示） */
    private Boolean onlineHidden;
    private String letter;
    private String remark;
    private LocalDate birthday;
    private String signature;
    /** 好友标签（用户端展示） */
    private String tag;
    /** 好友添加来源，用于区分后台托管的默认好友 */
    private String friendAddSource;
    /** 是否为系统文件传输助手账号。 */
    private Boolean fileTransferAssistant;
}
