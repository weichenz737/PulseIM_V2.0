package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("im_favorite")
public class ImFavorite {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long conversationId;
    private String msgId;
    private Integer msgType;
    private String content;
    /** 聊天附件的稳定引用；收藏不依赖原消息仍然存在。 */
    private String fileId;
    /** JSON 数组：朋友圈收藏的图片/视频地址（普通消息收藏为空，图片在 content 里） */
    private String images;
    /** 逗号分隔：image/video，与 images 下标一一对应 */
    private String mediaTypes;
    /** 朋友圈收藏的 im_file 引用，与 images 下标一一对应。 */
    private String mediaFileIds;
    private String fromNickname;
    private String sourceTitle;
    private OffsetDateTime createdAt;
}
