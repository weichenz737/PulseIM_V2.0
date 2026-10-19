package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_conversation")
public class ImConversation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Integer type;
    private String title;
    /** 对外展示和搜索的随机群 PulseID，避免暴露可递增的会话主键。 */
    private String groupPulseId;
    private String avatarUrl;
    private String lastMsgPreview;
    private OffsetDateTime lastMsgTime;
    private Long ownerId;
    private String notice;
    /** 新成员入群后自动发送的欢迎语。 */
    private String groupWelcomeMessage;
    /** 设置欢迎语时的操作者，发送时沿用该用户身份。 */
    private Long groupWelcomeSetterId;
    /** 全员禁言（群主/管理员仍可发言） */
    private Boolean muteAll;
    /** 加群是否需要群主/管理员审核 */
    private Boolean joinVerifyRequired;
    /** Whether members may add each other from this group. */
    private Boolean memberFriendAllowed;
    /** 群搜索方式：1 不可搜索，2 仅群号，3 群号及群名称关键词。 */
    private Integer searchMode;
    /** 是否允许普通群成员邀请好友入群。 */
    private Boolean memberInviteAllowed;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
