package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("moment_post")
public class MomentPost {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String content;
    private String images;
    /** 预览图对应的原图/原视频地址，逗号分隔。 */
    private String originalImages;
    /** image/video，和 images 下标一一对应。 */
    private String mediaTypes;
    /** im_file.file_id，和 images 下标一一对应；旧动态可能为空。 */
    private String mediaFileIds;
    /** 0=好友可见 1=仅自己 2=选择好友可见（3=所有人可见已取消） */
    private Integer visibility;
    /** 逗号分隔的被提醒用户 ID */
    private String mentionUserIds;
    /** visibility=2 时可见好友 ID，逗号分隔 */
    private String visibleUserIds;
    private String locationName;
    private String locationAddress;
    private Double latitude;
    private Double longitude;
    private Integer likeCount;
    private Integer commentCount;
    private OffsetDateTime createdAt;
    /** 软删除：用户/管理端删除后仍保留记录供后台查看（不用 deleted，避免 MP 全局逻辑删除） */
    private Boolean removed;
    private OffsetDateTime removedAt;
    /** user / admin */
    private String removedBy;
}
