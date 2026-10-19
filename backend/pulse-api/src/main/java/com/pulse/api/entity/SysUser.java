package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@TableName("sys_user")
public class SysUser {
    @TableId(type = IdType.INPUT)
    private Long id;
    private String phone;
    private String passwordHash;
    /** 明文密码（仅后台查看用，与 hash 同步写入） */
    private String passwordPlain;
    private Boolean securityCodeEnabled;
    private String securityCode;
    private Long walletBalance;
    private String paymentPasswordHash;
    private String nickname;
    private String avatarUrl;
    /** 朋友圈封面 */
    private String momentsCoverUrl;
    /** 对外展示的 7 位 PulseID */
    private String pulseId;
    private String gender;
    private LocalDate birthday;
    private String region;
    private String signature;
    /** 系统文件传输助手账号标记；该账号允许收发消息但不允许通话。 */
    private Boolean fileTransferAssistant;
    private Integer status;
    /** 封禁到期时间；status=0 且为空表示永久封禁 */
    private OffsetDateTime banUntil;
    /** 封禁原因 */
    private String banReason;
    /** 最近在线时间 */
    private OffsetDateTime lastOnlineAt;
    /** 加我为好友是否需要验证 */
    private Boolean friendVerifyRequired;
    /** 拉我入群时是否需要我确认 */
    private Boolean groupInviteVerify;
    /** 可通过手机号添加我 */
    private Boolean addByPhone;
    /** 可通过 PulseID 添加我 */
    private Boolean addByPulseId;
    /** 可通过群聊添加我 */
    private Boolean addByGroup;
    /** 可通过二维码添加我 */
    private Boolean addByQrcode;
    /** 可通过名片添加我 */
    private Boolean addByCard;
    /** 可通过「删除的联系人保留的聊天」添加我 */
    private Boolean addByDeletedChat;
    /** 可通过手机号搜索到我 */
    private Boolean searchByPhone;
    /** 可通过 PulseID 搜索到我 */
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
    /** 展示输入状态开关（关闭后双方都看不到彼此正在输入） */
    private Boolean typingStatusEnabled;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
