package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("moment_comment")
public class MomentComment {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long postId;
    private Long userId;
    private String content;
    /** 回复的评论 ID（可空） */
    private Long replyToCommentId;
    /** 评论图片 URL（可空，一张） */
    private String imageUrl;
    /** 新版评论图片引用；文件本体位于对象存储。 */
    private String imageFileId;
    private OffsetDateTime createdAt;
}
